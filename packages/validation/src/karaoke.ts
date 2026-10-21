import { z } from "zod";

/** Upper bound on mics open at once; each room picks 1–4 (settings.maxSingers). */
export const MAX_SINGERS = 4;
/** People waiting for a mic, per room. */
export const MAX_SING_LINE = 20;

export const micRoomSchema = z.object({ roomId: z.string().min(1) });

export const micReleaseSchema = z.object({
  roomId: z.string().min(1),
  socketId: z.string().min(1).max(64).optional(),
});

const rtcSignalBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["offer", "answer"]),
    sdp: z.string().min(1).max(20_000),
    latencyMs: z.number().min(0).max(1_000).optional(),
  }),
  z.object({
    type: z.literal("candidate"),
    candidate: z.string().max(2_000),
    sdpMid: z.string().max(64).nullable(),
    sdpMLineIndex: z.number().int().min(0).max(64).nullable(),
  }),
]);

export const rtcSignalSchema = z.object({
  roomId: z.string().min(1),
  to: z.string().min(1).max(64),
  channel: z.enum(["listen", "sing"]),
  signal: rtcSignalBodySchema,
});

export const voiceRelaySchema = z.object({
  roomId: z.string().min(1),
  singer: z.string().min(1).max(64),
  opus: z.boolean().optional(),
});

/** Relay PCM fallback: 24 kHz mono 16-bit, 10 ms per chunk (480 bytes). Opus runs at 48 kHz. */
export const VOICE_RELAY_SAMPLE_RATE = 24_000;
const MAX_VOICE_CHUNK_BYTES = 4_096;

const byteLength = (value: unknown): number =>
  // Arrives as a Buffer on the server. Checked without instanceof, which fails across realms.
  ArrayBuffer.isView(value) || Object.prototype.toString.call(value) === "[object ArrayBuffer]"
    ? (value as ArrayBufferLike).byteLength
    : 0;

export const voiceChunkSchema = z
  .object({
    roomId: z.string().min(1),
    seq: z.number().int().min(0),
    t: z.number().finite(),
    codec: z.enum(["opus", "pcm"]),
    sampleRate: z.number().int().min(8_000).max(48_000),
    data: z.custom<Uint8Array>((value) => {
      const size = byteLength(value);
      return size > 0 && size <= MAX_VOICE_CHUNK_BYTES;
    }, "data must be 1 byte to 4 KB of audio"),
  })
  .refine((chunk) => chunk.codec !== "pcm" || byteLength(chunk.data) % 2 === 0, "PCM must be 16-bit");

export type MicRoomInput = z.infer<typeof micRoomSchema>;
export type MicReleaseInput = z.infer<typeof micReleaseSchema>;
export type RtcSignalInput = z.infer<typeof rtcSignalSchema>;
export type VoiceRelayInput = z.infer<typeof voiceRelaySchema>;
export type VoiceChunkInput = z.infer<typeof voiceChunkSchema>;
