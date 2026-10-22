import { z } from "zod";

/** The avatar set people pick from (apps/web/public/avatars/<id>.svg). */
export const AVATAR_PRESETS = [
  "rocker",
  "diva",
  "rapper",
  "bolero",
  "idol",
  "pompadour",
  "disco",
  "shower",
  "cat",
  "frog",
  "dino",
  "offkey",
] as const;
export type AvatarPreset = (typeof AVATAR_PRESETS)[number];

export const avatarPresetUrl = (id: AvatarPreset) => `/avatars/${id}.svg`;

const PRESET_URLS = new Set<string>(AVATAR_PRESETS.map(avatarPresetUrl));

/**
 * An avatar that's safe to show other people: one of the presets, or a
 * Google profile photo set by Google sign-in. Anything else (an address
 * saved before avatars were limited to presets) is dropped.
 */
export function safeAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (PRESET_URLS.has(url)) return url;
  return GOOGLE_PHOTO.test(url) ? url : null;
}

/** https, a googleusercontent.com host, no user or port, then a path. */
const GOOGLE_PHOTO = /^https:\/\/([a-z0-9-]+\.)+googleusercontent\.com\/[^\s"'<>]*$/i;

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  bio: z.string().trim().max(300).nullable().optional(),
  // Only one of the app's own avatars (or none): an arbitrary URL would let
  // anyone load a tracking image into everyone's room. Google photos are set
  // by sign-in, not here.
  avatarUrl: z
    .enum(AVATAR_PRESETS.map(avatarPresetUrl) as [string, ...string[]])
    .nullable()
    .optional(),
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
