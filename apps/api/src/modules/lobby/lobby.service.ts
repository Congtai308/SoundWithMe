import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ERROR_CODES } from "@soundwithme/constants";
import { AppEventsService } from "../../common/events/app-events.service";
import { RedisService } from "../../database/redis/redis.service";
import { MusicService } from "../music/music.service";
import { QueueService } from "../queue/queue.service";
import { RoomsService } from "../rooms/rooms.service";
import { LOBBY_TOPICS, lobbyTopic, type LobbyTopic } from "../rooms/lobby.topics";
import { UsersService } from "../users/users.service";

/** Songs added at a time, and the fewest a lobby room keeps waiting. */
export const LOBBY_BATCH = 10;
/** While people listen, a room that's down to this many queued songs gets the next batch. */
const LOW_QUEUE = 3;
/** Songs a room played lately that it won't pick again while it has others. */
const RECENT_WINDOW = 40;
const POOL_TTL_SECONDS = 24 * 60 * 60;
/** An empty pool (search off or out of quota) is asked again sooner. */
const EMPTY_POOL_TTL_SECONDS = 10 * 60;
const REFRESH_LOCK_MS = 30_000;
/** Reopens a lobby room that ended somehow (and keeps names in step with lobby.topics.ts). */
const ENSURE_INTERVAL_MS = 10 * 60_000;
const HOST_DISPLAY_NAME = "SoundWithMe Radio";

/**
 * The six always-open themed rooms (LOBBY_TOPICS). Each is a public room
 * hosted by an account of the app's own, and has songs waiting for whoever
 * comes in: joining tops the queue up to LOBBY_BATCH songs from the topic's
 * pool and moves a finished song on, so a room nobody was in still plays
 * something fresh. Off with LOBBY_ROOMS=0.
 */
@Injectable()
export class LobbyService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LobbyService.name);
  /** roomId → topic, for the rooms this instance opened or found. */
  private readonly rooms = new Map<string, LobbyTopic>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly roomsService: RoomsService,
    private readonly queueService: QueueService,
    private readonly musicService: MusicService,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
    private readonly events: AppEventsService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.configService.get<boolean>("app.lobbyRooms")) return;
    this.events.on("room.lobbyJoined", ({ roomId }) => this.refreshQuietly(roomId));
    // People listening keep a room going song by song; top it up before it runs dry.
    this.events.on("room.trackChanged", async ({ roomId }) => {
      if (!this.rooms.has(roomId)) return;
      if ((await this.queueService.upcomingCount(roomId)) <= LOW_QUEUE) await this.refreshQuietly(roomId);
    });
    // Not awaited: boot shouldn't wait on YouTube searches.
    void this.ensureRooms();
    this.timer = setInterval(() => void this.ensureRooms(), ENSURE_INTERVAL_MS).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Opens any lobby room that isn't live and gives each one songs. */
  async ensureRooms(): Promise<void> {
    for (const topic of LOBBY_TOPICS) {
      try {
        const host = await this.hostFor(topic);
        const room = await this.roomsService.ensureLobbyRoom(host.id, topic);
        this.rooms.set(room.id, topic);
        await this.refresh(room.id);
      } catch (error: unknown) {
        this.logger.warn(`Lobby room "${topic.slug}" not ready: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Tops the queue up to LOBBY_BATCH songs, then starts the next one if
   * nothing is playing or the song is over. One refresh per room at a time.
   */
  async refresh(roomId: string): Promise<void> {
    const topic = this.rooms.get(roomId) ?? lobbyTopic(await this.roomsService.findLobbyTopic(roomId));
    if (!topic) return;
    this.rooms.set(roomId, topic);
    const redis = this.redisService.getClient();
    const lockKey = `lobby:refresh-lock:${roomId}`;
    if ((await redis.set(lockKey, "1", "PX", REFRESH_LOCK_MS, "NX")) !== "OK") return;
    try {
      const room = await this.roomsService.getRoomForActiveMember(roomId, (await this.hostFor(topic)).id);
      const host = { id: room.hostId, displayName: HOST_DISPLAY_NAME };

      let queue = null;
      if ((await this.queueService.upcomingCount(roomId)) < LOBBY_BATCH) {
        const picks = await this.pickSongs(roomId, topic);
        if (picks.length > 0) queue = await this.queueService.addMany(roomId, host, picks);
      }

      let state = null;
      const { needed, version } = await this.queueService.needsNextSong(roomId);
      if (needed) {
        try {
          const advanced = await this.queueService.playNext(roomId, null, version);
          if (advanced) ({ state, queue } = advanced);
        } catch (error: unknown) {
          if (!isQueueEmpty(error)) throw error;
        }
      }
      if (queue || state) {
        this.events.emit("room.lobbyRefreshed", { roomId, state, queue: queue ?? (await this.queueService.listUpcoming(roomId)) });
      }
    } finally {
      await redis.del(lockKey);
    }
  }

  private async refreshQuietly(roomId: string): Promise<void> {
    try {
      await this.refresh(roomId);
    } catch (error: unknown) {
      this.logger.warn(`Lobby room ${roomId} refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** LOBBY_BATCH songs from the topic's pool, ones the room hasn't played lately first. */
  private async pickSongs(roomId: string, topic: LobbyTopic): Promise<string[]> {
    const pool = await this.poolFor(topic);
    const recent = new Set(await this.queueService.recentTrackIds(roomId, RECENT_WINDOW));
    const fresh = shuffle(pool.filter((id) => !recent.has(id)));
    const again = shuffle(pool.filter((id) => recent.has(id)));
    return [...fresh, ...again].slice(0, LOBBY_BATCH);
  }

  /** Track ids found by the topic's searches, cached for a day. */
  private async poolFor(topic: LobbyTopic): Promise<string[]> {
    const redis = this.redisService.getClient();
    const key = `lobby:pool:${topic.slug}`;
    const cached = await redis.get(key);
    if (cached !== null) return JSON.parse(cached) as string[];

    const ids = new Set<string>();
    for (const query of topic.queries) {
      try {
        for (const track of await this.musicService.search(query, 25)) ids.add(track.id);
      } catch (error: unknown) {
        this.logger.warn(`Lobby search "${query}" failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const pool = [...ids];
    await redis.set(key, JSON.stringify(pool), "EX", pool.length > 0 ? POOL_TTL_SECONDS : EMPTY_POOL_TTL_SECONDS);
    return pool;
  }

  /** The app's own account that hosts a topic's room (one per room: a host has one live room). */
  private async hostFor(topic: LobbyTopic) {
    const username = `swm-radio-${topic.slug}`;
    const existing = await this.usersService.findByUsername(username);
    if (existing) return existing;
    try {
      return await this.usersService.create({ username, displayName: HOST_DISPLAY_NAME, authMethods: [], isGuest: false });
    } catch (error: unknown) {
      const winner = await this.usersService.findByUsername(username);
      if (!winner) throw error;
      return winner;
    }
  }
}

function isQueueEmpty(error: unknown): boolean {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  return (response as { error?: { code?: string } } | undefined)?.error?.code === ERROR_CODES.QUEUE_EMPTY;
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
