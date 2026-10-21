import { Logger, UseFilters, type BeforeApplicationShutdown } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayInit,
} from "@nestjs/websockets";
import { ERROR_CODES, SOCKET_EVENTS } from "@soundwithme/constants";
import {
  changeTrackEventSchema,
  pauseEventSchema,
  playEventSchema,
  roomScopedEventSchema,
  seekEventSchema,
  type ChangeTrackEventInput,
  type PauseEventInput,
  type PlayEventInput,
  type RoomScopedEventInput,
  type SeekEventInput,
} from "@soundwithme/validation";
import type { PlaybackState, RoomListener } from "@soundwithme/types";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PlaybackService } from "../../modules/playback/playback.service";
import { RoomsService } from "../../modules/rooms/rooms.service";
import { QueueService } from "../../modules/queue/queue.service";
import { PresenceService } from "../../modules/presence/presence.service";
import { FriendshipsService } from "../../modules/friends/friendships.service";
import { WsAuthService } from "../ws-auth.service";
import { WsExceptionFilter } from "../ws-exception.filter";
import { RATE_LIMITS, assertJoined, consumeRateLimit } from "../socket-guards";
import { notifyRelayDemand, relaysOfRoom } from "../voice-relay";
import type { AppServer, AppSocket } from "../realtime.types";

/** A user's friends are told about presence changes at most this often. */
const PRESENCE_FANOUT_MS = 3_000;
/** After its access token expires, a socket's login session is re-checked this often. */
const SESSION_RECHECK_MS = 5 * 60_000;

/** Socket.IO room every socket of one user joins, for per-user pushes (bell, friends). */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Connection lifecycle + room membership + realtime playback. The server is
 * the source of truth: clients send intents, PlaybackService validates
 * permission and writes a new versioned state to Redis, and the resulting
 * PLAYBACK_STATE is broadcast to everyone in the room. Handshake auth lives
 * here (afterInit) and covers every gateway on this namespace. CORS and the
 * Redis adapter are configured in RedisIoAdapter.
 */
@UseFilters(WsExceptionFilter)
@WebSocketGateway({ namespace: "/" })
export class PlaybackGateway implements OnGatewayInit, OnGatewayConnection, BeforeApplicationShutdown {
  private readonly logger = new Logger(PlaybackGateway.name);
  /** Set when the app starts shutting down: the server is about to drop every socket itself. */
  private shuttingDown = false;
  /** userId → when their friends were last told their presence changed. */
  private readonly presenceFanout = new Map<string, number>();

  @WebSocketServer()
  private readonly server!: AppServer;

  constructor(
    private readonly playbackService: PlaybackService,
    private readonly roomsService: RoomsService,
    private readonly queueService: QueueService,
    private readonly wsAuthService: WsAuthService,
    private readonly presence: PresenceService,
    private readonly friendships: FriendshipsService,
  ) {}

  /** Rejects unauthenticated handshakes before any event can be received. */
  afterInit(server: AppServer): void {
    server.use((socket, next) => {
      this.wsAuthService
        .authenticate(socket.handshake)
        .then((auth) => {
          if (!auth) {
            next(new Error(ERROR_CODES.UNAUTHENTICATED));
            return;
          }
          socket.data.user = auth.user;
          socket.data.session = auth.session;
          socket.data.rateBuckets = {};
          socket.data.joinedRooms = {};
          next();
        })
        .catch((error: unknown) => {
          this.logger.error(error instanceof Error ? error.stack : String(error));
          next(new Error(ERROR_CODES.INTERNAL_ERROR));
        });
    });
  }

  beforeApplicationShutdown(): void {
    this.shuttingDown = true;
  }

