import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, isValidObjectId } from "mongoose";
import type { Conversation, DirectMessage, DirectMessagesPage, SharedRoom, SharedTrack } from "@soundwithme/types";
import type { DirectMessagesQuery, SendDirectMessageInput } from "@soundwithme/validation";
import { ERROR_CODES } from "@soundwithme/constants";
import { DirectMessageDocument } from "../../database/mongodb/models/direct-message.schema";
import { AppEventsService } from "../../common/events/app-events.service";
import { FriendshipsService } from "../friends/friendships.service";
import { MusicService } from "../music/music.service";
import { RoomsService } from "../rooms/rooms.service";

// C0/C1 control characters except tab and newline — they break rendering and logs.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
/** The inbox lists this many conversations, newest first. */
const INBOX_SIZE = 50;

/** The same id from both sides of a conversation. */
export function conversationIdOf(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Direct messages between friends: text, a shared song, or an invite to a
 * room. Stored as plain text (clients render text, never HTML); new
 * messages and read receipts reach both people's sockets through
 * `user.directMessage` / `user.messagesRead`.
 */
@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(DirectMessageDocument.name) private readonly model: Model<DirectMessageDocument>,
    private readonly friendships: FriendshipsService,
    private readonly musicService: MusicService,
    private readonly roomsService: RoomsService,
    private readonly events: AppEventsService,
  ) {}

  async send(senderId: string, recipientId: string, input: SendDirectMessageInput): Promise<DirectMessage> {
    await this.assertCanMessage(senderId, recipientId);
    const content = (input.content ?? "").replace(CONTROL_CHARACTERS, "").trim();

    let track: SharedTrack | null = null;
    let room: SharedRoom | null = null;
    if (input.kind === "text" && !content) {
      throw new BadRequestException({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Message is empty" },
      });
    }
    if (input.kind === "track") {
      const found = await this.musicService.getTrackWithArtist(input.trackId);
      if (!found) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.TRACK_NOT_FOUND, message: "Track not found" },
        });
      }
      track = {
        id: found.id,
        title: found.title,
        artistName: found.artistName,
        artworkUrl: found.artworkUrl,
        durationMs: found.durationMs,
      };
    }
    if (input.kind === "room") {
      // Same rules as a bell invite: you must be in the room, and private rooms are the host's to share.
      const invite = await this.roomsService.inviteLinkFor(input.roomId, senderId, recipientId);
      room = { id: invite.room.id, name: invite.room.name, link: invite.link };
    }

    const doc = await this.model.create({
      conversationId: conversationIdOf(senderId, recipientId),
      senderId,
      recipientId,
      kind: input.kind,
      content,
      track,
      room,
    });
    const message = toDirectMessage(doc);
    this.events.emit("user.directMessage", { message });
    return message;
  }

  /** Newest-first page of one conversation. */
  async history(userId: string, otherId: string, query: DirectMessagesQuery): Promise<DirectMessagesPage> {
    if (!isValidObjectId(otherId)) throw this.notFriends();
    const filter: Record<string, unknown> = { conversationId: conversationIdOf(userId, otherId) };
    if (query.cursor && isValidObjectId(query.cursor)) filter._id = { $lt: query.cursor };
    const docs = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .exec();
    const hasMore = docs.length > query.limit;
    const page = hasMore ? docs.slice(0, query.limit) : docs;
    return { items: page.map(toDirectMessage), nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  /**
   * The inbox: each conversation's newest message and unread count. People
   * who are no longer friends still show up (history stays readable), but
   * can't be written to.
   */
  async conversations(userId: string): Promise<Conversation[]> {
    const latest = await this.model
      .aggregate<{ _id: string; doc: DirectMessageDocument }>([
        { $match: { $or: [{ senderId: userId }, { recipientId: userId }] } },
        { $sort: { _id: -1 } },
        { $group: { _id: "$conversationId", doc: { $first: "$$ROOT" } } },
        { $sort: { "doc._id": -1 } },
        { $limit: INBOX_SIZE },
      ])
      .exec();
    if (latest.length === 0) return [];

    const unread = await this.model
      .aggregate<{ _id: string; count: number }>([
        { $match: { recipientId: userId, readAt: null, conversationId: { $in: latest.map((c) => c._id) } } },
        { $group: { _id: "$conversationId", count: { $sum: 1 } } },
      ])
      .exec();
    const unreadBy = new Map(unread.map((u) => [u._id, u.count]));
    const otherIds = latest.map(({ doc }) => (doc.senderId === userId ? doc.recipientId : doc.senderId));
    const users = await this.friendships.publicUsers(otherIds);

    return latest.flatMap(({ _id, doc }, index) => {
      const user = users.get(otherIds[index]!);
      if (!user) return []; // the account is gone
      return [{ user, lastMessage: toDirectMessage(doc), unread: unreadBy.get(_id) ?? 0 }];
    });
  }

  /** Total unread messages, for the nav badge. */
  async unreadCount(userId: string): Promise<number> {
    return this.model.countDocuments({ recipientId: userId, readAt: null }).exec();
  }

  /** Marks everything the other person sent in this conversation as read. */
  async markRead(userId: string, otherId: string): Promise<void> {
    if (!isValidObjectId(otherId)) return;
    const conversationId = conversationIdOf(userId, otherId);
    const readAt = new Date();
    const result = await this.model
      .updateMany({ conversationId, recipientId: userId, readAt: null }, { $set: { readAt } })
      .exec();
    if (result.modifiedCount > 0) {
      this.events.emit("user.messagesRead", { conversationId, readerId: userId, otherId, readAt: readAt.toISOString() });
    }
  }

  private async assertCanMessage(senderId: string, recipientId: string): Promise<void> {
    if (senderId === recipientId || !isValidObjectId(recipientId)) throw this.notFriends();
    if (!(await this.friendships.areFriends(senderId, recipientId))) throw this.notFriends();
  }

  private notFriends(): ForbiddenException {
    return new ForbiddenException({
      success: false,
      error: { code: ERROR_CODES.NOT_FRIENDS, message: "You can only message your friends" },
    });
  }
}

function toDirectMessage(doc: DirectMessageDocument): DirectMessage {
  return {
    id: String(doc._id),
    conversationId: doc.conversationId,
    senderId: doc.senderId,
    recipientId: doc.recipientId,
    kind: doc.kind,
    content: doc.content ?? "",
    track: doc.track ?? null,
    room: doc.room ?? null,
    readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}
