import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, isValidObjectId } from "mongoose";
import { ERROR_CODES } from "@soundwithme/constants";
import {
  MAX_FAVORITES,
  MAX_PLAYLISTS,
  MAX_PLAYLIST_TRACKS,
  type PlaylistInput,
  type UpdatePlaylistInput,
} from "@soundwithme/validation";
import type { FavoriteTrack, Playlist, PlaylistItem, PlaylistWithItems, QueueTrackSnapshot } from "@soundwithme/types";
import {
  FavoriteTrackDocument,
  PlaylistDocument,
  PlaylistItemDocument,
} from "../../database/mongodb/models/library.schema";
import { MusicService } from "../music/music.service";
import { isDuplicateKey } from "../friends/friendships.service";

/** A listener's own music: liked songs and playlists. Private to the owner. */
@Injectable()
export class LibraryService {
  constructor(
    @InjectModel(FavoriteTrackDocument.name) private readonly favoriteModel: Model<FavoriteTrackDocument>,
    @InjectModel(PlaylistDocument.name) private readonly playlistModel: Model<PlaylistDocument>,
    @InjectModel(PlaylistItemDocument.name) private readonly itemModel: Model<PlaylistItemDocument>,
    private readonly musicService: MusicService,
  ) {}

  // ---- Liked songs ----

  async listFavorites(userId: string): Promise<FavoriteTrack[]> {
    const docs = await this.favoriteModel.find({ userId }).sort({ createdAt: -1 }).limit(MAX_FAVORITES).exec();
    return docs.map((doc) => ({
      trackId: doc.trackId,
      track: snapshotOf(doc.track),
      createdAt: doc.createdAt.toISOString(),
    }));
  }

  /** Just the ids, for heart buttons across the app. */
  async favoriteIds(userId: string): Promise<string[]> {
    const docs = await this.favoriteModel.find({ userId }).select({ trackId: 1 }).limit(MAX_FAVORITES).exec();
    return docs.map((doc) => doc.trackId);
  }

  /** Idempotent: liking a liked song is a no-op. */
  async addFavorite(userId: string, trackId: string): Promise<void> {
    if (await this.favoriteModel.exists({ userId, trackId }).exec()) return;
    const count = await this.favoriteModel.countDocuments({ userId }).exec();
    if (count >= MAX_FAVORITES) throw this.limit(`Liked songs hold up to ${MAX_FAVORITES} tracks`);
    const track = await this.requireTrack(trackId);
    try {
      await this.favoriteModel.create({ userId, trackId: track.id, track: track.snapshot });
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error; // a double-click: already saved
    }
  }

  async removeFavorite(userId: string, trackId: string): Promise<void> {
    await this.favoriteModel.deleteOne({ userId, trackId }).exec();
  }

  // ---- Playlists ----

  async listPlaylists(userId: string): Promise<Playlist[]> {
    const docs = await this.playlistModel.find({ userId }).sort({ updatedAt: -1 }).limit(MAX_PLAYLISTS).exec();
    return docs.map((doc) => this.toPlaylist(doc));
  }

  async createPlaylist(userId: string, input: PlaylistInput): Promise<Playlist> {
    const count = await this.playlistModel.countDocuments({ userId }).exec();
    if (count >= MAX_PLAYLISTS) throw this.limit(`You can have up to ${MAX_PLAYLISTS} playlists`);
    const doc = await this.playlistModel.create({ userId, name: input.name, description: input.description ?? null });
    return this.toPlaylist(doc);
  }

  async getPlaylist(userId: string, playlistId: string): Promise<PlaylistWithItems> {
    const playlist = await this.ownPlaylist(userId, playlistId);
    const items = await this.itemModel.find({ playlistId: playlist.id }).sort({ _id: 1 }).limit(MAX_PLAYLIST_TRACKS).exec();
    return { ...this.toPlaylist(playlist), items: items.map((item) => this.toItem(item)) };
  }

  async updatePlaylist(userId: string, playlistId: string, input: UpdatePlaylistInput): Promise<Playlist> {
    const playlist = await this.ownPlaylist(userId, playlistId);
    if (input.name !== undefined) playlist.name = input.name;
    if (input.description !== undefined) playlist.description = input.description;
    await playlist.save();
    return this.toPlaylist(playlist);
  }

