import { Injectable } from "@nestjs/common";
import type { Album, Artist, MusicProvider, Track } from "@soundwithme/types";

/**
 * OPEN DECISION (see docs/architecture/DECISIONS.md): no real music/metadata
 * provider has been chosen yet (Spotify Web API, Apple Music, or other).
 * This mock provider satisfies the MusicProvider interface with static,
 * clearly-fake data so the rest of the app (Discover, Player, Rooms, Queue)
 * can be built and tested against a real contract now, without waiting on
 * that decision or on real API credentials.
 */
@Injectable()
export class MockMusicProvider implements MusicProvider {
  private readonly artists: Artist[] = [
    { id: "artist_1", name: "Luna Ray", imageUrl: null },
    { id: "artist_2", name: "The Night Owls", imageUrl: null },
    { id: "artist_3", name: "Kai Solace", imageUrl: null },
  ];

  private readonly albums: Album[] = [
    {
      id: "album_1",
      title: "Midnight Frequencies",
      artistId: "artist_1",
      coverUrl: null,
    },
    { id: "album_2", title: "After Hours Radio", artistId: "artist_2", coverUrl: null },
    { id: "album_3", title: "Solace", artistId: "artist_3", coverUrl: null },
  ];

  private readonly tracks: Track[] = [
    {
      id: "track_1",
      title: "Neon Skyline",
      artistId: "artist_1",
      albumId: "album_1",
      durationMs: 214_000,
      artworkUrl: null,
      provider: "internal",
      providerTrackId: "track_1",
      playbackSource: "range-request",
    },
    {
      id: "track_2",
      title: "Late Night Drive",
      artistId: "artist_2",
      albumId: "album_2",
      durationMs: 198_000,
      artworkUrl: null,
      provider: "internal",
      providerTrackId: "track_2",
      playbackSource: "range-request",
    },
    {
      id: "track_3",
      title: "Quiet Static",
      artistId: "artist_3",
      albumId: "album_3",
      durationMs: 231_000,
      artworkUrl: null,
      provider: "internal",
      providerTrackId: "track_3",
      playbackSource: "range-request",
    },
    {
      id: "track_4",
      title: "Room 402",
      artistId: "artist_2",
      albumId: "album_2",
      durationMs: 176_000,
      artworkUrl: null,
      provider: "internal",
      providerTrackId: "track_4",
      playbackSource: "range-request",
    },
  ];

  async search(query: string, limit = 20): Promise<Track[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    return this.tracks
      .filter((track) => {
        const artist = this.artists.find((a) => a.id === track.artistId);
        return (
          track.title.toLowerCase().includes(normalized) ||
          (artist?.name.toLowerCase().includes(normalized) ?? false)
        );
      })
      .slice(0, limit);
  }

  async getTrack(providerTrackId: string): Promise<Track | null> {
    return this.tracks.find((t) => t.providerTrackId === providerTrackId) ?? null;
  }

  async getArtist(providerArtistId: string): Promise<Artist | null> {
    return this.artists.find((a) => a.id === providerArtistId) ?? null;
  }

  async getAlbum(providerAlbumId: string): Promise<Album | null> {
    return this.albums.find((a) => a.id === providerAlbumId) ?? null;
  }

  async getPlaybackCapabilities(
    _providerTrackId: string,
  ): Promise<{ supportsRangeRequests: boolean; supportsHls: boolean }> {
    return { supportsRangeRequests: true, supportsHls: false };
  }
}
