import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
import { RedisService } from "../../database/redis/redis.service";

/** An instance that stops heartbeating this long is presumed dead and its sockets offline. */
const INSTANCE_TTL_SECONDS = 45;
const HEARTBEAT_MS = 15_000;
/** Safety net: a user's presence hash disappears after a day without any write. */
const PRESENCE_TTL_SECONDS = 60 * 60 * 24;

interface SocketPresence {
  /** API instance holding the socket, so a crashed instance's sockets can be ignored. */
  i: string;
  /** Room the socket is in right now, or null. */
  r: string | null;
}

export interface UserPresence {
  online: boolean;
  /** Rooms the user's tabs are in right now (usually zero or one). */
  roomIds: string[];
}

/**
 * Who is online, and in which room, across every API instance — Redis hash
 * `presence:<userId>` (socketId → { instance, room }). Instances heartbeat
 * `presence:instance:<id>`; entries from an instance whose heartbeat expired
 * (a crash, a kill -9) are ignored on read and pruned.
 */
@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private readonly instanceId = randomUUID();
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit(): Promise<void> {
    await this.beat();
    this.heartbeat = setInterval(() => {
      this.beat().catch((error: unknown) => this.logger.warn(`Presence heartbeat failed: ${String(error)}`));
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    // Our sockets are going away with us: stop vouching for them right now.
    await this.redis()
      .del(this.instanceKey(this.instanceId))
      .catch(() => undefined);
  }

  async connected(userId: string, socketId: string): Promise<void> {
    await this.write(userId, socketId, null);
  }

  async enteredRoom(userId: string, socketId: string, roomId: string | null): Promise<void> {
    await this.write(userId, socketId, roomId);
  }

  /** The server took this socket out of `roomId` (removed by the host, room ended). Keeps its instance. */
  async leftRoom(userId: string, socketId: string, roomId: string): Promise<void> {
    const raw = await this.redis().hget(this.userKey(userId), socketId);
    if (raw === null) return;
    const value = parse(raw);
    if (value.r !== roomId) return;
    await this.redis().hset(this.userKey(userId), socketId, JSON.stringify({ ...value, r: null }));
  }

  async disconnected(userId: string, socketId: string): Promise<void> {
    await this.redis().hdel(this.userKey(userId), socketId);
  }

  async getMany(userIds: string[]): Promise<Map<string, UserPresence>> {
    const result = new Map<string, UserPresence>();
    if (userIds.length === 0) return result;
    const pipeline = this.redis().pipeline();
    for (const userId of userIds) pipeline.hgetall(this.userKey(userId));
    const replies = (await pipeline.exec()) ?? [];

    const entries = userIds.map((userId, index) => {
      const reply = replies[index]?.[1];
      const hash = reply && typeof reply === "object" ? (reply as Record<string, string>) : {};
      return { userId, sockets: Object.entries(hash).map(([socketId, raw]) => ({ socketId, ...parse(raw) })) };
    });

    const instances = [...new Set(entries.flatMap((e) => e.sockets.map((s) => s.i)))];
    const alive = new Set<string>();
    if (instances.length > 0) {
      const flags = await this.redis().mget(...instances.map((id) => this.instanceKey(id)));
      instances.forEach((id, index) => {
        if (flags[index] !== null) alive.add(id);
      });
    }

    const prune = this.redis().pipeline();
    let pruned = false;
    for (const { userId, sockets } of entries) {
      const live = sockets.filter((s) => alive.has(s.i));
      for (const dead of sockets.filter((s) => !alive.has(s.i))) {
        prune.hdel(this.userKey(userId), dead.socketId);
        pruned = true;
      }
      result.set(userId, {
        online: live.length > 0,
        roomIds: [...new Set(live.map((s) => s.r).filter((r): r is string => r !== null))],
      });
    }
    if (pruned) await prune.exec();
    return result;
  }

  private async write(userId: string, socketId: string, roomId: string | null): Promise<void> {
    const value: SocketPresence = { i: this.instanceId, r: roomId };
    await this.redis()
      .multi()
      .hset(this.userKey(userId), socketId, JSON.stringify(value))
      .expire(this.userKey(userId), PRESENCE_TTL_SECONDS)
      .exec();
  }

  private async beat(): Promise<void> {
    await this.redis().set(this.instanceKey(this.instanceId), "1", "EX", INSTANCE_TTL_SECONDS);
  }

  private userKey(userId: string): string {
    return `presence:${userId}`;
  }

  private instanceKey(instanceId: string): string {
    return `presence:instance:${instanceId}`;
  }

  private redis() {
    return this.redisService.getClient();
  }
}

function parse(raw: string): SocketPresence {
  try {
    const value = JSON.parse(raw) as Partial<SocketPresence>;
    return { i: typeof value.i === "string" ? value.i : "", r: typeof value.r === "string" ? value.r : null };
  } catch {
    return { i: "", r: null };
  }
}
