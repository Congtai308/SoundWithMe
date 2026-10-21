/**
 * Genre slugs shared by onboarding (web), validation and listening-history
 * classification (api). Stored on user accounts — never rename or remove one.
 */
export const GENRE_SLUGS = [
  "vpop",
  "ballad",
  "rap-viet",
  "lofi",
  "remix",
  "kpop",
  "usuk",
  "acoustic",
  "bolero",
  "oldies",
  "indie",
  "rnb",
  "rock",
  "tiktok",
  "karaoke",
  "anime",
] as const;

export type GenreSlug = (typeof GENRE_SLUGS)[number];
