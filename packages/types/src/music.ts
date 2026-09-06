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
export type MusicProviderName = "internal" | "spotify" | "applemusic";

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
  playbackSource: "range-request" | "hls";
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
