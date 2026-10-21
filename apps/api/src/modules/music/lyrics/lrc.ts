import type { LyricLine } from "@soundwithme/types";

/** One LRCLIB search result (https://lrclib.net/docs). */
export interface LrclibRecord {
  trackName: string;
  artistName: string;
  /** Seconds. */
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/** What we know about the video the lyrics are for. */
export interface LyricsTarget {
  /** The YouTube title, e.g. "JACK - J97 | LƯU NIÊN | Album TAM THÁI TỬ - Track No.4". */
  title: string;
  /** The channel name. */
  artistName: string;
  durationMs: number;
}

const LRC_TIMESTAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/** `[mm:ss.xx] text` lines → sorted cues. A line may carry several timestamps. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(LRC_TIMESTAMP)];
    if (stamps.length === 0) continue;
    const text = raw.replace(LRC_TIMESTAMP, "").trim();
    for (const [, min, sec, frac = "0"] of stamps) {
      const fracMs = Number(frac.padEnd(3, "0").slice(0, 3));
      lines.push({ timeMs: Number(min) * 60_000 + Number(sec) * 1_000 + fracMs, text });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/** Lowercase, no diacritics (đ → d), punctuation → spaces: "Sơn Tùng M-TP" → "son tung m tp". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Segments that never name the song: "Official MV", "Album TAM THÁI TỬ", "Track No.4", "EP 'Dữ Liệu Quý'". */
const NOISE_SEGMENT =
  /^(official|music video|mv|m\/v|lyrics?|lyric video|audio|video|visuali[sz]er|album|ep\b|track|prod|hd|4k|karaoke|teaser|trailer|performance)\b/i;
/** Words that say nothing about which song it is. */
const NOISE_WORDS =
  /\b(official|music video|mv|m\/v|lyrics?|lyric video|audio|video|visuali[sz]er|hd|4k|explicit)\b/gi;
/** Words marking an alternate cut, whose lyrics are timed differently from the original. */
const VERSION_WORDS =
  /\b(remix|live|tour|acoustic|cover|rock|lofi|lo fi|speed up|sped up|slowed|reverb|beat|instrumental|karaoke|piano|guitar|demo|edit|mashup|version|ver|concert|session|unplugged|orchestra)\b/g;
/** Collaboration markers: "x", "ft.", "feat." — split artists apart, never part of a title. */
const COLLAB = /\s(?:ft\.?|feat\.?|featuring)\s.*$/i;
const ARTIST_STOPWORDS = new Set(["x", "ft", "feat", "and", "the", "official", "music", "entertainment", "tube", "topic", "vevo", "channel"]);

/**
 * Splits a YouTube-style title into its meaningful parts, in order:
 * "JACK - J97 | LƯU NIÊN | Album TAM THÁI TỬ - Track No.4" → ["JACK", "J97", "LƯU NIÊN"].
 * Brackets that wrap a whole word are dropped ("(prod. by Kewtiie)", "[OFFICIAL MV]"),
 * brackets inside a name are kept ("(S)TRONG").
 */
export function titleSegments(title: string): string[] {
  const unbracketed = title
    .replace(/(^|\s)\[[^\]]*\](?=\s|$)/g, " ")
    .replace(/(^|\s)\([^)]*\)(?=\s|$)/g, " ")
    .replace(/【[^】]*】/g, " ");
  return unbracketed
    .split(/\s*[|｜]\s*|\s+[-–—]\s+|\s+l\s+/)
    .map((segment) => segment.replace(COLLAB, "").replace(NOISE_WORDS, " ").replace(/\s+/g, " ").trim())
    .filter((segment) => normalize(segment).length > 0 && !NOISE_SEGMENT.test(segment));
}

function words(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/** Distinctive artist words: "Jack - J97" → jack, j97; "ICM x JACK" → icm, jack. */
function artistWords(text: string): Set<string> {
  return new Set(words(text).filter((w) => w.length >= 2 && !ARTIST_STOPWORDS.has(w)));
}

/** `phrase` appears in `text` as whole words (both normalized). */
function containsPhrase(text: string, phrase: string): boolean {
  return phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);
}

/** LRCLIB full-text queries to try, best first (at most three). */
export function lyricsQueries(target: LyricsTarget): string[] {
  const segments = titleSegments(target.title);
  const channel = artistWords(target.artistName);
  const queries = [segments.join(" ")];
  // Then each part that isn't just the channel's name, on its own: one of them
  // is the song. Without version words — a remix's lyrics are the original's.
  for (const segment of segments) {
    const segmentWords = words(segment);
    if (segmentWords.every((w) => channel.has(w))) continue;
    const stripped = segment.replace(new RegExp(VERSION_WORDS.source, "gi"), " ").replace(/\s+/g, " ").trim();
    if (stripped) queries.push(stripped);
  }
  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))].slice(0, 3);
}

/**
 * How well a record fits the video, or null when it is (probably) another
 * song. A wrong song's lyrics are worse than none, so both must hold:
 * - the record's song name appears, as a phrase, in the video title;
 * - one of the record's artists is in the video title or is the channel.
 */
export function scoreLyrics(record: LrclibRecord, target: LyricsTarget): number | null {
  if (record.instrumental || !(record.syncedLyrics || record.plainLyrics)) return null;

  const videoText = normalize(titleSegments(target.title).join(" "));
  const videoWords = new Set(videoText.split(" "));
  const channel = artistWords(target.artistName);

  const recordArtists = artistWords(record.artistName);
  const artistMatches = [...recordArtists].some((w) => videoWords.has(w) || channel.has(w));
  if (!artistMatches) return null;

  // LRCLIB track names are sometimes whole YouTube titles too: try each part,
  // ignoring parts that are just the artist.
  const names = titleSegments(record.trackName)
    .map(normalize)
    .filter((name) => !name.split(" ").every((w) => recordArtists.has(w)));
  const titleMatches = names.some((name) => containsPhrase(videoText, name));
  if (!titleMatches) return null;

  // "Kho Báu (ROCK ver.)" for the original MV: right song, wrong timing.
  const otherVersion = (normalize(record.trackName).match(VERSION_WORDS) ?? []).some(
    (word) => !containsPhrase(videoText, word),
  );

  const durationGapS = target.durationMs ? Math.abs(record.duration - target.durationMs / 1000) : 0;
  // Synced lyrics first, then the same cut as the video, then the closest length.
  return (record.syncedLyrics ? 2_000 : 0) - (otherVersion ? 1_000 : 0) - Math.min(durationGapS, 999);
}

export function pickBestLyrics(records: LrclibRecord[], target: LyricsTarget): LrclibRecord | null {
  let best: { record: LrclibRecord; score: number } | null = null;
  for (const record of records) {
    const score = scoreLyrics(record, target);
    if (score !== null && (!best || score > best.score)) best = { record, score };
  }
  return best?.record ?? null;
}

/**
 * Runs the queries in order until one yields synced lyrics for this song
 * (falling back to plain lyrics found along the way). `search` does the HTTP.
 */
export async function findBestLyrics(
  target: LyricsTarget,
  search: (q: string) => Promise<LrclibRecord[]>,
): Promise<LrclibRecord | null> {
  let fallback: LrclibRecord | null = null;
  for (const query of lyricsQueries(target)) {
    const best = pickBestLyrics(await search(query), target);
    if (best?.syncedLyrics) return best;
    fallback ??= best;
  }
  return fallback;
}
