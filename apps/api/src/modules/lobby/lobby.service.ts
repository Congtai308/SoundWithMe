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
import { artistParts, isGoodSong, pickDistinct, songKeys, type PoolSong } from "./song-picks";

/** Songs added at a time, and the fewest a lobby room keeps waiting. */
export const LOBBY_BATCH = 10;
/** While people listen, a room that's down to this many queued songs gets the next batch. */
const LOW_QUEUE = 3;
/** Songs a room played lately that it won't pick again while it has others. */
const RECENT_WINDOW = 40;
const POOL_TTL_SECONDS = 3 * 24 * 60 * 60;
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
    // A topic taken off the list: its room ends like any other.
    for (const roomId of await this.roomsService.closeLobbyRoomsOutside(LOBBY_TOPICS.map((topic) => topic.slug))) {
      this.rooms.delete(roomId);
    }
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
      if (await this.tidyQueue(roomId, host.id)) queue = await this.queueService.listUpcoming(roomId);
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

  /** LOBBY_BATCH different songs from the topic's pool, none the same as one queued or played lately. */
  private async pickSongs(roomId: string, topic: LobbyTopic): Promise<string[]> {
    const pool = await this.poolFor(topic);
    const recent = await this.queueService.recentTracks(roomId, RECENT_WINDOW);
    let picks = pickDistinct(pool, recent, LOBBY_BATCH);
    if (picks.length < LOBBY_BATCH) {
      // The room has played most of the pool: songs from a while ago may come back, still no repeats in the queue.
      const queued = (await this.queueService.listUpcoming(roomId)).map((item) => item.track);
      const more = pickDistinct(pool, [...queued, ...picks], LOBBY_BATCH - picks.length);
      picks = [...picks, ...more];
    }
    return picks.map((song) => song.id);
  }

  /**
   * Takes out what the app queued itself that shouldn't be there: clips and
   * compilations from before the filter, and a second copy of a song.
   * Songs people added stay, whatever they are.
   */
  private async tidyQueue(roomId: string, hostId: string): Promise<boolean> {
    const seen = new Set<string>();
    let removed = false;
    const upcoming = await this.queueService.listUpcoming(roomId);
    const artists = artistParts(upcoming.map((item) => item.track));
    for (const item of upcoming) {
      const keys = songKeys(item.track.title, artists);
      const duplicate = keys.some((key) => seen.has(key));
      for (const key of keys) seen.add(key);
      if (item.addedBy !== hostId) continue;
      if (duplicate || !isGoodSong({ id: item.trackId, title: item.track.title, durationMs: item.track.durationMs })) {
        await this.queueService.remove(roomId, hostId, item.id);
        removed = true;
      }
    }
    return removed;
  }

  /** Songs found by the topic's searches, cached for a few days (each search costs quota). */
  private async poolFor(topic: LobbyTopic): Promise<PoolSong[]> {
    const redis = this.redisService.getClient();
    const key = `lobby:pool:v2:${topic.slug}`;
    const cached = await redis.get(key);
    if (cached !== null) return JSON.parse(cached) as PoolSong[];

    const songs = new Map<string, PoolSong>();
    for (const query of topic.queries) {
      try {
        for (const track of await this.musicService.search(query, 25)) {
          const song = { id: track.id, title: track.title, artistName: track.artistName, durationMs: track.durationMs };
          if (isGoodSong(song)) songs.set(song.id, song);
        }
      } catch (error: unknown) {
        this.logger.warn(`Lobby search "${query}" failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const pool = [...songs.values()];
    await redis.set(key, JSON.stringify(pool), "EX", pool.length > 0 ? POOL_TTL_SECONDS : EMPTY_POOL_TTL_SECONDS);
    return pool;
  }

  /** The app's own account that hosts a topic's room (one per room: a host has one live room). */
  private async hostFor(topic: LobbyTopic) {
    const username = `swm-radio-${topic.slug}`;
    const existing = await this.usersService.findByUsername(username);
    if (existing) return asAppAccount(existing);
    try {
      return await this.usersService.create({ username, displayName: HOST_DISPLAY_NAME, authMethods: [], isGuest: false });
    } catch (error: unknown) {
      const winner = await this.usersService.findByUsername(username);
      if (!winner) throw error;
      return asAppAccount(winner);
    }
  }
}

/**
 * People's usernames can't contain "-" (AuthService), so nobody can sign up
 * as a room's host. Still, an account anyone can sign in to never hosts one.
 */
function asAppAccount<T extends { authMethods: unknown[]; isGuest: boolean; username: string }>(user: T): T {
  if (user.authMethods.length > 0 || user.isGuest) throw new Error(`"${user.username}" isn't one of the app's own accounts`);
  return user;
}

function isQueueEmpty(error: unknown): boolean {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  return (response as { error?: { code?: string } } | undefined)?.error?.code === ERROR_CODES.QUEUE_EMPTY;
}
