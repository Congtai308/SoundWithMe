import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, isValidObjectId } from "mongoose";
import { ERROR_CODES } from "@soundwithme/constants";
import { MAX_FRIENDS } from "@soundwithme/validation";
import type { FriendRequest, PublicUser, UserSearchResult } from "@soundwithme/types";
import { FriendshipDocument, pairKeyOf } from "../../database/mongodb/models/friendship.schema";
import { AppEventsService } from "../../common/events/app-events.service";
import { UsersService } from "../users/users.service";
import { NotificationsService } from "../notifications/notifications.service";

/** Requests someone can have waiting on others at once — stops request spam. */
const MAX_OUTGOING_REQUESTS = 50;
const SEARCH_LIMIT = 10;

interface Actor {
  id: string;
  displayName: string;
}

/** Friend requests and the friendship graph. Knows nothing about rooms. */
@Injectable()
export class FriendshipsService {
  private readonly logger = new Logger(FriendshipsService.name);

  constructor(
    @InjectModel(FriendshipDocument.name) private readonly model: Model<FriendshipDocument>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly events: AppEventsService,
  ) {}

  async areFriends(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    return (await this.model.exists({ pairKey: pairKeyOf(a, b), status: "accepted" }).exec()) !== null;
  }

  /** Everyone `userId` is friends with, and since when. */
  async friendsOf(userId: string): Promise<{ userId: string; since: Date }[]> {
    const docs = await this.model
      .find({ status: "accepted", $or: [{ requesterId: userId }, { addresseeId: userId }] })
      .limit(MAX_FRIENDS)
      .exec();
    return docs.map((doc) => ({
      userId: doc.requesterId === userId ? doc.addresseeId : doc.requesterId,
      since: doc.acceptedAt ?? doc.createdAt,
    }));
  }

  async friendIdsOf(userId: string): Promise<string[]> {
    return (await this.friendsOf(userId)).map((f) => f.userId);
  }

