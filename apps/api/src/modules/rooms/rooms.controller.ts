import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  createRoomSchema,
  getRoomQuerySchema,
  joinRoomSchema,
  listRoomsQuerySchema,
  updateRoomSchema,
  type CreateRoomInput,
  type GetRoomQuery,
  type JoinRoomInput,
  type ListRoomsQuery,
  type UpdateRoomInput,
} from "@soundwithme/validation";
import type { AuthenticatedUser } from "@soundwithme/types";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserThrottlerGuard } from "../../common/guards/user-throttler.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RoomsService } from "./rooms.service";

// Every route here requires an authenticated user — including browsing
// (GET). Anonymous room browsing is a reasonable future enhancement, but
// auth-gating everything by default is the safer starting point.
@UseGuards(JwtAuthGuard)
@Controller("rooms")
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  /**
   * One live room per host is the real limit (RoomsService); this caps how
   * fast someone can open-and-end rooms in a loop to spam friends' bells.
   */
  @Post()
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 6, ttl: 10 * 60_000 } })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createRoomSchema)) body: CreateRoomInput,
  ) {
    const room = await this.roomsService.createRoom(user, body);
    return { success: true, data: { room } };
  }

  @Get()
  async list(@Query(new ZodValidationPipe(listRoomsQuerySchema)) query: ListRoomsQuery) {
    const page = await this.roomsService.listActivePublicRooms(query);
    return { success: true, data: page };
  }

  /** The live room you host, or null. */
  @Get("mine/active")
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: { room: await this.roomsService.getActiveHostedRoom(user.id) } };
  }

  @Get(":id")
  async getOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(getRoomQuerySchema)) query: GetRoomQuery,
  ) {
    const room = await this.roomsService.getRoomForUser(id, user.id, query.invite);
    return { success: true, data: { room } };
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateRoomSchema)) body: UpdateRoomInput,
  ) {
    const room = await this.roomsService.updateRoom(id, user.id, body);
    return { success: true, data: { room } };
  }

  @Post(":id/invite")
  @HttpCode(200)
  async regenerateInvite(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const room = await this.roomsService.regenerateInvite(id, user.id);
    return { success: true, data: { room } };
  }

  /** Wrong passcodes are throttled per user so a passcode can't be guessed by brute force. */
  @Post(":id/join")
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async join(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(joinRoomSchema)) body: JoinRoomInput,
  ) {
    const member = await this.roomsService.joinRoom(id, user.id, body ?? {});
    return { success: true, data: { member } };
  }

  @Post(":id/leave")
  async leave(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.roomsService.leaveRoom(id, user.id);
    return { success: true, data: { status: "ok" } };
  }
}