  handleConnection(client: AppSocket): void {
    // Not a leak: Nest adds two `disconnect` listeners per gateway to every
    // socket (5 gateways), plus the gateways' own cleanup — past Node's default 10.
    client.setMaxListeners(25);
    const userId = client.data.user.id;
    void client.join(userRoom(userId));
    void this.presence
      .connected(userId, client.id)
      .then(() => this.tellFriendsPresenceChanged(userId))
      .catch((error: unknown) => this.logPresenceFailure("(connect)", error));

    // Identity is checked once, at the handshake: when the token expires the
    // socket only stays while its login session does (logout ends it).
    let sessionCheck = setTimeout(
      () => void this.checkSession(client, (next) => (sessionCheck = next)),
      Math.max(client.data.session.tokenExpiresAt - Date.now(), 0),
    ).unref();

    // `disconnecting` (not `disconnect`) still has client.rooms populated.
    client.on("disconnecting", () => {
      clearTimeout(sessionCheck);
      // During shutdown every socket drops at once and Redis is closing —
      // presence queries would only race the teardown.
      if (this.shuttingDown) return;
      const roomIds = [...client.rooms].filter((roomId) => isListeningRoom(client, roomId));
      for (const roomId of roomIds) {
        void this.afterSocketLeft(client, roomId);
      }
      void this.presence
        .disconnected(userId, client.id)
        .then(() => this.tellFriendsPresenceChanged(userId))
        .catch((error: unknown) => this.logPresenceFailure("(disconnect)", error));
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.ROOM_JOIN)
  async onRoomJoin(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(roomScopedEventSchema)) { roomId }: RoomScopedEventInput,
  ): Promise<void> {
    consumeRateLimit(client, RATE_LIMITS.roomJoin);
    const userId = client.data.user.id;
    await this.roomsService.getRoomForActiveMember(roomId, userId);
    const [state, queue] = await Promise.all([
      this.playbackService.getPlaybackState(roomId),
      this.queueService.listUpcoming(roomId),
    ]);

    await client.join(roomId);
    // Checked again now that the socket is in: a kick or leave handled while
    // the reads above ran evicted the sockets in the room before this one
    // got there, and would otherwise leave it in for good.
    let room: Awaited<ReturnType<RoomsService["getRoomForActiveMember"]>>;
    try {
      room = await this.roomsService.getRoomForActiveMember(roomId, userId);
    } catch (error: unknown) {
      await client.leave(roomId);
      throw error;
    }
    client.data.joinedRooms[roomId] = { reactionsEnabled: room.settings.reactionsEnabled };

    if (state) client.emit(SOCKET_EVENTS.PLAYBACK_STATE, state);
    client.emit(SOCKET_EVENTS.QUEUE_UPDATED, { roomId, queue });
    this.server.to(roomId).emit(SOCKET_EVENTS.ROOM_JOIN, { roomId, userId });
    await this.broadcastPresence(roomId);
    await this.presence.enteredRoom(userId, client.id, roomId);
    this.tellFriendsPresenceChanged(userId);
  }

  @SubscribeMessage(SOCKET_EVENTS.ROOM_LEAVE)
  async onRoomLeave(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(roomScopedEventSchema)) { roomId }: RoomScopedEventInput,
  ): Promise<void> {
    if (!client.rooms.has(roomId)) return;
    await client.leave(roomId);
    delete client.data.joinedRooms[roomId];
    await this.afterSocketLeft(client, roomId);
    await this.presence.enteredRoom(client.data.user.id, client.id, null);
    this.tellFriendsPresenceChanged(client.data.user.id);
  }

