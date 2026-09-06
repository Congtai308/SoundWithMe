import { z } from "zod";

export const roomTypeSchema = z.enum([
  "public",
  "friends",
  "private",
  "duo",
  "community",
]);

export const roomSettingsSchema = z.object({
  whoCanControlPlayback: z.enum(["host", "everyone"]),
  whoCanAddSongs: z.enum(["host", "everyone", "vote"]),
  chatEnabled: z.boolean(),
  reactionsEnabled: z.boolean(),
  songRequestsEnabled: z.boolean(),
  maxListeners: z.number().int().min(2).max(500),
});

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  type: roomTypeSchema,
  settings: roomSettingsSchema.partial().optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