  /**
   * Sends a request to `username`. If they had already asked you, this
   * accepts theirs instead — the two of you are friends either way.
   */
  async sendRequest(actor: Actor, username: string): Promise<{ status: "requested" | "accepted" }> {
    const target = await this.usersService.findByUsername(username);
    if (!target) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.USER_NOT_FOUND, message: "No one has that username" },
      });
    }
    if (target.id === actor.id) {
      throw new BadRequestException({
        success: false,
        error: { code: ERROR_CODES.CANNOT_FRIEND_SELF, message: "That's you!" },
      });
    }

    const existing = await this.model.findOne({ pairKey: pairKeyOf(actor.id, target.id) }).exec();
    if (existing?.status === "accepted") {
      throw new ConflictException({
        success: false,
        error: { code: ERROR_CODES.ALREADY_FRIENDS, message: `You're already friends with ${target.displayName}` },
      });
    }
    if (existing && existing.requesterId === actor.id) {
      throw new ConflictException({
        success: false,
        error: { code: ERROR_CODES.FRIEND_REQUEST_EXISTS, message: "Request already sent — waiting for them" },
      });
    }
    if (existing) {
      await this.accept(actor, existing.id);
      return { status: "accepted" };
    }

    await this.assertCanAddFriend(actor.id);
    const outgoing = await this.model.countDocuments({ requesterId: actor.id, status: "pending" }).exec();
    if (outgoing >= MAX_OUTGOING_REQUESTS) {
      throw new ConflictException({
        success: false,
        error: {
          code: ERROR_CODES.FRIEND_LIMIT,
          message: `You have ${MAX_OUTGOING_REQUESTS} requests waiting — let some get answered first`,
        },
      });
    }

    try {
      await this.model.create({ pairKey: pairKeyOf(actor.id, target.id), requesterId: actor.id, addresseeId: target.id });
    } catch (error: unknown) {
      // They asked us at the very same moment: the unique pair won, so go again (now an accept).
      if (isDuplicateKey(error)) return this.sendRequest(actor, username);
      throw error;
    }

    this.events.emit("user.friendsChanged", { userIds: [actor.id, target.id] });
    void this.notificationsService
      .notify(target.id, {
        type: "friend_request",
        title: "New friend request",
        body: `${actor.displayName} wants to be friends`,
        link: "/friends",
        actorId: actor.id,
      })
      .catch((error: unknown) => this.logFailure("friend request notification", error));
    return { status: "requested" };
  }

  async accept(actor: Actor, requestId: string): Promise<void> {
    const request = await this.findPending(requestId);
    if (!request || request.addresseeId !== actor.id) throw this.requestNotFound();
    await this.assertCanAddFriend(actor.id);
    await this.assertCanAddFriend(request.requesterId);

    const updated = await this.model
      .updateOne({ _id: request._id, status: "pending" }, { status: "accepted", acceptedAt: new Date() })
      .exec();
    if (updated.modifiedCount === 0) throw this.requestNotFound();

    this.events.emit("user.friendsChanged", { userIds: [actor.id, request.requesterId] });
    void this.notificationsService
      .notify(request.requesterId, {
        type: "friend_accepted",
        title: "Friend request accepted",
        body: `${actor.displayName} accepted your friend request`,
        link: "/friends",
        actorId: actor.id,
      })
      .catch((error: unknown) => this.logFailure("friend accepted notification", error));
  }

  /** Decline (if it's to you) or cancel (if it's yours). */
  async dismiss(userId: string, requestId: string): Promise<void> {
    const request = await this.findPending(requestId);
    if (!request || (request.addresseeId !== userId && request.requesterId !== userId)) throw this.requestNotFound();
    await this.model.deleteOne({ _id: request._id, status: "pending" }).exec();
    this.events.emit("user.friendsChanged", { userIds: [request.requesterId, request.addresseeId] });
  }

  async unfriend(userId: string, friendId: string): Promise<void> {
    const removed = await this.model.deleteOne({ pairKey: pairKeyOf(userId, friendId), status: "accepted" }).exec();
    if (removed.deletedCount === 0) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.NOT_FRIENDS, message: "You're not friends with them" },
      });
    }
    this.events.emit("user.friendsChanged", { userIds: [userId, friendId] });
  }

  async pendingRequests(userId: string): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
    const docs = await this.model
      .find({ status: "pending", $or: [{ requesterId: userId }, { addresseeId: userId }] })
      .sort({ createdAt: -1 })
      .limit(MAX_OUTGOING_REQUESTS * 4)
      .exec();
    const users = await this.publicUsers(docs.map((d) => (d.requesterId === userId ? d.addresseeId : d.requesterId)));
    const incoming: FriendRequest[] = [];
    const outgoing: FriendRequest[] = [];
    for (const doc of docs) {
      const direction = doc.addresseeId === userId ? "incoming" : "outgoing";
      const user = users.get(direction === "incoming" ? doc.requesterId : doc.addresseeId);
      if (!user) continue; // the other account no longer exists
      (direction === "incoming" ? incoming : outgoing).push({
        id: doc.id,
        user,
        direction,
        createdAt: doc.createdAt.toISOString(),
      });
    }
    return { incoming, outgoing };
  }

  /** People to add, by username or display name, each with how they relate to you. */
  async search(userId: string, query: string): Promise<UserSearchResult[]> {
    const users = await this.usersService.search(query, SEARCH_LIMIT);
    const pairs = await this.model.find({ pairKey: { $in: users.map((u) => pairKeyOf(userId, u.id)) } }).exec();
    const byPair = new Map(pairs.map((p) => [p.pairKey, p]));
    return users.map((user) => {
      const pair = byPair.get(pairKeyOf(userId, user.id));
      let relation: UserSearchResult["relation"] = "none";
      if (user.id === userId) relation = "self";
      else if (pair?.status === "accepted") relation = "friend";
      else if (pair) relation = pair.requesterId === userId ? "outgoing" : "incoming";
      return { user: this.usersService.toPublicUser(user), relation };
    });
  }

  async publicUsers(ids: string[]): Promise<Map<string, PublicUser>> {
    const map = new Map<string, PublicUser>();
    for (const user of await this.usersService.findManyByIds([...new Set(ids)])) {
      map.set(user.id, this.usersService.toPublicUser(user));
    }
    return map;
  }

  private async assertCanAddFriend(userId: string): Promise<void> {
    const count = await this.model
      .countDocuments({ status: "accepted", $or: [{ requesterId: userId }, { addresseeId: userId }] })
      .exec();
    if (count >= MAX_FRIENDS) {
      throw new ConflictException({
        success: false,
        error: { code: ERROR_CODES.FRIEND_LIMIT, message: `Friend lists hold up to ${MAX_FRIENDS} people` },
      });
    }
  }

  private async findPending(requestId: string): Promise<FriendshipDocument | null> {
    if (!isValidObjectId(requestId)) return null;
    return this.model.findOne({ _id: requestId, status: "pending" }).exec();
  }

  private requestNotFound(): NotFoundException {
    return new NotFoundException({
      success: false,
      error: { code: ERROR_CODES.FRIEND_REQUEST_NOT_FOUND, message: "That request is no longer there" },
    });
  }

  private logFailure(what: string, error: unknown): void {
    this.logger.warn(`${what} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
}
