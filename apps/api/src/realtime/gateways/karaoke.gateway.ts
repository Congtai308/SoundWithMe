import { HttpException, HttpStatus, Logger, UseFilters, type BeforeApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from "@nestjs/websockets";
import { ERROR_CODES, SOCKET_EVENTS } from "@soundwithme/constants";
import type { MicSinger, MicStatePayload } from "@soundwithme/realtime-contracts";
import {
  MAX_SING_LINE,
  MAX_SINGERS,
  micReleaseSchema,
  micRoomSchema,
  rtcSignalSchema,
  voiceChunkSchema,
  voiceRelaySchema,
  type MicReleaseInput,
  type MicRoomInput,
  type RtcSignalInput,
  type VoiceChunkInput,
  type VoiceRelayInput,
} from "@soundwithme/validation";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AppEventsService } from "../../common/events/app-events.service";
import { RedisService } from "../../database/redis/redis.service";
import { RoomsService } from "../../modules/rooms/rooms.service";
import { NotificationsService } from "../../modules/notifications/notifications.service";
import { WsExceptionFilter } from "../ws-exception.filter";
import { RATE_LIMITS, assertJoined, consumeRateLimit } from "../socket-guards";
import { RELAY_PREFIX, notifyRelayDemand, relayRoom } from "../voice-relay";
import type { AppServer, AppSocket } from "../realtime.types";

interface StoredMic {
  userId: string;
  displayName: string;
  since: number;
  /**
   * false while a mic handed over from the line waits for its singer to
   * open it (MIC_TURN); their MIC_REQUEST confirms it. Still unconfirmed
   * after TURN_HOLD_MS, it passes to the next person in line.
   */
  confirmed?: boolean;
}

interface LineEntry {
  socketId: string;
  userId: string;
  displayName: string;
}

/** Mic holders are re-checked in Redis at most this often while they stream. */
const SINGER_CHECK_MS = 2_000;
/** How long a mic handed over from the line is kept for its singer to open it. */
const TURN_HOLD_MS = 20_000;

/**
 * Takes a mic only while the room has a free one, in one step, so two
 * requests at the same moment (or from two API instances) can't both get
 * the last mic. KEYS[1] = mic hash; ARGV = socketId, mic JSON, mic count.
 * Returns 1 if the socket now holds a mic.
 */
const CLAIM_MIC_SCRIPT = `
if redis.call("HEXISTS", KEYS[1], ARGV[1]) == 1 then return 1 end
if redis.call("HLEN", KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call("HSET", KEYS[1], ARGV[1], ARGV[2])
return 1
`;

/**
 * Karaoke voice: who holds the room's mics, the line for the next free mic,
 * WebRTC signaling between tabs, and a fallback voice relay.
 *
 * Normally audio never passes through the server — listeners connect straight
 * to each singer's browser; this only relays offers, answers and ICE. When a
 * network blocks that (mobile data, CGNAT, offices), the listener joins the
 * singer's relay room (`voice:<roomId>:<singerSocketId>`) and the singer
 * streams 10 ms chunks here (Opus, or PCM if a listener can't decode Opus),
 * which are forwarded to that room.
 *
 * Mics live in Redis (`room:<id>:mic`, socketId → singer), the line in
 * `room:<id>:micline` (oldest first), so every API instance sees them. Both
 * are checked against the sockets actually in the room on each read, so a
 * crashed instance never leaves a ghost singer. A room opens
 * `settings.maxSingers` mics; when one frees up (or a new song starts and
 * people are waiting), it goes to the front of the line.
 */
@UseFilters(WsExceptionFilter)
@WebSocketGateway({ namespace: "/" })
export class KaraokeGateway implements OnGatewayConnection, OnModuleInit, BeforeApplicationShutdown {
  @WebSocketServer()
  private readonly server!: AppServer;

  private readonly logger = new Logger(KaraokeGateway.name);
  /** socketId → roomId → when it was last confirmed holding a mic there. */
  private readonly confirmedSingers = new Map<string, Map<string, number>>();
  /** Set when the app starts shutting down: every socket drops at once while Redis is closing. */
  private shuttingDown = false;

  constructor(
    private readonly redisService: RedisService,
    private readonly roomsService: RoomsService,
    private readonly notificationsService: NotificationsService,
    private readonly events: AppEventsService,
  ) {}

