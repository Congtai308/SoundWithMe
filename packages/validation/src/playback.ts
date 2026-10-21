import { z } from "zod";

const roomIdSchema = z.string().min(1);
const positionMsSchema = z.number().int().min(0);

/** ROOM_JOIN / ROOM_LEAVE / SYNC_REQUEST — events that only name a room. */
export const roomScopedEventSchema = z.object({
  roomId: roomIdSchema,
});

export const playEventSchema = z.object({
  roomId: roomIdSchema,
  positionMs: positionMsSchema,
});

export const pauseEventSchema = z.object({
  roomId: roomIdSchema,
  positionMs: positionMsSchema,
});

export const seekEventSchema = z.object({
  roomId: roomIdSchema,
  positionMs: positionMsSchema,
});

export const changeTrackEventSchema = z.object({
  roomId: roomIdSchema,
  trackId: z.string().min(1),
});

/** fromVersion 0 = "nothing has played in this room yet" (start the queue). */
export const nextEventSchema = z.object({
  roomId: roomIdSchema,
  fromVersion: z.number().int().min(0),
  /** Sent by every tab when the song finishes, so the room moves on even if the host is away. */
  ended: z.boolean().optional(),
});

export const queueAddEventSchema = z.object({
  roomId: roomIdSchema,
  trackId: z.string().min(1),
});

/** Matches the /music/resolve limit (20 a minute): one paste of links at most. */
export const MAX_QUEUE_ADD_MANY = 20;

export const queueAddManyEventSchema = z.object({
  roomId: roomIdSchema,
  trackIds: z.array(z.string().min(1)).min(1).max(MAX_QUEUE_ADD_MANY),
});

export const queueRemoveEventSchema = z.object({
  roomId: roomIdSchema,
  queueItemId: z.string().min(1),
});

/** 1 = play sooner, -1 = later, 0 = take my vote back. */
export const queueVoteEventSchema = z.object({
  roomId: roomIdSchema,
  queueItemId: z.string().min(1),
  value: z.union([z.literal(1), z.literal(0), z.literal(-1)]),
});

/** Vote to skip the song playing now (or take the vote back). */
export const skipVoteEventSchema = z.object({
  roomId: roomIdSchema,
  vote: z.boolean(),
});

const speedSchema = z.number().min(0.5).max(2);

/** Fields a caller may change; unknown keys (version, serverTimestamp, roomId) are stripped. */
export const playbackStateUpdateSchema = z.object({
  trackId: z.string().min(1).optional(),
  isPlaying: z.boolean().optional(),
  positionMs: positionMsSchema.optional(),
  speed: speedSchema.optional(),
});

/** Full stored state — used to validate what comes back out of Redis. */
export const playbackStateSchema = z.object({
  roomId: roomIdSchema,
  trackId: z.string().min(1),
  isPlaying: z.boolean(),
  positionMs: positionMsSchema,
  serverTimestamp: z.number().int().positive(),
  version: z.number().int().positive(),
  speed: speedSchema,
});

export type PlaybackStateUpdateInput = z.infer<typeof playbackStateUpdateSchema>;
export type PlaybackStateRecord = z.infer<typeof playbackStateSchema>;
export type RoomScopedEventInput = z.infer<typeof roomScopedEventSchema>;
export type PlayEventInput = z.infer<typeof playEventSchema>;
export type PauseEventInput = z.infer<typeof pauseEventSchema>;
export type SeekEventInput = z.infer<typeof seekEventSchema>;
export type ChangeTrackEventInput = z.infer<typeof changeTrackEventSchema>;
export type NextEventInput = z.infer<typeof nextEventSchema>;
export type QueueAddEventInput = z.infer<typeof queueAddEventSchema>;
export type QueueAddManyEventInput = z.infer<typeof queueAddManyEventSchema>;
export type QueueRemoveEventInput = z.infer<typeof queueRemoveEventSchema>;
export type QueueVoteEventInput = z.infer<typeof queueVoteEventSchema>;
export type SkipVoteEventInput = z.infer<typeof skipVoteEventSchema>;
