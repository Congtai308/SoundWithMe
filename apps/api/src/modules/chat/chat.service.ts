import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, isValidObjectId } from "mongoose";
import type { ChatMessage } from "@soundwithme/types";
import type { GetMessagesQuery } from "@soundwithme/validation";
import { ERROR_CODES } from "@soundwithme/constants";
import { ChatMessageDocument } from "../../database/mongodb/models/chat-message.schema";
import { RoomsService } from "../rooms/rooms.service";

interface ChatAuthor {
  id: string;
  displayName: string;
}

// C0/C1 control characters except tab and newline — they break rendering and logs.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatMessageDocument.name) private readonly messageModel: Model<ChatMessageDocument>,
    private readonly roomsService: RoomsService,
  ) {}

  /**
   * Persists a message from an active member of a room that has chat
   * enabled. Content is stored as plain text (clients render it as text,
   * never as HTML); only control characters are stripped here.
   */
  async send(roomId: string, author: ChatAuthor, rawContent: string): Promise<ChatMessage> {
    const room = await this.roomsService.getRoomForActiveMember(roomId, author.id);
    if (!room.settings.chatEnabled) {
      throw new ForbiddenException({
        success: false,
        error: { code: ERROR_CODES.CHAT_DISABLED, message: "Chat is turned off in this room" },
      });
    }
    if (room.mutedUserIds.includes(author.id)) {
      throw new ForbiddenException({
        success: false,
        error: { code: ERROR_CODES.CHAT_MUTED, message: "The host muted you in this room's chat" },
      });
    }

    const content = rawContent.replace(CONTROL_CHARACTERS, "").trim();
    if (!content) {
      throw new ForbiddenException({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Message is empty" },
      });
    }

    const doc = await this.messageModel.create({
      roomId,
      userId: author.id,
      authorName: author.displayName,
      content,
    });
    return this.toChatMessage(doc);
  }

  /** Newest-first page of a room's history, cursor-paginated on _id. */
  async history(
    roomId: string,
    userId: string,
    query: GetMessagesQuery,
  ): Promise<{ items: ChatMessage[]; nextCursor: string | null }> {
    await this.roomsService.getRoomForActiveMember(roomId, userId);

    const filter: Record<string, unknown> = { roomId, deletedAt: null };
    if (query.cursor && isValidObjectId(query.cursor)) {
      filter._id = { $lt: query.cursor };
    }

    const docs = await this.messageModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .exec();
    const hasMore = docs.length > query.limit;
    const page = hasMore ? docs.slice(0, query.limit) : docs;

    return {
      items: page.map((doc) => this.toChatMessage(doc)),
      nextCursor: hasMore ? String(page[page.length - 1]!._id) : null,
    };
  }

  private toChatMessage(doc: ChatMessageDocument): ChatMessage {
    return {
      id: doc.id,
      roomId: doc.roomId,
      userId: doc.userId,
      authorName: doc.authorName,
      content: doc.content,
      createdAt: doc.createdAt.toISOString(),
      editedAt: doc.editedAt ? doc.editedAt.toISOString() : null,
      deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
    };
  }
}
