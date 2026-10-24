/**
 * What counts as "a song" when the app picks music by itself (the lobby rooms,
 * the home page's random pick): one track of a sensible length, not a clip,
 * Short, compilation or talk. Songs people choose themselves aren't judged.
 */

/** Enough of a track to judge it. */
export interface SongCandidate {
  title: string;
  durationMs: number;
  /** A portrait video (YouTube Shorts). */
  vertical?: boolean;
}

const MIN_SONG_MS = 90_000;
const MAX_SONG_MS = 9 * 60_000;

/** Search results that aren't one song: clips, compilations, covers of covers, talk. */
const NOT_A_SONG =
  /#shorts|\bshorts?\b|playlist|tuyển tập|liên khúc|lien khuc|nonstop|non-stop|non stop|\bmix\b|mixtape|megamix|mashup|\bhours?\b|\d+ ?giờ|full album|album trọn|\btop ?\d+|bxh|karaoke|\bbeat\b|instrumental|tone (nam|nữ)|reaction|review|tutorial|lesson|how to|hướng dẫn|podcast|trailer|teaser|behind the scenes|hậu trường|vlog|interview|phỏng vấn|livestream|\bfull show\b|\btập \d+|\bep\.? ?\d+|episode|\d{2,} ?(bài|ca khúc|songs|tracks|hits)|tổng hợp|những bài hát|những ca khúc|nhạc trẻ hay nhất|nhạc hot nhất|hay nhất (năm )?20\d\d|greatest hits/i;

/** An artist's own release: the official video, M/V or visualizer. */
const OFFICIAL_RELEASE = /official|\bm\/v\b|\bmv\b|visuali[sz]er/i;

/** Is this a single song of a sensible length, not a Short (and, with `officialOnly`, an official release)? */
export function isGoodSong(song: SongCandidate, officialOnly = false): boolean {
  if (song.vertical || song.durationMs < MIN_SONG_MS || song.durationMs > MAX_SONG_MS || NOT_A_SONG.test(song.title)) {
    return false;
  }
  return !officialOnly || OFFICIAL_RELEASE.test(song.title);
}
