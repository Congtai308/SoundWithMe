import { z } from "zod";

const note = z.string().trim().max(2000);

/** POST /messages/with/:userId — text, a song (with an optional note) or a room invite. */
export const sendDirectMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), content: note.min(1) }),
  z.object({ kind: z.literal("track"), trackId: z.string().trim().min(1).max(64), content: note.optional() }),
  z.object({ kind: z.literal("room"), roomId: z.string().trim().min(1).max(64), content: note.optional() }),
]);
export type SendDirectMessageInput = z.infer<typeof sendDirectMessageSchema>;

export const directMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type DirectMessagesQuery = z.infer<typeof directMessagesQuerySchema>;
