import type { GenreSlug } from "@soundwithme/constants";
import type { ListeningProfile } from "@soundwithme/types";

export interface Genre {
  slug: GenreSlug;
  label: string;
  emoji: string;
  /** YouTube search used when recommending from this genre. */
  query: string;
  /** Tile background (Spotify-style colour block). */
  color: string;
}

/** Genres offered during onboarding. Slugs are stored on the account — never rename one. */
export const GENRES: Genre[] = [
  { slug: "vpop", label: "Nhạc trẻ V-Pop", emoji: "⭐", query: "nhạc trẻ hot nhất", color: "from-[#e8115b] to-[#8c0a37]" },
  { slug: "ballad", label: "Ballad / Trữ tình", emoji: "💔", query: "nhạc ballad buồn tâm trạng", color: "from-[#8d67ab] to-[#4a3460]" },
  { slug: "rap-viet", label: "Rap Việt", emoji: "🎤", query: "rap việt hay nhất", color: "from-[#ba5d07] to-[#5e2f04]" },
  { slug: "lofi", label: "Lofi / Chill", emoji: "🎧", query: "lofi chill nhạc việt", color: "from-[#477d95] to-[#22404d]" },
  { slug: "remix", label: "Remix / EDM", emoji: "⚡", query: "nhạc remix sôi động", color: "from-[#0d73ec] to-[#063a78]" },
  { slug: "kpop", label: "K-Pop", emoji: "💜", query: "kpop hits", color: "from-[#dc148c] to-[#6e0a46]" },
  { slug: "usuk", label: "US-UK", emoji: "🌎", query: "top english songs", color: "from-[#1e3264] to-[#0f1932]" },
  { slug: "acoustic", label: "Acoustic", emoji: "🎸", query: "acoustic cover", color: "from-[#608108] to-[#304004]" },
  { slug: "bolero", label: "Bolero", emoji: "🌹", query: "bolero trữ tình hay nhất", color: "from-[#b02897] to-[#58144c]" },
  { slug: "oldies", label: "Nhạc xưa", emoji: "🎻", query: "nhạc xưa bất hủ", color: "from-[#a56752] to-[#533429]" },
  { slug: "indie", label: "Indie Việt", emoji: "🌿", query: "indie việt", color: "from-[#148a08] to-[#0a4504]" },
  { slug: "rnb", label: "R&B / Soul", emoji: "🎷", query: "r&b soul playlist", color: "from-[#777777] to-[#3a3a3a]" },
  { slug: "rock", label: "Rock", emoji: "🤘", query: "rock việt hay nhất", color: "from-[#e91429] to-[#750a15]" },
  { slug: "tiktok", label: "Hot TikTok", emoji: "🔥", query: "nhạc hot tiktok", color: "from-[#ff4632] to-[#802319]" },
  { slug: "karaoke", label: "Karaoke", emoji: "🎙️", query: "karaoke beat chuẩn", color: "from-[#27856a] to-[#134335]" },
  { slug: "anime", label: "Anime / Game", emoji: "🎮", query: "anime songs", color: "from-[#503750] to-[#281c28]" },
];

/** Artists suggested during onboarding; listeners can also type their own. */
export const SUGGESTED_ARTISTS = [
  "Sơn Tùng M-TP",
  "HIEUTHUHAI",
  "Đen Vâu",
  "MONO",
  "AMEE",
  "tlinh",
  "Hoàng Thùy Linh",
  "Bích Phương",
  "Mỹ Tâm",
  "Hà Anh Tuấn",
  "Vũ.",
  "Grey D",
  "Hoàng Dũng",
  "Erik",
  "Jack - J97",
  "MCK",
  "Wren Evans",
  "Phương Mỹ Chi",
  "Taylor Swift",
  "The Weeknd",
  "Ed Sheeran",
  "Bruno Mars",
  "BLACKPINK",
  "BTS",
  "NewJeans",
  "IU",
  "Charlie Puth",
  "Billie Eilish",
];

/** Stable colour for an artist bubble, so a name always gets the same circle. */
export function artistHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return Math.abs(hash) % 360;
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export interface RecommendationSeed {
  /** "Vì bạn thích" (onboarding) or "Vì bạn hay nghe" (listening history). */
  reason: string;
  label: string;
  emoji: string;
  query: string;
}

/**
 * Search seeds for the home hero: what the listener picked during onboarding
 * plus what they actually play most. Habits are listed twice so they come up
 * more often — they are better evidence than a one-off answer.
 */
export function buildSeeds(
  preferences: { genres: string[]; artists: string[] } | null,
  profile: ListeningProfile | undefined,
): RecommendationSeed[] {
  const seeds = new Map<string, RecommendationSeed>();
  const habits: RecommendationSeed[] = [];

  for (const { slug } of profile?.genres ?? []) {
    const genre = GENRES.find((g) => g.slug === slug);
    if (!genre) continue;
    const seed = { reason: "Vì bạn hay nghe", label: genre.label, emoji: "🔥", query: genre.query };
    seeds.set(seed.query.toLowerCase(), seed);
    habits.push(seed);
  }
  for (const { name } of profile?.artists ?? []) {
    const seed = { reason: "Vì bạn hay nghe", label: name, emoji: "🔥", query: name };
    seeds.set(seed.query.toLowerCase(), seed);
    habits.push(seed);
  }
  for (const slug of preferences?.genres ?? []) {
    const genre = GENRES.find((g) => g.slug === slug);
    if (genre && !seeds.has(genre.query.toLowerCase())) {
      seeds.set(genre.query.toLowerCase(), { reason: "Vì bạn thích", label: genre.label, emoji: genre.emoji, query: genre.query });
    }
  }
  for (const name of preferences?.artists ?? []) {
    if (!seeds.has(name.toLowerCase())) seeds.set(name.toLowerCase(), { reason: "Vì bạn thích", label: name, emoji: "🎵", query: name });
  }
  return [...seeds.values(), ...habits];
}

/** Genre slugs the listener plays a lot (for "Hay nghe" badges). */
export function habitGenres(profile: ListeningProfile | undefined): Set<string> {
  return new Set((profile?.genres ?? []).map((g) => g.slug));
}
