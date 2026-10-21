import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  friendRequestSchema,
  userSearchQuerySchema,
  type FriendRequestInput,
  type UserSearchQuery,
} from "@soundwithme/validation";
import type { AuthenticatedUser } from "@soundwithme/types";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserThrottlerGuard } from "../../common/guards/user-throttler.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { FriendsService } from "./friends.service";
import { FriendshipsService } from "./friendships.service";

@UseGuards(JwtAuthGuard)
@Controller("friends")
export class FriendsController {
  constructor(
    private readonly friendsService: FriendsService,
    private readonly friendships: FriendshipsService,
  ) {}

  @Get()
  async overview(@CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: await this.friendsService.overview(user.id) };
  }

  @Get("search")
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(userSearchQuerySchema)) query: UserSearchQuery,
  ) {
    return { success: true, data: { results: await this.friendships.search(user.id, query.q) } };
  }

  @Post("requests")
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async request(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(friendRequestSchema)) body: FriendRequestInput,
  ) {
    return { success: true, data: await this.friendships.sendRequest(user, body.username) };
  }

  @Post("requests/:id/accept")
  @HttpCode(200)
  async accept(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    await this.friendships.accept(user, id);
    return { success: true, data: { status: "accepted" } };
  }

  /** Decline a request to you, or cancel one you sent. */
  @Delete("requests/:id")
  async dismiss(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    await this.friendships.dismiss(user.id, id);
    return { success: true, data: { status: "ok" } };
  }

  @Delete(":userId")
  async unfriend(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    await this.friendships.unfriend(user.id, userId);
    return { success: true, data: { status: "ok" } };
  }
}