  onModuleInit(): void {
    // A new song passes the mic along when people are waiting for one.
    this.events.on("room.trackChanged", ({ roomId }) => this.rotate(roomId));
    // More mic slots (host setting) may let people in from the line.
    this.events.on("room.updated", async ({ room }) => {
      await this.fillFromLine(room.id);
      await this.broadcast(room.id);
    });
    this.events.on("room.kicked", ({ roomId, userId }) => this.dropUser(roomId, userId));
    this.events.on("room.left", ({ roomId, userId }) => this.dropUser(roomId, userId));
    this.events.on("room.closed", async ({ roomId }) => {
      await this.redis().del(this.key(roomId), this.lineKey(roomId));
    });
  }

  beforeApplicationShutdown(): void {
    this.shuttingDown = true;
  }

  handleConnection(client: AppSocket): void {
    // A closed tab drops its mic and its place in line, and stops counting as a relay listener.
    client.on("disconnecting", () => {
      if (this.shuttingDown) return;
      const relays: string[] = [];
      for (const roomId of client.rooms) {
        if (roomId === client.id || roomId.startsWith("user:")) continue;
        if (roomId.startsWith(RELAY_PREFIX)) {
          relays.push(roomId);
          continue;
        }
        this.dropMic(roomId, client.id, client.id).catch((error: unknown) => this.logFailure(roomId, error));
        this.leaveLine(roomId, client.id, client.id).catch((error: unknown) => this.logFailure(roomId, error));
      }
      client.once("disconnect", () => {
        this.confirmedSingers.delete(client.id);
        for (const relay of relays) void this.notifyDemand(relay).catch(() => undefined);
      });
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.MIC_SYNC)
  async onMicSync(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(micRoomSchema)) { roomId }: MicRoomInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    client.emit(SOCKET_EVENTS.MIC_STATE, await this.micState(roomId));
  }

  /**
   * Take a free mic — or open the one the line just handed you. Free mics go
   * to the line first: with people waiting, only the front of the line may
   * take one directly.
   */
  @SubscribeMessage(SOCKET_EVENTS.MIC_REQUEST)
  async onMicRequest(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(micRoomSchema)) { roomId }: MicRoomInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.mic);
    const stored = await this.redis().hget(this.key(roomId), client.id);
    if (stored !== null) {
      const mic = parseMic(stored);
      if (mic && mic.confirmed === false) {
        await this.redis().hset(this.key(roomId), client.id, JSON.stringify({ ...mic, confirmed: true }));
      }
    } else {
      const [singers, maxSingers, line] = await Promise.all([
        this.singers(roomId),
        this.maxSingers(roomId),
        this.line(roomId),
      ]);
      const othersWaiting = line.filter((entry) => entry.socketId !== client.id);
      const atFront = line[0]?.socketId === client.id;
      if (othersWaiting.length > 0 && !atFront) {
        throw micFull("People are waiting for a mic — join the line");
      }
      const mic: StoredMic = {
        userId: client.data.user.id,
        displayName: client.data.user.displayName,
        since: Date.now(),
        confirmed: true,
      };
      // singers() above pruned departed tabs, so the hash holds live mics only.
      if (singers.length >= maxSingers || !(await this.claimMic(roomId, client.id, mic, maxSingers))) {
        throw micFull(`All ${maxSingers} ${maxSingers === 1 ? "mic is" : "mics are"} taken — join the line`);
      }
      await this.removeFromLine(roomId, client.id);
    }
    await this.broadcast(roomId);
  }

  @SubscribeMessage(SOCKET_EVENTS.MIC_RELEASE)
  async onMicRelease(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(micReleaseSchema)) { roomId, socketId }: MicReleaseInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.mic);
    const target = socketId ?? client.id;
    if (target !== client.id) {
      const room = await this.roomsService.getRoomForActiveMember(roomId, client.data.user.id);
      if (!this.roomsService.isHostOrDj(room, client.data.user.id)) {
        throw new HttpException(
          {
            success: false,
            error: { code: ERROR_CODES.NOT_ROOM_HOST, message: "Only the host and DJs can close someone else's mic" },
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }
    await this.dropMic(roomId, target);
  }

  /** Wait for the next free mic; it opens by itself when your turn comes (MIC_TURN). */
  @SubscribeMessage(SOCKET_EVENTS.MIC_LINE_JOIN)
  async onLineJoin(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(micRoomSchema)) { roomId }: MicRoomInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.mic);
    const [line, singing] = await Promise.all([this.line(roomId), this.redis().hexists(this.key(roomId), client.id)]);
    if (singing === 0 && !line.some((entry) => entry.socketId === client.id)) {
      if (line.length >= MAX_SING_LINE) throw micFull(`The line is full (${MAX_SING_LINE} people)`);
      const entry: LineEntry = { socketId: client.id, userId: client.data.user.id, displayName: client.data.user.displayName };
      await this.redis().rpush(this.lineKey(roomId), JSON.stringify(entry));
      // A mic may be free right now (no one had asked for it).
      await this.fillFromLine(roomId);
    }
    await this.broadcast(roomId);
  }

  @SubscribeMessage(SOCKET_EVENTS.MIC_LINE_LEAVE)
  async onLineLeave(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(micRoomSchema)) { roomId }: MicRoomInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    await this.leaveLine(roomId, client.id);
  }

  /** Relays one negotiation message to another tab in the same room. */
  @SubscribeMessage(SOCKET_EVENTS.RTC_SIGNAL)
  async onRtcSignal(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(rtcSignalSchema)) { roomId, to, channel, signal }: RtcSignalInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.rtcSignal);
    const inRoom = (await this.server.in(roomId).fetchSockets()).some((s) => s.id === to);
    if (!inRoom) return; // the peer just left: nothing left to negotiate
    this.server.to(to).emit(SOCKET_EVENTS.RTC_SIGNAL, {
      roomId,
      from: client.id,
      fromUserId: client.data.user.id,
      channel,
      signal,
    });
  }

  /** A listener whose network can't reach this singer directly takes the voice through the server. */
  @SubscribeMessage(SOCKET_EVENTS.VOICE_RELAY_JOIN)
  async onVoiceRelayJoin(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(voiceRelaySchema)) { roomId, singer, opus }: VoiceRelayInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.mic);
    client.data.voiceOpus = opus === true;
    if (!(await this.singers(roomId)).some((s) => s.socketId === singer)) return;
    const relay = relayRoom(roomId, singer);
    await client.join(relay);
    await this.notifyDemand(relay);
  }

  @SubscribeMessage(SOCKET_EVENTS.VOICE_RELAY_LEAVE)
  async onVoiceRelayLeave(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(voiceRelaySchema)) { roomId, singer }: VoiceRelayInput,
  ): Promise<void> {
    const relay = relayRoom(roomId, singer);
    if (!client.rooms.has(relay)) return;
    await client.leave(relay);
    await this.notifyDemand(relay);
  }

  /**
   * 10 ms of a singer's voice, forwarded to their relay listeners. Not
   * volatile: that drops every chunk sent while the previous write is still
   * in flight, which at 100 chunks a second loses about a third of them.
   */
  @SubscribeMessage(SOCKET_EVENTS.VOICE_CHUNK)
  async onVoiceChunk(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(voiceChunkSchema)) chunk: VoiceChunkInput,
  ): Promise<void> {
    assertJoined(client, chunk.roomId);
    consumeRateLimit(client, RATE_LIMITS.voiceChunk);
    if (!(await this.holdsMic(client.id, chunk.roomId))) return;
    this.server
      .to(relayRoom(chunk.roomId, client.id))
      .emit(SOCKET_EVENTS.VOICE_CHUNK, {
        roomId: chunk.roomId,
        from: client.id,
        seq: chunk.seq,
        t: chunk.t,
        codec: chunk.codec,
        sampleRate: chunk.sampleRate,
        data: chunk.data as unknown as ArrayBuffer,
      });
  }

  /** Cached for a moment: chunks arrive 50 times a second. */
  private async holdsMic(socketId: string, roomId: string): Promise<boolean> {
    const rooms = this.confirmedSingers.get(socketId);
    const confirmedAt = rooms?.get(roomId);
    if (confirmedAt !== undefined && Date.now() - confirmedAt < SINGER_CHECK_MS) return true;
    const holds = (await this.redis().hexists(this.key(roomId), socketId)) === 1;
    if (holds) this.confirmedSingers.set(socketId, (rooms ?? new Map<string, number>()).set(roomId, Date.now()));
    else rooms?.delete(roomId);
    return holds;
  }

  private notifyDemand(relay: string): Promise<void> {
    return notifyRelayDemand(this.server, relay);
  }

  /** `leaving`: a socket on its way out, still listed in the room until it's gone. */
  private async dropMic(roomId: string, socketId: string, leaving?: string): Promise<void> {
    const removed = await this.redis().hdel(this.key(roomId), socketId);
    if (removed > 0) {
      await this.fillFromLine(roomId, leaving);
      await this.broadcast(roomId, leaving);
    }
  }

  private async leaveLine(roomId: string, socketId: string, leaving?: string): Promise<void> {
    if (await this.removeFromLine(roomId, socketId)) await this.broadcast(roomId, leaving);
  }

  /** Every mic and place in line of one user (the host removed them). */
  private async dropUser(roomId: string, userId: string): Promise<void> {
    const stored = await this.redis().hgetall(this.key(roomId));
    const theirs = Object.entries(stored)
      .filter(([, json]) => parseMic(json)?.userId === userId)
      .map(([socketId]) => socketId);
    if (theirs.length > 0) await this.redis().hdel(this.key(roomId), ...theirs);
    for (const raw of await this.redis().lrange(this.lineKey(roomId), 0, -1)) {
      if (parseLineEntry(raw)?.userId === userId) await this.redis().lrem(this.lineKey(roomId), 0, raw);
    }
    await this.fillFromLine(roomId);
    await this.broadcast(roomId);
  }

  /**
   * Hands free mics to the people at the front of the line. Each gets
   * MIC_TURN (their tab opens the mic by itself) and TURN_HOLD_MS to do so.
   */
  private async fillFromLine(roomId: string, leaving?: string): Promise<void> {
    const [singers, maxSingers] = await Promise.all([this.singers(roomId), this.maxSingers(roomId)]);
    let free = maxSingers - singers.filter((s) => s.socketId !== leaving).length;
    if (free <= 0) return;
    const live = new Set((await this.server.in(roomId).fetchSockets()).map((s) => s.id));
    while (free > 0) {
      const raw = await this.redis().lpop(this.lineKey(roomId));
      if (raw === null) break;
      const entry = parseLineEntry(raw);
      if (!entry || !live.has(entry.socketId) || entry.socketId === leaving) continue;
      const mic: StoredMic = { userId: entry.userId, displayName: entry.displayName, since: Date.now(), confirmed: false };
      if (!(await this.claimMic(roomId, entry.socketId, mic, maxSingers))) {
        // Someone else took the last mic meanwhile: keep their place at the front.
        await this.redis().lpush(this.lineKey(roomId), raw);
        break;
      }
      free -= 1;
      this.server.to(entry.socketId).emit(SOCKET_EVENTS.MIC_TURN, { roomId, holdMs: TURN_HOLD_MS });
      void this.notificationsService
        .notify(entry.userId, {
          type: "sing_turn",
          title: "Your turn to sing",
          body: "A mic is free — it's opening for you now",
          link: `/room/${roomId}`,
        })
        .catch((error: unknown) => this.logFailure(roomId, error));
      setTimeout(() => {
        this.expireTurn(roomId, entry.socketId).catch((error: unknown) => this.logFailure(roomId, error));
      }, TURN_HOLD_MS).unref();
    }
  }

  /** The turn went unanswered (tab asleep, mic blocked): it passes to the next in line. */
  private async expireTurn(roomId: string, socketId: string): Promise<void> {
    const stored = await this.redis().hget(this.key(roomId), socketId);
    if (stored === null || parseMic(stored)?.confirmed !== false) return;
    await this.dropMic(roomId, socketId);
  }

  /**
   * A new song: with people waiting, the singers who have held a mic the
   * longest hand it on — one per person waiting.
   */
  private async rotate(roomId: string): Promise<void> {
    const line = await this.line(roomId);
    if (line.length === 0) return;
    const singers = await this.singers(roomId); // oldest mic first
    for (const singer of singers.slice(0, line.length)) {
      await this.redis().hdel(this.key(roomId), singer.socketId);
    }
    await this.fillFromLine(roomId);
    await this.broadcast(roomId);
  }

  private async claimMic(roomId: string, socketId: string, mic: StoredMic, maxSingers: number): Promise<boolean> {
    const claimed = await this.redis().eval(CLAIM_MIC_SCRIPT, 1, this.key(roomId), socketId, JSON.stringify(mic), maxSingers);
    return claimed === 1;
  }

  private async removeFromLine(roomId: string, socketId: string): Promise<boolean> {
    for (const raw of await this.redis().lrange(this.lineKey(roomId), 0, -1)) {
      if (parseLineEntry(raw)?.socketId === socketId) {
        await this.redis().lrem(this.lineKey(roomId), 0, raw);
        return true;
      }
    }
    return false;
  }

  /** People waiting, first in line first; prunes tabs that are gone. */
  private async line(roomId: string): Promise<LineEntry[]> {
    const raws = await this.redis().lrange(this.lineKey(roomId), 0, -1);
    if (raws.length === 0) return [];
    const live = new Set((await this.server.in(roomId).fetchSockets()).map((s) => s.id));
    const entries: LineEntry[] = [];
    for (const raw of raws) {
      const entry = parseLineEntry(raw);
      if (entry && live.has(entry.socketId)) entries.push(entry);
      else await this.redis().lrem(this.lineKey(roomId), 0, raw);
    }
    return entries;
  }

  /** The room's mic slots (a host setting), never more than every listener can mix. */
  private async maxSingers(roomId: string): Promise<number> {
    const room = await this.roomsService.findRoomSettings(roomId);
    return Math.min(MAX_SINGERS, Math.max(1, room?.maxSingers ?? MAX_SINGERS));
  }

  private async micState(roomId: string, leaving?: string): Promise<MicStatePayload> {
    const [singers, line, maxSingers] = await Promise.all([this.singers(roomId), this.line(roomId), this.maxSingers(roomId)]);
    return {
      roomId,
      singers: singers.filter((s) => s.socketId !== leaving),
      line: line.filter((entry) => entry.socketId !== leaving),
      maxSingers,
    };
  }

  private async broadcast(roomId: string, leaving?: string): Promise<void> {
    this.server.to(roomId).emit(SOCKET_EVENTS.MIC_STATE, await this.micState(roomId, leaving));
  }

  /** Current singers, oldest mic first; prunes entries whose socket is no longer in the room. */
  private async singers(roomId: string): Promise<MicSinger[]> {
    const [stored, sockets] = await Promise.all([
      this.redis().hgetall(this.key(roomId)),
      this.server.in(roomId).fetchSockets(),
    ]);
    const live = new Set(sockets.map((s) => s.id));
    const stale = Object.keys(stored).filter((socketId) => !live.has(socketId));
    if (stale.length > 0) await this.redis().hdel(this.key(roomId), ...stale);
    return Object.entries(stored)
      .filter(([socketId]) => live.has(socketId))
      .map(([socketId, json]) => ({ socketId, mic: parseMic(json) }))
      .filter((entry): entry is { socketId: string; mic: StoredMic } => entry.mic !== null)
      .sort((a, b) => a.mic.since - b.mic.since)
      .map(({ socketId, mic }) => ({ socketId, userId: mic.userId, displayName: mic.displayName }));
  }

  private key(roomId: string): string {
    return `room:${roomId}:mic`;
  }

  private lineKey(roomId: string): string {
    return `room:${roomId}:micline`;
  }

  private redis() {
    return this.redisService.getClient();
  }

  private logFailure(roomId: string, error: unknown): void {
    this.logger.warn(`Mic update failed for room ${roomId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function micFull(message: string): HttpException {
  return new HttpException({ success: false, error: { code: ERROR_CODES.MIC_FULL, message } }, HttpStatus.CONFLICT);
}

function parseMic(raw: string): StoredMic | null {
  try {
    const value = JSON.parse(raw) as Partial<StoredMic>;
    return typeof value.userId === "string" && typeof value.displayName === "string" && typeof value.since === "number"
      ? { userId: value.userId, displayName: value.displayName, since: value.since, confirmed: value.confirmed }
      : null;
  } catch {
    return null;
  }
}

function parseLineEntry(raw: string): LineEntry | null {
  try {
    const value = JSON.parse(raw) as Partial<LineEntry>;
    return typeof value.socketId === "string" && typeof value.userId === "string" && typeof value.displayName === "string"
      ? { socketId: value.socketId, userId: value.userId, displayName: value.displayName }
      : null;
  } catch {
    return null;
  }
}
