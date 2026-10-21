import { z } from "zod";

export const searchTracksQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchTracksQuery = z.infer<typeof searchTracksQuerySchema>;

/** POST /music/resolve — a YouTube link (watch, youtu.be, shorts, music) or bare video id. */
export const resolveTrackSchema = z.object({
  url: z.string().trim().min(11).max(300),
});
export type ResolveTrackInput = z.infer<typeof resolveTrackSchema>;

export const MAX_ARTIST_IMAGE_NAMES = 40;

/** GET /music/artist-images?names=A,B,C — comma-separated artist names. */
export const artistImagesQuerySchema = z.object({
  names: z
    .string()
    .max(2_000)
    .transform((value) =>
      [...new Set(value.split(",").map((name) => name.trim()).filter((name) => name.length > 0 && name.length <= 60))],
    )
    .pipe(z.array(z.string()).min(1).max(MAX_ARTIST_IMAGE_NAMES)),
});
export type ArtistImagesQuery = z.infer<typeof artistImagesQuerySchema>;

/** POST /tracks/:id/lyrics/offset — the timing shift a listener settled on (ms, + shows words sooner). */
export const lyricsOffsetSchema = z.object({
  offsetMs: z.number().int().min(-600_000).max(600_000),
});
export type LyricsOffsetInput = z.infer<typeof lyricsOffsetSchema>;
