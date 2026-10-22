import { Logger, UseFilters, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { SOCKET_EVENTS } from "@soundwithme/constants";
import {
  hostTransferSchema,
  inviteFriendSchema,
  kickUserSchema,
  muteUserSchema,
  setDjSchema,
  type HostTransferInput,
  type InviteFriendInput,
  type KickUserInput,
  type MuteUserInput,
  type SetDjInput,
} from "@soundwithme/validation";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AppEventsService } from "../../common/events/app-events.service";
import { RedisService } from "../../database/redis/redis.service";
import { RoomsService } from "../../modules/rooms/rooms.service";
import { PlaybackService } from "../../modules/playback/playback.service";
import { WsExceptionFilter } from "../ws-exception.filter";
import { RATE_LIMITS, assertJoined, consumeRateLimit } from "../socket-guards";
import type { AppServer, AppSocket } from "../realtime.types";
import { PlaybackGateway, userRoom } from "./playback.gateway";

/** A room with nobody connected for this long ends by itself. */
export const ROOM_IDLE_CLOSE_MS = 30 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;
/** Redis hash: roomId → epoch ms when the sweeper first saw it empty. */
const EMPTY_SINCE_KEY = "rooms:empty-since";
/** Only one API instance sweeps per round. */
const SWEEP_LOCK_KEY = "rooms:sweep-lock";

/**
 * Host powers (DJs, handing the room over, muting, removing people,
 * inviting friends), the bridge from room/user domain events to sockets, and
 * the sweeper that ends rooms nobody has been in for 30 minutes.
 */
