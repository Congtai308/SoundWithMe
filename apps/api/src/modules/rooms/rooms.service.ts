import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, isValidObjectId } from "mongoose";
import * as bcrypt from "bcrypt";
import { randomBytes, timingSafeEqual } from "crypto";
import {
  DEFAULT_ROOM_SINGERS,
  DUO_MAX_LISTENERS,
  MAX_ROOM_DJS,
  MAX_ROOM_LISTENERS,
  MAX_ROOM_SINGERS,
  type CreateRoomInput,
  type JoinRoomInput,
  type ListRoomsQuery,
  type UpdateRoomInput,
} from "@soundwithme/validation";
import type { Room, RoomCloseReason, RoomMember, RoomSettings } from "@soundwithme/types";
import { ERROR_CODES } from "@soundwithme/constants";
import { RoomDocument } from "../../database/mongodb/models/room.schema";
import { RoomMemberDocument } from "../../database/mongodb/models/room-member.schema";
import { AppEventsService } from "../../common/events/app-events.service";
import { RedisService } from "../../database/redis/redis.service";
import { FriendshipsService, isDuplicateKey } from "../friends/friendships.service";
import { NotificationsService } from "../notifications/notifications.service";

/** People the host has removed from one room; beyond this the oldest bans drop off. */
const MAX_BANNED = 500;
const PASSCODE_HASH_ROUNDS = 10;
/** Wrong passcodes one room takes per window, from everyone together. */
const PASSCODE_ATTEMPTS_PER_ROOM = 10;
const PASSCODE_WINDOW_SECONDS = 60 * 60;
const INVITE_CODE_BYTES = 12;

const DEFAULT_SETTINGS: RoomSettings = {
  whoCanControlPlayback: "host",
  whoCanAddSongs: "everyone",
  chatEnabled: true,
  reactionsEnabled: true,
  songRequestsEnabled: true,
  maxListeners: 50,
  maxSingers: DEFAULT_ROOM_SINGERS,
};

interface Actor {
  id: string;
  displayName: string;
}

/**
 * Rooms and who may be in them.
 *
 * Rules (enforced here, mirrored by the UI):
 * - One live room per host. End it (or hand it over) before opening another;
 *   a unique index on active rooms backs this against racing requests.
 * - public / duo: anyone with the link can join (duo holds 2).
 * - friends: only the host's friends.
 * - private: only with the invite link, or the passcode if the host set one.
 *   Non-members can't see it at all without one of them.
 * - Removed (kicked) users can't come back to that room.
 * - A room ends when its host ends it, or after 30 minutes with nobody
 *   connected (RoomSweeper).
 */
