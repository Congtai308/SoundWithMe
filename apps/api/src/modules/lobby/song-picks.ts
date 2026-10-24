/** A song found for a lobby room: enough to judge and de-duplicate it. */
export interface PoolSong {
  id: string;
  title: string;
  /** The uploading channel; helps tell the artist's name from the song's. */
  artistName?: string;
  durationMs: number;
  /** A portrait video (YouTube Shorts): never a lobby song. */
  vertical?: boolean;
}

/** A title (and its channel) that's queued or played already. */
export interface TakenSong {
  title: string;
  artistName?: string;
}

const MIN_SONG_MS = 90_000;
const MAX_SONG_MS = 9 * 60_000;

/** Search results that aren't one song: clips, compilations, covers of covers, talk. */
const NOT_A_SONG =
  /#shorts|\bshorts?\b|playlist|tuyển tập|liên khúc|lien khuc|nonstop|non-stop|non stop|\bmix\b|mixtape|megamix|mashup|\bhours?\b|\d+ ?giờ|full album|album trọn|\btop ?\d+|bxh|karaoke|\bbeat\b|instrumental|tone (nam|nữ)|reaction|review|tutorial|lesson|how to|hướng dẫn|podcast|trailer|teaser|behind the scenes|hậu trường|vlog|interview|phỏng vấn|livestream|\bfull show\b|\btập \d+|\bep\.? ?\d+|episode|\d{2,} ?(bài|ca khúc|songs|tracks|hits)|tổng hợp|những bài hát|những ca khúc|nhạc trẻ hay nhất|nhạc hot nhất|hay nhất (năm )?20\d\d/i;

/** Words in a video title that say which version it is, not which song. */
const VERSION_WORDS =
  /\b(official|music|video|mv|m\/v|lyrics?|lyric video|audio|visuali[sz]er|performance|live|stage|version|ver|cover|acoustic|lofi|lo-fi|remix|speed ?up|sped ?up|slowed|reverb|4k|hd|vietsub|engsub)\b/g;

/** An artist's own release: the official video, M/V or visualizer. */
const OFFICIAL_RELEASE = /official|\bm\/v\b|\bmv\b|visuali[sz]er/i;

/** Is this a single song of a sensible length, not a Short (and, for `officialOnly` rooms, an official release)? */
export function isGoodSong(song: PoolSong, officialOnly = false): boolean {
  if (song.vertical || song.durationMs < MIN_SONG_MS || song.durationMs > MAX_SONG_MS || NOT_A_SONG.test(song.title)) {
    return false;
  }
  return !officialOnly || OFFICIAL_RELEASE.test(song.title);
}

function clean(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\b(ft|feat|featuring|x)\b.*$/, "")
    .replace(VERSION_WORDS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The title without brackets or "| ..." tails, split at " - " into its parts. */
function titleParts(title: string): { whole: string; sides: string[] } {
  const main = title.replace(/[([{【「].*?[)\]}】」]/g, " ").split(/[|｜]/)[0] ?? title;
  return { whole: clean(main), sides: main.split(/\s[-–—]\s/).map(clean).filter((side) => side.length >= 3) };
}

/**
 * Parts of "Artist - Song" titles that are artists rather than songs: they
 * match the channel, or appear beside three or more different other parts
 * (an artist has many songs; a song pairs with few names).
 */
export function artistParts(songs: TakenSong[]): Set<string> {
  const partners = new Map<string, Set<string>>();
  const artists = new Set<string>();
  for (const song of songs) {
    const { sides } = titleParts(song.title);
    const channel = song.artistName ? clean(song.artistName.replace(/official|channel|music|entertainment|records|vevo/gi, " ")) : "";
    for (const side of sides) {
      if (channel.length >= 2 && (side === channel || side.startsWith(`${channel} `) || channel.startsWith(side))) artists.add(side);
      for (const other of sides) if (other !== side) partners.set(side, (partners.get(side) ?? new Set()).add(other));
    }
  }
  for (const [side, others] of partners) if (others.size >= 3) artists.add(side);
  return artists;
}

/**
 * Keys that name the song itself, so its MV, lyric video and audio upload
 * count as one: the whole title without brackets, version words or
 * punctuation, plus each part of an "Artist - Song" split that isn't the
 * artist (covers flip the order).
 */
export function songKeys(title: string, artists: Set<string> = new Set()): string[] {
  const { whole, sides } = titleParts(title);
  return [...new Set([whole, ...sides.filter((side) => !artists.has(side))].filter((key) => key.length >= 3))];
}

/**
 * Up to `count` songs from `pool` in random order, none the same song as
 * another pick or as anything in `taken` (queued or played lately).
 */
export function pickDistinct(pool: PoolSong[], taken: TakenSong[], count: number, random = Math.random): PoolSong[] {
  const artists = artistParts([...pool, ...taken]);
  const used = new Set(taken.flatMap((song) => songKeys(song.title, artists)));
  const picks: PoolSong[] = [];
  for (const song of shuffle([...pool], random)) {
    if (picks.length >= count) break;
    const keys = songKeys(song.title, artists);
    if (keys.some((key) => used.has(key))) continue;
    picks.push(song);
    for (const key of keys) used.add(key);
  }
  return picks;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
