import { HttpException, HttpStatus } from "@nestjs/common";
import { ERROR_CODES } from "@soundwithme/constants";
import type { AppSocket } from "./realtime.types";

export interface RateLimit {
  bucket: string;
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  playbackControl: { bucket: "playback", limit: 20, windowMs: 5_000 },
  roomJoin: { bucket: "roomJoin", limit: 10, windowMs: 10_000 },
  queue: { bucket: "queue", limit: 10, windowMs: 10_000 },
  vote: { bucket: "vote", limit: 20, windowMs: 10_000 },
  moderation: { bucket: "moderation", limit: 20, windowMs: 10_000 },
  invite: { bucket: "invite", limit: 10, windowMs: 60_000 },
  chat: { bucket: "chat", limit: 5, windowMs: 5_000 },
  reaction: { bucket: "reaction", limit: 15, windowMs: 5_000 },
  mic: { bucket: "mic", limit: 10, windowMs: 10_000 },
  // ICE candidates come in bursts: several per peer, and a singer has one peer per listener.
  rtcSignal: { bucket: "rtc", limit: 300, windowMs: 10_000 },
  // Relayed voice: 100 chunks (10 ms each) a second, with room for bursts after a stall.
  voiceChunk: { bucket: "voice", limit: 400, windowMs: 2_000 },
} satisfies Record<string, RateLimit>;

/** Sliding-window limit per socket and bucket; throws RATE_LIMITED when exceeded. */
export function consumeRateLimit(client: AppSocket, { bucket, limit, windowMs }: RateLimit): void {
  const now = Date.now();
  const recent = (client.data.rateBuckets[bucket] ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    client.data.rateBuckets[bucket] = recent;
    throw new HttpException(
      { success: false, error: { code: ERROR_CODES.RATE_LIMITED, message: "Slow down a little" } },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  recent.push(now);
  client.data.rateBuckets[bucket] = recent;
}

/**
 * The socket must have passed ROOM_JOIN (which checks membership) for this
 * room. Its own id, its user room and voice relays are Socket.IO rooms too,
 * but never listening rooms.
 */
export function assertJoined(client: AppSocket, roomId: string): void {
  const reserved = roomId === client.id || roomId.startsWith("user:") || roomId.startsWith("voice:");
  if (reserved || !client.rooms.has(roomId)) {
    throw new HttpException(
      { success: false, error: { code: ERROR_CODES.NOT_ROOM_MEMBER, message: "Join this room first" } },
      HttpStatus.FORBIDDEN,
    );
  }
}
