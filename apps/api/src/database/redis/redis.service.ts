import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import type { PlaybackState } from "@soundwithme/types";
import { REDIS_CLIENT } from "./redis.constants";

// Room state has no fixed lifetime tied to "session length" up front —
// TTL is refreshed on every write, so an idle room's state simply expires.
const ROOM_STATE_TTL_SECONDS = 60 * 30;

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  private roomStateKey(roomId: string): string {
    return `room:${roomId}:state`;
  }

  private roomPresenceKey(roomId: string): string {
    return `room:${roomId}:presence`;
  }

  async getPlaybackState(roomId: string): Promise<PlaybackState | null> {
    const raw = await this.client.get(this.roomStateKey(roomId));
    return raw ? (JSON.parse(raw) as PlaybackState) : null;
  }

  /**
   * Persists the authoritative playback state. Callers are responsible for
   * incrementing `version` themselves based on the previous read — this
   * method does not do read-modify-write locking. See Architecture Review §7
   * for the race-condition-handling discussion; if concurrent writers to the
   * same room become a real issue, revisit with a Lua script / WATCH-based
   * optimistic transaction rather than adding a generic lock speculatively.
   */
  async setPlaybackState(roomId: string, state: PlaybackState): Promise<void> {
    await this.client.set(
      this.roomStateKey(roomId),
      JSON.stringify(state),
      "EX",
      ROOM_STATE_TTL_SECONDS,
    );
  }

  async addPresence(roomId: string, userId: string): Promise<void> {
    await this.client.sadd(this.roomPresenceKey(roomId), userId);
  }

  async removePresence(roomId: string, userId: string): Promise<void> {
    await this.client.srem(this.roomPresenceKey(roomId), userId);
  }

  async getPresence(roomId: string): Promise<string[]> {
    return this.client.smembers(this.roomPresenceKey(roomId));
  }

  getClient(): Redis {
    return this.client;
  }
}
