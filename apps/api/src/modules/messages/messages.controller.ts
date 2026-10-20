import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedUser } from "@soundwithme/types";
import {
  directMessagesQuerySchema,
  sendDirectMessageSchema,
  type DirectMessagesQuery,
  type SendDirectMessageInput,
} from "@soundwithme/validation";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { UserThrottlerGuard } from "../../common/guards/user-throttler.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MessagesService } from "./messages.service";

/** Direct messages over REST; new ones and read receipts also arrive over Socket.IO. */
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller("messages")
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get("conversations")
  async conversations(@CurrentUser() user: AuthenticatedUser) {
    const [conversations, unread] = await Promise.all([
      this.messagesService.conversations(user.id),
      this.messagesService.unreadCount(user.id),
    ]);
    return { success: true, data: { conversations, unread } };
  }

  @Get("with/:userId")
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId") otherId: string,
    @Query(new ZodValidationPipe(directMessagesQuerySchema)) query: DirectMessagesQuery,
  ) {
    return { success: true, data: await this.messagesService.history(user.id, otherId, query) };
  }

  @Post("with/:userId")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId") otherId: string,
    @Body(new ZodValidationPipe(sendDirectMessageSchema)) body: SendDirectMessageInput,
  ) {
    return { success: true, data: { message: await this.messagesService.send(user.id, otherId, body) } };
  }

  @Post("with/:userId/read")
  @HttpCode(HttpStatus.OK)
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param("userId") otherId: string) {
    await this.messagesService.markRead(user.id, otherId);
    return { success: true, data: { status: "ok" } };
  }
}
