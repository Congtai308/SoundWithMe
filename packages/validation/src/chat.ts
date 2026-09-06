import { z } from "zod";

// Length limit doubles as a basic spam/abuse guard alongside rate limiting.
export const sendMessageSchema = z.object({
  roomId: z.string().min(1),
  content: z.string().trim().min(1).max(1000),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const getMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;