@UseFilters(WsExceptionFilter)
@WebSocketGateway({ namespace: "/" })
export class RoomGateway implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  private readonly server!: AppServer;

  private readonly logger = new Logger(RoomGateway.name);
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly roomsService: RoomsService,
    private readonly playbackService: PlaybackService,
    private readonly redisService: RedisService,
    private readonly events: AppEventsService,
    private readonly playbackGateway: PlaybackGateway,
  ) {}

  onModuleInit(): void {
    this.events.on("room.updated", async ({ room }) => {
      this.server.to(room.id).emit(SOCKET_EVENTS.ROOM_UPDATED, { room });
      // Reactions are checked against a per-socket snapshot (they come in bursts): refresh it.
      for (const socket of await this.server.in(room.id).local.fetchSockets()) {
        const snapshot = socket.data.joinedRooms?.[room.id];
        if (snapshot) snapshot.reactionsEnabled = room.settings.reactionsEnabled;
      }
    });

    this.events.on("room.closed", async ({ roomId, reason }) => {
      this.server.to(roomId).emit(SOCKET_EVENTS.ROOM_CLOSED, { roomId, reason });
      await this.playbackGateway.evict(roomId, null);
      await Promise.all([
        this.playbackService.clearPlaybackState(roomId),
        this.redisService.getClient().hdel(EMPTY_SINCE_KEY, roomId),
      ]);
    });

    this.events.on("room.kicked", async ({ roomId, userId }) => {
      await this.playbackGateway.evict(roomId, userId, (socket) => socket.emit(SOCKET_EVENTS.ROOM_KICKED, { roomId }));
    });

    // Leaving through the REST API ends the membership; the sockets must not
    // keep the room's broadcasts and mic rights that membership gave them.
    this.events.on("room.left", async ({ roomId, userId }) => {
      await this.playbackGateway.evict(roomId, userId);
    });

    this.events.on("auth.sessionsEnded", async ({ userId, sessionId }) => {
      await this.playbackGateway.disconnectSessions(userId, sessionId);
    });

    this.events.on("user.notification", ({ userId, notification }) => {
      this.server.to(userRoom(userId)).emit(SOCKET_EVENTS.NOTIFICATION, notification);
    });

    this.events.on("user.directMessage", ({ message }) => {
      this.server.to([userRoom(message.senderId), userRoom(message.recipientId)]).emit(SOCKET_EVENTS.DM_MESSAGE, message);
    });

    this.events.on("user.messagesRead", ({ conversationId, readerId, otherId, readAt }) => {
      this.server.to([userRoom(readerId), userRoom(otherId)]).emit(SOCKET_EVENTS.DM_READ, { conversationId, readerId, readAt });
    });

    this.events.on("user.friendsChanged", ({ userIds }) => {
      if (userIds.length > 0) this.server.to(userIds.map(userRoom)).emit(SOCKET_EVENTS.FRIENDS_CHANGED, {});
    });

    this.sweeper = setInterval(() => {
      this.sweepIdleRooms().catch((error: unknown) =>
        this.logger.warn(`Idle-room sweep failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    }, SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  @SubscribeMessage(SOCKET_EVENTS.ROOM_SET_DJ)
  async onSetDj(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(setDjSchema)) { roomId, userId, dj }: SetDjInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.moderation);
    await this.roomsService.setDj(roomId, client.data.user.id, userId, dj);
  }

  @SubscribeMessage(SOCKET_EVENTS.ROOM_MUTE_USER)
  async onMuteUser(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(muteUserSchema)) { roomId, userId, muted }: MuteUserInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.moderation);
    await this.roomsService.setMuted(roomId, client.data.user.id, userId, muted);
  }

  @SubscribeMessage(SOCKET_EVENTS.USER_KICK)
  async onKick(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(kickUserSchema)) { roomId, userId }: KickUserInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.moderation);
    await this.roomsService.kick(roomId, client.data.user.id, userId);
  }

  @SubscribeMessage(SOCKET_EVENTS.HOST_TRANSFER)
  async onHostTransfer(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(hostTransferSchema)) { roomId, newHostId }: HostTransferInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.moderation);
    const room = await this.roomsService.transferHost(roomId, client.data.user.id, newHostId);
    this.server.to(roomId).emit(SOCKET_EVENTS.HOST_CHANGED, { roomId, newHostId: room.hostId });
  }

  @SubscribeMessage(SOCKET_EVENTS.USER_INVITE)
  async onInvite(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(inviteFriendSchema)) { roomId, userId }: InviteFriendInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.invite);
    await this.roomsService.inviteFriend(roomId, client.data.user, userId);
  }

  /**
   * Ends rooms that have had nobody connected for ROOM_IDLE_CLOSE_MS. One
   * fetchSockets() per round covers every room (and every API instance);
   * the empty-since clock restarts whenever anyone is back in. Lobby rooms
   * never end: their members who aren't connected are let go instead.
   */
  private async sweepIdleRooms(): Promise<void> {
    const redis = this.redisService.getClient();
    const locked = await redis.set(SWEEP_LOCK_KEY, "1", "PX", SWEEP_INTERVAL_MS - 5_000, "NX");
    if (locked !== "OK") return;

    const [rooms, sockets] = await Promise.all([this.roomsService.listActiveRoomIds(), this.server.fetchSockets()]);
    const occupied = new Set<string>();
    const connected = new Map<string, Set<string>>();
    for (const socket of sockets) {
      for (const room of socket.rooms) {
        occupied.add(room);
        connected.set(room, (connected.get(room) ?? new Set()).add(socket.data.user.id));
      }
    }

    const now = Date.now();
    const emptySince = await redis.hgetall(EMPTY_SINCE_KEY);
    const known = new Set(rooms.map((room) => room.id));
    for (const room of rooms) {
      if (room.isLobby) {
        await this.roomsService.pruneLobbyMembers(room.id, connected.get(room.id) ?? new Set());
        continue;
      }
      if (occupied.has(room.id)) {
        if (emptySince[room.id] !== undefined) await redis.hdel(EMPTY_SINCE_KEY, room.id);
        continue;
      }
      const since = Number(emptySince[room.id]);
      if (!Number.isFinite(since) || since <= 0) {
        await redis.hset(EMPTY_SINCE_KEY, room.id, String(now));
        continue;
      }
      if (now - since >= ROOM_IDLE_CLOSE_MS) {
        const closed = await this.roomsService.closeRoom(room.id, "inactive");
        if (closed) this.logger.log(`Closed room ${room.id}: nobody there for ${Math.round((now - since) / 60_000)} min`);
      }
    }
    // Rooms that ended some other way.
    const gone = Object.keys(emptySince).filter((id) => !known.has(id));
    if (gone.length > 0) await redis.hdel(EMPTY_SINCE_KEY, ...gone);
  }
}
