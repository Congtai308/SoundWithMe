import { Inject, Injectable } from "@nestjs/common";
import type { Artist, MusicProvider, Track, TrackWithArtist } from "@soundwithme/types";
import { MUSIC_PROVIDER } from "./music.constants";
import {
  type QuotaBudget,
  YOUTUBE_ARTIST_PREFIX,
  YOUTUBE_TRACK_PREFIX,
  YouTubeMusicProvider,
} from "./providers/youtube-music.provider";

/**
 * Single catalog facade over several providers. Track ids are namespaced
 * (`yt_<videoId>` → YouTube, anything else → the internal catalog) so callers
 * never need to know where a track came from.
 */
@Injectable()
export class MusicService {
  constructor(
    @Inject(MUSIC_PROVIDER) private readonly internal: MusicProvider,
    private readonly youtube: YouTubeMusicProvider,
  ) {}

  /** YouTube when a Data API key is configured, otherwise the internal catalog. */
  async search(query: string, limit?: number, budget?: QuotaBudget): Promise<TrackWithArtist[]> {
    const tracks = this.youtube.searchEnabled
      ? await this.youtube.search(query, limit, budget)
      : await this.internal.search(query, limit);
    return Promise.all(tracks.map((track) => this.withArtistName(track)));
  }

  getTrack(trackId: string): Promise<Track | null> {
    return this.providerFor(trackId).getTrack(trackId);
  }

  async getTrackWithArtist(trackId: string): Promise<TrackWithArtist | null> {
    const track = await this.getTrack(trackId);
    return track ? this.withArtistName(track) : null;
  }

  /** Turns a pasted YouTube link (or bare video id) into a catalog track. */
  async resolveUrl(url: string): Promise<TrackWithArtist | null> {
    const track = await this.youtube.resolveUrl(url);
    return track ? this.withArtistName(track) : null;
  }

  /** name → image URL for the names YouTube has a channel avatar for. */
  async findArtistImages(names: string[], budget?: QuotaBudget): Promise<Record<string, string>> {
    const images: Record<string, string> = {};
    // Sequential on purpose: a cold cache must not fire dozens of quota-heavy searches at once.
    for (const name of names) {
      const url = await this.youtube.findArtistImage(name, budget);
      if (url) images[name] = url;
    }
    return images;
  }

  getArtist(artistId: string): Promise<Artist | null> {
    return this.providerFor(artistId).getArtist(artistId);
  }

  /** Works for both track ids (`yt_…`) and artist ids (`ytc_…`). */
  private providerFor(id: string): MusicProvider {
    return id.startsWith(YOUTUBE_TRACK_PREFIX) || id.startsWith(YOUTUBE_ARTIST_PREFIX)
      ? this.youtube
      : this.internal;
  }

  private async withArtistName(track: Track): Promise<TrackWithArtist> {
    const artist = await this.getArtist(track.artistId);
    return { ...track, artistName: artist?.name ?? "Unknown artist" };
  }
}