@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    @InjectModel(RoomDocument.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(RoomMemberDocument.name)
    private readonly memberModel: Model<RoomMemberDocument>,
    private readonly friendships: FriendshipsService,
    private readonly notifications: NotificationsService,
    private readonly events: AppEventsService,
    private readonly redisService: RedisService,
  ) {}

  async createRoom(host: Actor, input: CreateRoomInput): Promise<Room> {
    const existing = await this.findActiveHostedRoom(host.id);
    if (existing) throw this.roomLimitReached(existing);

    const isPrivate = input.type === "private";
    // No Mongo transaction: the docker-compose Mongo is a standalone node
    // (no multi-document transactions). Two sequential writes is the
    // accepted trade-off here; the unique index still guards the room itself.
    let room: RoomDocument;
    try {
      room = await this.roomModel.create({
        name: input.name,
        description: input.description ?? null,
        hostId: host.id,
        type: input.type,
        status: "active",
        settings: normalizeSettings(input.type, { ...DEFAULT_SETTINGS, ...input.settings }),
        memberCount: 1,
        inviteCode: isPrivate ? newInviteCode() : null,
        passcodeHash: isPrivate && input.passcode ? await bcrypt.hash(input.passcode, PASSCODE_HASH_ROUNDS) : null,
        hasPasscode: isPrivate && Boolean(input.passcode),
      });
    } catch (error: unknown) {
      if (isDuplicateKey(error)) {
        const winner = await this.findActiveHostedRoom(host.id);
        if (winner) throw this.roomLimitReached(winner);
      }
      throw error;
    }

    await this.memberModel.create({ roomId: room.id, userId: host.id, role: "host" });
    void this.tellFriendsAboutRoom(host, room).catch((error: unknown) =>
      this.logger.warn(`Friend notifications for room ${room.id} failed: ${String(error)}`),
    );
    return this.toRoom(room, host.id);
  }

  /** The live room this user hosts, if any — for "you're already hosting…" in the UI. */
  async getActiveHostedRoom(userId: string): Promise<Room | null> {
    const room = await this.findActiveHostedRoom(userId);
    return room ? this.toRoom(room, userId) : null;
  }

  /**
   * The room as `userId` may see it. Private rooms are visible to their
   * members, and to anyone holding the invite code; everyone else gets
   * ROOM_LOCKED (with whether a passcode would work) — never the details.
   */
  async getRoomForUser(roomId: string, userId: string, invite?: string): Promise<Room> {
    const room = await this.findRoomOrThrow(roomId);
    if (room.type === "private" && room.hostId !== userId && room.status === "active") {
      const isMember = await this.isActiveMember(roomId, userId);
      if (!isMember && !this.inviteMatches(room, invite)) {
        throw new ForbiddenException({
          success: false,
          error: {
            code: ERROR_CODES.ROOM_LOCKED,
            message: room.hasPasscode
              ? "This room is private. Open the invite link, or enter the passcode."
              : "This room is invite-only. Ask the host for the link.",
            details: { roomId, hasPasscode: room.hasPasscode },
          },
        });
      }
    }
    return this.toRoom(room, userId);
  }

  /**
   * For realtime subscriptions: the room must still be active and the user
   * a current member (host included). Joining itself happens over REST.
   */
  async getRoomForActiveMember(roomId: string, userId: string): Promise<Room> {
    const room = await this.findRoomOrThrow(roomId);
    if (room.status === "closed") throw this.roomClosed();
    if (room.hostId !== userId && !(await this.isActiveMember(roomId, userId))) {
      throw new ForbiddenException({
        success: false,
        error: { code: ERROR_CODES.NOT_ROOM_MEMBER, message: "Join this room first" },
      });
    }
    return this.toRoom(room, userId);
  }

  /** Settings of an active room (null if it's gone or ended) — for frequent internal checks. */
  async findRoomSettings(roomId: string): Promise<RoomSettings | null> {
    if (!isValidObjectId(roomId)) return null;
    const room = await this.roomModel.findOne({ _id: roomId, status: "active" }).select({ settings: 1 }).exec();
    return room ? settingsOf(room) : null;
  }

  /**
   * Invites a friend into a room you're in, through their bell. Private
   * rooms: only the host can invite (the link carries the invite code).
   */
  async inviteFriend(roomId: string, inviter: Actor, friendId: string): Promise<void> {
    const { room, link } = await this.inviteLinkFor(roomId, inviter.id, friendId);
    await this.notifications.notify(friendId, {
      type: "room_invite",
      title: `${inviter.displayName} invited you`,
      body: `Come listen in “${room.name}”`,
      link,
      actorId: inviter.id,
    });
  }

  /**
   * The link that lets a friend into a room you're in (bell invites and
   * rooms shared in messages). Private rooms: only the host can invite,
   * and the link carries the invite code.
   */
  async inviteLinkFor(roomId: string, inviterId: string, friendId: string): Promise<{ room: Room; link: string }> {
    const room = await this.getRoomForActiveMember(roomId, inviterId);
    if (!(await this.friendships.areFriends(inviterId, friendId))) {
      throw new ForbiddenException({
        success: false,
        error: { code: ERROR_CODES.NOT_FRIENDS, message: "You can only invite your friends" },
      });
    }
    if (room.type === "private" && room.hostId !== inviterId) {
      throw new ForbiddenException({
        success: false,
        error: { code: ERROR_CODES.NOT_ROOM_HOST, message: "Only the host can invite people to a private room" },
      });
    }
    const link = room.type === "private" && room.inviteCode ? `/room/${room.id}?invite=${room.inviteCode}` : `/room/${room.id}`;
    return { room, link };
  }

  /** Persisted only when the track changes — never on play/pause/seek ticks. */
  async setCurrentTrack(roomId: string, trackId: string): Promise<void> {
    await this.roomModel.updateOne({ _id: roomId }, { currentTrackId: trackId }).exec();
  }

  async isActiveMember(roomId: string, userId: string): Promise<boolean> {
    const membership = await this.memberModel.exists({ roomId, userId, leftAt: null }).exec();
    return membership !== null;
  }

  /** Host, DJ, or anyone when the room lets everyone control playback. */
  canControlPlayback(room: Room, userId: string): boolean {
    return room.hostId === userId || room.djIds.includes(userId) || room.settings.whoCanControlPlayback === "everyone";
  }

  /** Host or DJ: may manage anyone's songs in the queue. */
  isHostOrDj(room: Room, userId: string): boolean {
    return room.hostId === userId || room.djIds.includes(userId);
  }

  async listActivePublicRooms(query: ListRoomsQuery): Promise<{ items: Room[]; nextCursor: string | null }> {
    const filter: Record<string, unknown> = { status: "active", type: "public" };
    if (query.cursor && isValidObjectId(query.cursor)) {
      filter._id = { $lt: query.cursor };
    }

    const docs = await this.roomModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .exec();

    const hasMore = docs.length > query.limit;
    const page = hasMore ? docs.slice(0, query.limit) : docs;

    return {
      items: page.map((d) => this.toRoom(d, null)),
      nextCursor: hasMore ? String(page[page.length - 1]!._id) : null,
    };
  }

  /** Ids of every active room — for the inactivity sweeper. */
  async listActiveRoomIds(): Promise<{ id: string; createdAt: Date }[]> {
    const docs = await this.roomModel.find({ status: "active" }).select({ _id: 1, createdAt: 1 }).exec();
    return docs.map((doc) => ({ id: doc.id, createdAt: doc.createdAt }));
  }

  /**
   * Idempotent: joining twice returns the existing membership (safe against
   * double-submits). Checks, in order: room open, not removed, type rules
   * (friends / invite / passcode), capacity.
   */
  async joinRoom(roomId: string, userId: string, input: JoinRoomInput = {}): Promise<RoomMember> {
    if (!isValidObjectId(roomId)) throw this.roomNotFound();
    const room = await this.roomModel.findById(roomId).select("+passcodeHash").exec();
    if (!room) throw this.roomNotFound();
    if (room.status === "closed") throw this.roomClosed();

    const existing = await this.memberModel.findOne({ roomId, userId, leftAt: null }).exec();
    if (existing) return this.toRoomMember(existing);

    if (room.bannedUserIds.includes(userId)) {
      throw new ForbiddenException({
        success: false,
        error: { code: ERROR_CODES.ROOM_BANNED, message: "The host removed you from this room" },
      });
    }

    if (room.hostId !== userId) {
      if (room.type === "friends" && !(await this.friendships.areFriends(room.hostId, userId))) {
        throw new ForbiddenException({
          success: false,
          error: { code: ERROR_CODES.ROOM_FRIENDS_ONLY, message: "Only the host's friends can join this room" },
        });
      }
      if (room.type === "private" && !this.inviteMatches(room, input.invite)) {
        if (!room.passcodeHash || !input.passcode) {
          throw new ForbiddenException({
            success: false,
            error: {
              code: ERROR_CODES.ROOM_LOCKED,
              message: room.passcodeHash ? "Enter the room's passcode" : "This room is invite-only — ask the host for the link",
              details: { roomId, hasPasscode: Boolean(room.passcodeHash) },
            },
          });
        }
        await this.checkPasscode(roomId, input.passcode, room.passcodeHash);
      }
    }

    // Take a seat first, atomically, so simultaneous joins can't overfill the room.
    const seat = await this.roomModel
      .updateOne(
        { _id: roomId, status: "active", $expr: { $lt: ["$memberCount", "$settings.maxListeners"] } },
        { $inc: { memberCount: 1 } },
      )
      .exec();
    if (seat.modifiedCount === 0) {
      const latest = await this.roomModel.findById(roomId).select("status").lean().exec();
      if (!latest || latest.status === "closed") throw this.roomClosed();
      throw new ConflictException({
        success: false,
        error: { code: ERROR_CODES.ROOM_FULL, message: "This room is full" },
      });
    }

    try {
      const member = await this.memberModel.create({ roomId, userId, role: "member" });
      return this.toRoomMember(member);
    } catch (error: unknown) {
      // Give the seat back whatever went wrong.
      await this.roomModel.updateOne({ _id: roomId, memberCount: { $gt: 0 } }, { $inc: { memberCount: -1 } }).exec();
      if (!isDuplicateKey(error)) throw error;
      // A parallel request (double submit, second tab) joined first: same result.
      const winner = await this.memberModel.findOne({ roomId, userId, leftAt: null }).exec();
      if (!winner) throw error;
      return this.toRoomMember(winner);
    }
  }

  /**
   * Wrong passcodes are counted per room, whoever sends them: guest accounts
   * are free, so a per-user limit alone would let a script guess a short
   * passcode in minutes. Each try is counted before bcrypt runs, so parallel
   * guesses can't slip through; a right one gives its try back. The invite
   * link keeps working while the passcode is locked.
   */
  private async checkPasscode(roomId: string, passcode: string, passcodeHash: string): Promise<void> {
    const redis = this.redisService.getClient();
    const key = `rooms:passcode-attempts:${roomId}`;
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, PASSCODE_WINDOW_SECONDS);
    if (attempts > PASSCODE_ATTEMPTS_PER_ROOM) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMITED,
            message: "Too many wrong passcodes for this room. Try again later, or ask the host for the invite link.",
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!(await bcrypt.compare(passcode, passcodeHash))) {
      throw new ForbiddenException({
        success: false,
        error: { code: ERROR_CODES.ROOM_PASSCODE_INVALID, message: "Wrong passcode" },
      });
    }
    await redis.decr(key);
  }

  /** Members leave; the host leaving ends the room for everyone. */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    if (!isValidObjectId(roomId)) throw this.notMember();
    const room = await this.roomModel.findById(roomId).exec();
    if (room && room.status === "active" && room.hostId === userId) {
      await this.closeRoom(roomId, "host-ended");
      return;
    }

    // Atomic, so a double leave only counts once.
    const membership = await this.memberModel
      .findOneAndUpdate({ roomId, userId, leftAt: null }, { leftAt: new Date() })
      .exec();
    if (!membership) throw this.notMember();
    await this.roomModel
      .updateOne({ _id: roomId, memberCount: { $gt: 0 } }, { $inc: { memberCount: -1 }, $pull: { djIds: userId } })
      .exec();
    if (room?.djIds.includes(userId)) await this.announce(roomId);
    // Their open sockets stop counting as members too (seat, mic, broadcasts).
    this.events.emit("room.left", { roomId, userId });
  }

  /**
   * Ends a room: closed for good, every membership ended. Returns false if it
   * was already closed (so callers can run cleanup exactly once).
   */
  async closeRoom(roomId: string, reason: RoomCloseReason): Promise<boolean> {
    const result = await this.roomModel
      .updateOne({ _id: roomId, status: "active" }, { status: "closed", closedAt: new Date(), memberCount: 0 })
      .exec();
    if (result.modifiedCount === 0) return false;
    await this.memberModel.updateMany({ roomId, leftAt: null }, { leftAt: new Date() }).exec();
    this.events.emit("room.closed", { roomId, reason });
    return true;
  }

  async updateRoom(roomId: string, hostId: string, input: UpdateRoomInput): Promise<Room> {
    const room = await this.findHostedRoom(roomId, hostId, true);

    if (input.name !== undefined) room.name = input.name;
    if (input.description !== undefined) room.description = input.description;
    if (input.settings) room.settings = normalizeSettings(room.type, { ...settingsOf(room), ...input.settings });
    if (input.passcode !== undefined) {
      if (room.type !== "private") {
        throw new BadRequestException({
          success: false,
          error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Only private rooms have a passcode" },
        });
      }
      room.passcodeHash = input.passcode === null ? null : await bcrypt.hash(input.passcode, PASSCODE_HASH_ROUNDS);
      room.hasPasscode = input.passcode !== null;
    }
    room.markModified("settings");
    await room.save();
    this.events.emit("room.updated", { room: this.toRoom(room, null) });
    return this.toRoom(room, hostId);
  }

  /** New invite link for a private room; the old link stops working. */
  async regenerateInvite(roomId: string, hostId: string): Promise<Room> {
    const room = await this.findHostedRoom(roomId, hostId);
    if (room.type !== "private") {
      throw new BadRequestException({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Only private rooms have invite links" },
      });
    }
    room.inviteCode = newInviteCode();
    await room.save();
    return this.toRoom(room, hostId);
  }

  async setDj(roomId: string, hostId: string, userId: string, dj: boolean): Promise<Room> {
    const room = await this.findHostedRoom(roomId, hostId);
    if (userId === hostId) return this.toRoom(room, hostId); // the host already has every power
    if (dj) {
      await this.assertActiveMember(roomId, userId);
      if (!room.djIds.includes(userId) && room.djIds.length >= MAX_ROOM_DJS) {
        throw new ConflictException({
          success: false,
          error: { code: ERROR_CODES.DJ_LIMIT, message: `A room can have up to ${MAX_ROOM_DJS} DJs` },
        });
      }
    }
    const updated = await this.roomModel
      .findOneAndUpdate({ _id: roomId }, dj ? { $addToSet: { djIds: userId } } : { $pull: { djIds: userId } }, { new: true })
      .exec();
    return this.announce(roomId, updated, hostId);
  }

  async setMuted(roomId: string, hostId: string, userId: string, muted: boolean): Promise<Room> {
    await this.findHostedRoom(roomId, hostId);
    if (userId === hostId) {
      throw new BadRequestException({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: "You can't mute yourself" },
      });
    }
    const updated = await this.roomModel
      .findOneAndUpdate(
        { _id: roomId },
        muted ? { $addToSet: { mutedUserIds: userId } } : { $pull: { mutedUserIds: userId } },
        { new: true },
      )
      .exec();
    return this.announce(roomId, updated, hostId);
  }

  /** Removes someone for good: their membership ends and they can't join again. */
  async kick(roomId: string, hostId: string, userId: string): Promise<Room> {
    const room = await this.findHostedRoom(roomId, hostId);
    if (userId === hostId) {
      throw new BadRequestException({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: "End the room instead of removing yourself" },
      });
    }
    const membership = await this.memberModel.findOneAndUpdate({ roomId, userId, leftAt: null }, { leftAt: new Date() }).exec();
    const banned = [...room.bannedUserIds.filter((id) => id !== userId), userId].slice(-MAX_BANNED);
    const updated = await this.roomModel
      .findOneAndUpdate(
        { _id: roomId },
        {
          $set: { bannedUserIds: banned },
          $pull: { djIds: userId, mutedUserIds: userId },
          ...(membership ? { $inc: { memberCount: -1 } } : {}),
        },
        { new: true },
      )
      .exec();
    this.events.emit("room.kicked", { roomId, userId });
    return this.announce(roomId, updated, hostId);
  }

  /**
   * Hands the room to another member. They can't already host a live room
   * (one room per host); the old host stays in as a member.
   */
  async transferHost(roomId: string, hostId: string, newHostId: string): Promise<Room> {
    const room = await this.findHostedRoom(roomId, hostId);
    if (newHostId === hostId) return this.toRoom(room, hostId);
    await this.assertActiveMember(roomId, newHostId);
    if (await this.findActiveHostedRoom(newHostId)) {
      throw new ConflictException({
        success: false,
        error: { code: ERROR_CODES.HOST_TRANSFER_INVALID, message: "They're already hosting another room" },
      });
    }

    let updated: RoomDocument | null;
    try {
      updated = await this.roomModel
        .findOneAndUpdate(
          { _id: roomId, hostId, status: "active" },
          { $set: { hostId: newHostId }, $pull: { djIds: newHostId, mutedUserIds: newHostId } },
          { new: true },
        )
        .exec();
    } catch (error: unknown) {
      if (isDuplicateKey(error)) {
        throw new ConflictException({
          success: false,
          error: { code: ERROR_CODES.HOST_TRANSFER_INVALID, message: "They're already hosting another room" },
        });
      }
      throw error;
    }
    if (!updated) throw this.roomNotFound();

    await Promise.all([
      this.memberModel.updateOne({ roomId, userId: hostId, leftAt: null }, { role: "member" }).exec(),
      this.memberModel.updateOne({ roomId, userId: newHostId, leftAt: null }, { role: "host" }).exec(),
    ]);
    return this.announce(roomId, updated, hostId);
  }

  /** Who may enter private rooms with this invite, for the host's share button. */
  private inviteMatches(room: RoomDocument, invite: string | undefined): boolean {
    if (!invite || !room.inviteCode) return false;
    const a = Buffer.from(invite);
    const b = Buffer.from(room.inviteCode);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async tellFriendsAboutRoom(host: Actor, room: RoomDocument): Promise<void> {
    if (room.type === "private") return;
    const friendIds = await this.friendships.friendIdsOf(host.id);
    await this.notifications.notifyMany(friendIds, {
      type: "friend_room_started",
      title: `${host.displayName} is live`,
      body: `Started “${room.name}” — come listen together`,
      link: `/room/${room.id}`,
      actorId: host.id,
    });
  }

  /** Broadcasts the room's new state to everyone in it, and returns it as the actor sees it. */
  private async announce(roomId: string, doc?: RoomDocument | null, viewerId?: string): Promise<Room> {
    const room = doc ?? (await this.roomModel.findById(roomId).exec());
    if (!room) throw this.roomNotFound();
    this.events.emit("room.updated", { room: this.toRoom(room, null) });
    return this.toRoom(room, viewerId ?? null);
  }

  private async findActiveHostedRoom(userId: string): Promise<RoomDocument | null> {
    return this.roomModel.findOne({ hostId: userId, status: "active" }).exec();
  }

  private async findRoomOrThrow(roomId: string): Promise<RoomDocument> {
    if (!isValidObjectId(roomId)) throw this.roomNotFound();
    const room = await this.roomModel.findById(roomId).exec();
    if (!room) throw this.roomNotFound();
    return room;
  }

  /** An active room `hostId` hosts — for every host-only action. */
  private async findHostedRoom(roomId: string, hostId: string, withPasscode = false): Promise<RoomDocument> {
    if (!isValidObjectId(roomId)) throw this.roomNotFound();
    const query = this.roomModel.findById(roomId);
    const room = await (withPasscode ? query.select("+passcodeHash") : query).exec();
    if (!room) throw this.roomNotFound();
    if (room.status === "closed") throw this.roomClosed();
    if (room.hostId !== hostId) {
      throw new ForbiddenException({
        success: false,
        error: { code: ERROR_CODES.NOT_ROOM_HOST, message: "Only the host can do that" },
      });
    }
    return room;
  }

  private async assertActiveMember(roomId: string, userId: string): Promise<void> {
    if (!(await this.isActiveMember(roomId, userId))) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.NOT_ROOM_MEMBER, message: "They're not in this room any more" },
      });
    }
  }

  private roomLimitReached(room: RoomDocument): ConflictException {
    return new ConflictException({
      success: false,
      error: {
        code: ERROR_CODES.ROOM_LIMIT_REACHED,
        message: `You're already hosting “${room.name}”. End it before starting a new room.`,
        details: { roomId: room.id, roomName: room.name },
      },
    });
  }

  private roomNotFound(): NotFoundException {
    return new NotFoundException({
      success: false,
      error: { code: ERROR_CODES.ROOM_NOT_FOUND, message: "Room not found" },
    });
  }

  private notMember(): NotFoundException {
    return new NotFoundException({
      success: false,
      error: { code: ERROR_CODES.NOT_ROOM_MEMBER, message: "You are not in this room" },
    });
  }

  private roomClosed(): ConflictException {
    return new ConflictException({
      success: false,
      error: { code: ERROR_CODES.ROOM_CLOSED, message: "This room has ended" },
    });
  }

  /** `viewerId`: who it's for — only the host ever gets the invite code. */
  private toRoom(doc: RoomDocument, viewerId: string | null): Room {
    return {
      id: doc.id,
      name: doc.name,
      description: doc.description ?? null,
      coverUrl: doc.coverUrl ?? null,
      hostId: doc.hostId,
      type: doc.type,
      status: doc.status,
      settings: settingsOf(doc),
      currentTrackId: doc.currentTrackId ?? null,
      memberCount: Math.max(0, doc.memberCount),
      djIds: doc.djIds ?? [],
      mutedUserIds: doc.mutedUserIds ?? [],
      hasPasscode: doc.type === "private" && doc.hasPasscode === true,
      inviteCode: viewerId !== null && viewerId === doc.hostId ? (doc.inviteCode ?? null) : null,
      createdAt: doc.createdAt.toISOString(),
      closedAt: doc.closedAt ? doc.closedAt.toISOString() : null,
    };
  }

  private toRoomMember(doc: RoomMemberDocument): RoomMember {
    return {
      roomId: doc.roomId,
      userId: doc.userId,
      role: doc.role,
      joinedAt: doc.joinedAt.toISOString(),
      leftAt: doc.leftAt ? doc.leftAt.toISOString() : null,
    };
  }
}

/** Rooms created before a setting existed get its default. */
function settingsOf(doc: RoomDocument): RoomSettings {
  return { ...DEFAULT_SETTINGS, ...doc.settings };
}

/** Type rules on top of the schema's ranges: a duo holds exactly 2. */
function normalizeSettings(type: RoomDocument["type"], settings: RoomSettings): RoomSettings {
  return {
    ...settings,
    maxListeners: type === "duo" ? DUO_MAX_LISTENERS : Math.min(MAX_ROOM_LISTENERS, Math.max(2, settings.maxListeners)),
    maxSingers: Math.min(MAX_ROOM_SINGERS, Math.max(1, settings.maxSingers)),
  };
}

function newInviteCode(): string {
  return randomBytes(INVITE_CODE_BYTES).toString("base64url");
}
