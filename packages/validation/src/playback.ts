import { z } from "zod";

const roomIdSchema = z.string().min(1);
const positionMsSchema = z.number().int().min(0);

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

export const queueAddEventSchema = z.object({
  roomId: roomIdSchema,
  trackId: z.string().min(1),
});

export const queueRemoveEventSchema = z.object({
  roomId: roomIdSchema,
  queueItemId: z.string().min(1),
});

export type PlayEventInput = z.infer<typeof playEventSchema>;
export type PauseEventInput = z.infer<typeof pauseEventSchema>;
export type SeekEventInput = z.infer<typeof seekEventSchema>;
export type ChangeTrackEventInput = z.infer<typeof changeTrackEventSchema>;
export type QueueAddEventInput = z.infer<typeof queueAddEventSchema>;
export type QueueRemoveEventInput = z.infer<typeof queueRemoveEventSchema>;
