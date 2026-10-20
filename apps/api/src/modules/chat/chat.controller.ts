import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import type { AuthenticatedUser } from "@soundwithme/types";
import { getMessagesQuerySchema, type GetMessagesQuery } from "@soundwithme/validation";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ChatService } from "./chat.service";

/** Chat history over REST; new messages are sent and received over Socket.IO. */
@UseGuards(JwtAuthGuard)
@Controller("rooms/:roomId/messages")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  async list(
    @Param("roomId") roomId: string,
    @Query(new ZodValidationPipe(getMessagesQuerySchema)) query: GetMessagesQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const page = await this.chatService.history(roomId, user.id, query);
    return { success: true, data: page };
  }
}