  @SubscribeMessage(SOCKET_EVENTS.PLAY)
  async onPlay(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(playEventSchema)) { roomId, positionMs }: PlayEventInput,
  ): Promise<void> {
    consumeRateLimit(client, RATE_LIMITS.playbackControl);
    this.broadcastState(await this.playbackService.play(roomId, client.data.user.id, positionMs));
  }

  @SubscribeMessage(SOCKET_EVENTS.PAUSE)
  async onPause(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(pauseEventSchema)) { roomId, positionMs }: PauseEventInput,
  ): Promise<void> {
    consumeRateLimit(client, RATE_LIMITS.playbackControl);
    this.broadcastState(await this.playbackService.pause(roomId, client.data.user.id, positionMs));
  }

  @SubscribeMessage(SOCKET_EVENTS.SEEK)
  async onSeek(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(seekEventSchema)) { roomId, positionMs }: SeekEventInput,
  ): Promise<void> {
    consumeRateLimit(client, RATE_LIMITS.playbackControl);
    this.broadcastState(await this.playbackService.seek(roomId, client.data.user.id, positionMs));
  }

  @SubscribeMessage(SOCKET_EVENTS.CHANGE_TRACK)
  async onChangeTrack(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(changeTrackEventSchema)) { roomId, trackId }: ChangeTrackEventInput,
  ): Promise<void> {
    consumeRateLimit(client, RATE_LIMITS.playbackControl);
    this.broadcastState(await this.playbackService.changeTrack(roomId, client.data.user.id, trackId));
  }

  /** Re-sends the authoritative state to the requesting socket only (reconnect / drift recovery). */
  @SubscribeMessage(SOCKET_EVENTS.SYNC_REQUEST)
  async onSyncRequest(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(roomScopedEventSchema)) { roomId }: RoomScopedEventInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    const state = await this.playbackService.getPlaybackState(roomId);
    if (state) {
      client.emit(SOCKET_EVENTS.PLAYBACK_STATE, state);
    }
  }

  /**
   * The server takes sockets out of a room: one user's (the host removed
   * them) or everyone's (`userId` null, the room ended). Same bookkeeping as
   * leaving: the room's listener list and skip-vote target, and friends'
   * presence. fetchSockets() covers every API instance.
   */
  async evict(roomId: string, userId: string | null, notify?: (socket: { emit: AppServer["emit"] }) => void): Promise<void> {
    const sockets = await this.server.in(roomId).fetchSockets();
    const leaving = userId === null ? sockets : sockets.filter((s) => s.data.user.id === userId);
    if (leaving.length === 0) return;
    // Voice relays they listen to go too, or they'd keep hearing the singers.
    const relays = new Set<string>();
    for (const socket of leaving) {
      notify?.(socket);
      for (const relay of relaysOfRoom(socket.rooms, roomId)) {
        socket.leave(relay);
        relays.add(relay);
      }
      socket.leave(roomId);
      // Only sockets on this instance share `data` with the real socket; for others this is a no-op.
      delete socket.data.joinedRooms?.[roomId];
    }
    await Promise.all(
      [...relays].map((relay) => notifyRelayDemand(this.server, relay).catch((error: unknown) => this.logPresenceFailure(roomId, error))),
    );
    await Promise.all(
      leaving.map((s) =>
        this.presence.leftRoom(s.data.user.id, s.id, roomId).catch((error: unknown) => this.logPresenceFailure(roomId, error)),
      ),
    );
    for (const id of new Set(leaving.map((s) => s.data.user.id))) this.tellFriendsPresenceChanged(id);

    if (userId === null) return; // the room is gone: nobody left to update
    this.server.to(roomId).emit(SOCKET_EVENTS.ROOM_LEAVE, { roomId, userId });
    const listeners = uniqueListeners(sockets.filter((s) => s.data.user.id !== userId).map((s) => s.data.user));
    this.server.to(roomId).emit(SOCKET_EVENTS.ROOM_PRESENCE, { roomId, listeners });
    await this.broadcastSkipState(roomId, listeners.length).catch((error: unknown) => this.logPresenceFailure(roomId, error));
  }

  /** Disconnects every socket of one user, or only those of one login session. */
  async disconnectSessions(userId: string, sessionId: string | null): Promise<void> {
    const sockets = await this.server.in(userRoom(userId)).fetchSockets();
    for (const socket of sockets) {
      if (sessionId === null || socket.data.session?.id === sessionId) socket.disconnect(true);
    }
  }

  /** At token expiry and then every SESSION_RECHECK_MS: drops the socket once its session has ended. */
  private async checkSession(client: AppSocket, reschedule: (timer: NodeJS.Timeout) => void): Promise<void> {
    if (!client.connected || this.shuttingDown) return;
    let active: boolean;
    try {
      active = await this.wsAuthService.isSessionActive(client.data.session);
    } catch (error: unknown) {
      // Can't tell right now (database hiccup): keep the socket and ask again later.
      this.logger.warn(`Session check failed: ${error instanceof Error ? error.message : String(error)}`);
      active = true;
    }
    if (!active) {
      client.disconnect(true);
      return;
    }
    if (client.connected) reschedule(setTimeout(() => void this.checkSession(client, reschedule), SESSION_RECHECK_MS).unref());
  }

  private broadcastState(state: PlaybackState): void {
    this.server.to(state.roomId).emit(SOCKET_EVENTS.PLAYBACK_STATE, state);
  }

  /**
   * A user may have several tabs in the same room; only announce ROOM_LEAVE
   * when this was their last socket there. Presence is refreshed either way.
   * fetchSockets() goes through the Redis adapter, so this holds across
   * API instances too.
   */
  private async afterSocketLeft(client: AppSocket, roomId: string): Promise<void> {
    const userId = client.data.user.id;
    try {
      const sockets = await this.server.in(roomId).fetchSockets();
      const remaining = sockets.filter((s) => s.id !== client.id);
      if (!remaining.some((s) => s.data.user.id === userId)) {
        this.server.to(roomId).emit(SOCKET_EVENTS.ROOM_LEAVE, { roomId, userId });
      }
      const listeners = uniqueListeners(remaining.map((s) => s.data.user));
      this.server.to(roomId).emit(SOCKET_EVENTS.ROOM_PRESENCE, { roomId, listeners });
      await this.broadcastSkipState(roomId, listeners.length);
    } catch (error: unknown) {
      this.logPresenceFailure(roomId, error);
    }
  }

  private async broadcastPresence(roomId: string): Promise<void> {
    try {
      const sockets = await this.server.in(roomId).fetchSockets();
      const listeners = uniqueListeners(sockets.map((s) => s.data.user));
      this.server.to(roomId).emit(SOCKET_EVENTS.ROOM_PRESENCE, { roomId, listeners });
      await this.broadcastSkipState(roomId, listeners.length);
    } catch (error: unknown) {
      this.logPresenceFailure(roomId, error);
    }
  }

  /** Votes needed to skip follow how many people are here, so they're re-sent as that changes. */
  private async broadcastSkipState(roomId: string, listenerCount: number): Promise<void> {
    const state = await this.playbackService.getPlaybackState(roomId);
    if (!state) return;
    const skip = await this.queueService.skipState(roomId, state.trackId, listenerCount);
    this.server.to(roomId).emit(SOCKET_EVENTS.SKIP_STATE, skip);
  }

  /** Friends see who's online and in which room: tell their open Friends pages to refresh. */
  private tellFriendsPresenceChanged(userId: string): void {
    const now = Date.now();
    if (now - (this.presenceFanout.get(userId) ?? 0) < PRESENCE_FANOUT_MS) return;
    if (this.presenceFanout.size > 10_000) this.presenceFanout.clear(); // bounded memory
    this.presenceFanout.set(userId, now);
    void this.friendships
      .friendIdsOf(userId)
      .then((friendIds) => {
        if (friendIds.length > 0) this.server.to(friendIds.map(userRoom)).emit(SOCKET_EVENTS.FRIENDS_CHANGED, {});
      })
      .catch((error: unknown) => this.logPresenceFailure("(friends)", error));
  }

  private logPresenceFailure(roomId: string, error: unknown): void {
    this.logger.warn(
      `Could not resolve presence for room ${roomId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** A listening room (not the socket's own room, its user room or a voice relay). */
function isListeningRoom(client: AppSocket, roomId: string): boolean {
  return roomId !== client.id && !roomId.startsWith("user:") && !roomId.startsWith("voice:");
}

/** One entry per user, however many tabs they have open. */
function uniqueListeners(users: { id: string; displayName: string }[]): RoomListener[] {
  const byId = new Map<string, RoomListener>();
  for (const user of users) byId.set(user.id, { id: user.id, displayName: user.displayName });
  return [...byId.values()];
}
