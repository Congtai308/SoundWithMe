import { z } from "zod";

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  bio: z.string().trim().max(300).nullable().optional(),
  // Avatar upload itself is out of scope here (see Architecture Review §55 —
  // needs real upload validation/object storage) — this only accepts an
  // already-hosted URL for now, e.g. from a future upload endpoint.
  avatarUrl: z.string().trim().url().nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const MAX_PREFERRED_GENRES = 20;
export const MAX_PREFERRED_ARTISTS = 30;

/** Duplicates (case-insensitive) are dropped, keeping the first spelling. */
const uniqueNames = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const musicPreferencesSchema = z.object({
  genres: z
    .array(z.string().trim().regex(/^[a-z0-9-]{1,40}$/))
    .max(MAX_PREFERRED_GENRES)
    .transform(uniqueNames),
  artists: z
    .array(z.string().trim().min(1).max(60))
    .max(MAX_PREFERRED_ARTISTS)
    .transform(uniqueNames),
});
export type MusicPreferencesInput = z.infer<typeof musicPreferencesSchema>;

export const recordListenSchema = z.object({
  trackId: z.string().trim().min(1).max(64),
});
export type RecordListenInput = z.infer<typeof recordListenSchema>;
