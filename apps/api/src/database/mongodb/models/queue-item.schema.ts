import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import type { QueueItemStatus, QueueTrackSnapshot } from "@soundwithme/types";

/**
 * One row per queued track — its own collection, never an array on Room
 * (coding-standards §5.3: no unbounded arrays in documents). Ordering is by
 * `_id` (time-ordered), which is also exposed as the `position` key.
 */
@Schema({ timestamps: { createdAt: "createdAt", updatedAt: false } })
export class QueueItemDocument extends Document {
  @Prop({ type: String, required: true })
  roomId!: string;

  @Prop({ type: String, required: true })
  trackId!: string;

  @Prop({
    type: {
      title: { type: String, required: true },
      artistName: { type: String, required: true },
      artworkUrl: { type: String, default: null },
      durationMs: { type: Number, required: true },
    },
    required: true,
    _id: false,
  })
  track!: QueueTrackSnapshot;

  @Prop({ type: String, required: true })
  addedBy!: string;

  @Prop({ type: String, required: true })
  addedByName!: string;

  // Voters, bounded by the room's size (≤ 100). `score` = up − down, kept in step by QueueService.
  @Prop({ type: [String], default: [] })
  upvotes!: string[];

  @Prop({ type: [String], default: [] })
  downvotes!: string[];

  @Prop({ type: Number, default: 0 })
  score!: number;

  @Prop({ type: String, required: true, enum: ["queued", "playing", "played", "removed"], default: "queued" })
  status!: QueueItemStatus;

  createdAt!: Date;
}

export const QueueItemSchema = SchemaFactory.createForClass(QueueItemDocument);

// "Upcoming tracks in this room, in play order": most votes first, then oldest.
QueueItemSchema.index({ roomId: 1, status: 1, score: -1, _id: 1 });
