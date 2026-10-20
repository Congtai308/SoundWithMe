import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from "./redis.constants";

// Playback state lives in PlaybackService (modules/playback), which owns its
// own key and atomic versioning — this service stays a thin client wrapper.
@Injectable()
export class RedisService implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  /**
   * Shutdown (not module-destroy) hook: runs after Nest has closed the HTTP
   * and Socket.IO servers, so the Redis adapter has finished unsubscribing
   * and publishing before its connections go away.
   */
  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [this.subscriber, this.client]
        .filter((connection) => connection.status !== "end")
        .map((connection) => connection.quit()),
    );
  }

  private roomPresenceKey(roomId: string): string {
    return `room:${roomId}:presence`;
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
