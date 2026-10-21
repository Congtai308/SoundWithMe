import { HttpException, HttpStatus, UseFilters } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { z } from "zod";
import { ERROR_CODES, SOCKET_EVENTS } from "@soundwithme/constants";
import { REACTION_EMOJIS, type ReactionEmoji } from "@soundwithme/types";
import { sendMessageSchema, type SendMessageInput } from "@soundwithme/validation";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ChatService } from "../../modules/chat/chat.service";
import { WsExceptionFilter } from "../ws-exception.filter";
import { RATE_LIMITS, assertJoined, consumeRateLimit } from "../socket-guards";
import type { AppServer, AppSocket } from "../realtime.types";

const reactionSchema = z.object({
  roomId: z.string().min(1),
  emoji: z.enum(REACTION_EMOJIS),
});
type ReactionInput = { roomId: string; emoji: ReactionEmoji };

/** Live chat (persisted) and reactions (transient — never written to MongoDB). */
@UseFilters(WsExceptionFilter)
@WebSocketGateway({ namespace: "/" })
export class SocialGateway {
  @WebSocketServer()
  private readonly server!: AppServer;

  constructor(private readonly chatService: ChatService) {}

  @SubscribeMessage(SOCKET_EVENTS.CHAT_MESSAGE)
  async onChatMessage(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(sendMessageSchema)) { roomId, content }: SendMessageInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.chat);
    const message = await this.chatService.send(roomId, client.data.user, content);
    this.server.to(roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, message);
  }

  /**
   * Reactions fire in bursts, so they are checked against the room settings
   * captured at ROOM_JOIN instead of hitting MongoDB per emoji.
   */
  @SubscribeMessage(SOCKET_EVENTS.REACTION_SEND)
  onReaction(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(reactionSchema)) { roomId, emoji }: ReactionInput,
  ): void {
    assertJoined(client, roomId);
    if (client.data.joinedRooms[roomId]?.reactionsEnabled === false) {
      throw new HttpException(
        { success: false, error: { code: ERROR_CODES.REACTIONS_DISABLED, message: "Reactions are off in this room" } },
        HttpStatus.FORBIDDEN,
      );
    }
    consumeRateLimit(client, RATE_LIMITS.reaction);
    this.server.to(roomId).emit(SOCKET_EVENTS.REACTION_SEND, {
      roomId,
      userId: client.data.user.id,
      displayName: client.data.user.displayName,
      emoji,
      sentAt: new Date().toISOString(),
    });
  }
}
