export interface Artist {
  id: string;
  name: string;
  imageUrl: string | null;
}

export interface Album {
  id: string;
  title: string;
  artistId: string;
  coverUrl: string | null;
}

/**
 * Which upstream catalog a track's metadata/provider ID resolves against.
 * "internal" is reserved for a dev/mock provider only — see MusicProvider note.
 */
export type MusicProviderName = "internal" | "spotify" | "applemusic" | "youtube";

export interface Track {
  id: string;
  title: string;
  artistId: string;
  albumId: string | null;
  durationMs: number;
  artworkUrl: string | null;
  provider: MusicProviderName;
  providerTrackId: string;
  /**
   * NOT a raw file URL. Resolved server-side into a short-lived signed
   * playback URL at request time — never persisted as a permanent link.
   */
  /**
   * How a client plays this track: its own media element over a CDN URL
   * (range-request / hls), or the provider's embedded player ("youtube-embed",
   * where providerTrackId is the YouTube video id).
   */
  playbackSource: "range-request" | "hls" | "youtube-embed";
  /** A portrait video, like a YouTube Short: a clip rather than a song. Absent when unknown. */
  vertical?: boolean;
}

/**
 * Display-layer shape returned by search/list endpoints — denormalizes the
 * artist name so the client doesn't need a second round-trip per track.
 * NOT the storage model: the `tracks` collection still stores only
 * `artistId` (Architecture Review §4 — don't embed what you can join).
 */
export interface TrackWithArtist extends Track {
  artistName: string;
}

/**
 * Abstraction boundary so the rest of the app never depends on a specific
 * upstream catalog directly (Master Prompt §15). Concrete provider (Spotify,
 * Apple Music, etc.) is an OPEN DECISION — see architecture review §17 risk #4.
 * Implementations must live in apps/api/src/modules/music/providers/*.
 */
export interface MusicProvider {
  search(query: string, limit?: number): Promise<Track[]>;
  getTrack(providerTrackId: string): Promise<Track | null>;
  getArtist(providerArtistId: string): Promise<Artist | null>;
  getAlbum(providerAlbumId: string): Promise<Album | null>;
  getPlaybackCapabilities(providerTrackId: string): Promise<{
    supportsRangeRequests: boolean;
    supportsHls: boolean;
  }>;
}

export interface LyricLine {
  /** When the line starts, in ms into the recording the lyrics were timed to. */
  timeMs: number;
  text: string;
}

/** GET /tracks/:id/lyrics — matched from LRCLIB and cached server-side. */
/** How far listeners shifted a song's lyrics to match its video (their median), and how many did. */
export interface SharedLyricsOffset {
  offsetMs: number;
  votes: number;
}

export interface Lyrics {
  trackName: string;
  artistName: string;
  /** Length of the recording the timestamps belong to (often the album cut, not the music video). */
  durationMs: number;
  /** Time-stamped lines, sorted; empty when only plain lyrics exist. */
  lines: LyricLine[];
  plain: string | null;
}