  async deletePlaylist(userId: string, playlistId: string): Promise<void> {
    const playlist = await this.ownPlaylist(userId, playlistId);
    await this.itemModel.deleteMany({ playlistId: playlist.id }).exec();
    await playlist.deleteOne();
  }

  /** Appends a song; a song already in the playlist stays where it is. */
  async addToPlaylist(userId: string, playlistId: string, trackId: string): Promise<PlaylistWithItems> {
    const playlist = await this.ownPlaylist(userId, playlistId);
    if (!(await this.itemModel.exists({ playlistId: playlist.id, trackId }).exec())) {
      if (playlist.trackCount >= MAX_PLAYLIST_TRACKS) {
        throw this.limit(`A playlist holds up to ${MAX_PLAYLIST_TRACKS} songs`);
      }
      const track = await this.requireTrack(trackId);
      try {
        await this.itemModel.create({ playlistId: playlist.id, trackId: track.id, track: track.snapshot });
        await this.refreshSummary(playlist);
      } catch (error: unknown) {
        if (!isDuplicateKey(error)) throw error;
      }
    }
    return this.getPlaylist(userId, playlistId);
  }

  async removeFromPlaylist(userId: string, playlistId: string, itemId: string): Promise<PlaylistWithItems> {
    const playlist = await this.ownPlaylist(userId, playlistId);
    if (isValidObjectId(itemId)) {
      const removed = await this.itemModel.deleteOne({ _id: itemId, playlistId: playlist.id }).exec();
      if (removed.deletedCount > 0) await this.refreshSummary(playlist);
    }
    return this.getPlaylist(userId, playlistId);
  }

  /** Recounts and re-picks the cover from the first song (cheap: bounded by MAX_PLAYLIST_TRACKS). */
  private async refreshSummary(playlist: PlaylistDocument): Promise<void> {
    const [count, first] = await Promise.all([
      this.itemModel.countDocuments({ playlistId: playlist.id }).exec(),
      this.itemModel.findOne({ playlistId: playlist.id }).sort({ _id: 1 }).exec(),
    ]);
    playlist.trackCount = count;
    playlist.coverUrl = first?.track.artworkUrl ?? null;
    await playlist.save();
  }

  /** Someone else's playlist looks exactly like a missing one. */
  private async ownPlaylist(userId: string, playlistId: string): Promise<PlaylistDocument> {
    const playlist = isValidObjectId(playlistId) ? await this.playlistModel.findOne({ _id: playlistId, userId }).exec() : null;
    if (!playlist) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.PLAYLIST_NOT_FOUND, message: "Playlist not found" },
      });
    }
    return playlist;
  }

  private async requireTrack(trackId: string): Promise<{ id: string; snapshot: QueueTrackSnapshot }> {
    const track = await this.musicService.getTrackWithArtist(trackId);
    if (!track) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.TRACK_NOT_FOUND, message: "Track not found" },
      });
    }
    return {
      id: track.id,
      snapshot: {
        title: track.title,
        artistName: track.artistName,
        artworkUrl: track.artworkUrl,
        durationMs: track.durationMs,
      },
    };
  }

  private limit(message: string): ConflictException {
    return new ConflictException({ success: false, error: { code: ERROR_CODES.LIBRARY_LIMIT, message } });
  }

  private toPlaylist(doc: PlaylistDocument): Playlist {
    return {
      id: doc.id,
      name: doc.name,
      description: doc.description ?? null,
      trackCount: doc.trackCount,
      coverUrl: doc.coverUrl ?? null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private toItem(doc: PlaylistItemDocument): PlaylistItem {
    return { id: doc.id, trackId: doc.trackId, track: snapshotOf(doc.track), addedAt: doc.addedAt.toISOString() };
  }
}

function snapshotOf(track: QueueTrackSnapshot): QueueTrackSnapshot {
  return {
    title: track.title,
    artistName: track.artistName,
    artworkUrl: track.artworkUrl ?? null,
    durationMs: track.durationMs,
  };
}
