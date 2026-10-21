import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import type { QueueTrackSnapshot } from "@soundwithme/types";

/** Track details copied in when saved, so the library lists without catalog lookups. */
const trackSnapshotProp = {
  type: {
    title: { type: String, required: true },
    artistName: { type: String, required: true },
    artworkUrl: { type: String, default: null },
    durationMs: { type: Number, required: true },
  },
  required: true,
  _id: false,
} as const;

/** A liked song. One row per (user, track). */
@Schema({ timestamps: { createdAt: "createdAt", updatedAt: false } })
export class FavoriteTrackDocument extends Document {
  @Prop({ type: String, required: true })
  userId!: string;

  @Prop({ type: String, required: true })
  trackId!: string;

  @Prop(trackSnapshotProp)
  track!: QueueTrackSnapshot;

  createdAt!: Date;
}

export const FavoriteTrackSchema = SchemaFactory.createForClass(FavoriteTrackDocument);
FavoriteTrackSchema.index({ userId: 1, trackId: 1 }, { unique: true });
FavoriteTrackSchema.index({ userId: 1, createdAt: -1 });

@Schema({ timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } })
export class PlaylistDocument extends Document {
  @Prop({ type: String, required: true })
  userId!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 60 })
  name!: string;

  @Prop({ type: String, default: null, maxlength: 200 })
  description?: string | null;

  // Denormalized for the playlist grid, kept in step by LibraryService.
  @Prop({ type: Number, default: 0 })
  trackCount!: number;

  @Prop({ type: String, default: null })
  coverUrl?: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PlaylistSchema = SchemaFactory.createForClass(PlaylistDocument);
PlaylistSchema.index({ userId: 1, updatedAt: -1 });

/** Songs of a playlist: their own collection, never an array on the playlist. */
@Schema({ timestamps: { createdAt: "addedAt", updatedAt: false } })
export class PlaylistItemDocument extends Document {
  @Prop({ type: String, required: true })
  playlistId!: string;

  @Prop({ type: String, required: true })
  trackId!: string;

  @Prop(trackSnapshotProp)
  track!: QueueTrackSnapshot;

  addedAt!: Date;
}

export const PlaylistItemSchema = SchemaFactory.createForClass(PlaylistItemDocument);
// In playlist order (the order songs were added), and no song twice.
PlaylistItemSchema.index({ playlistId: 1, _id: 1 });
PlaylistItemSchema.index({ playlistId: 1, trackId: 1 }, { unique: true });
