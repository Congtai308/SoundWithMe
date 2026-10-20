import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import type { DirectMessageKind, SharedRoom, SharedTrack } from "@soundwithme/types";

/** One message between two friends. Own collection, keyed by the pair (conversationId). */
@Schema({ timestamps: { createdAt: "createdAt", updatedAt: false } })
export class DirectMessageDocument extends Document {
  /** `${smallerUserId}:${largerUserId}`, the same from both sides. */
  @Prop({ type: String, required: true })
  conversationId!: string;

  @Prop({ type: String, required: true })
  senderId!: string;

  @Prop({ type: String, required: true })
  recipientId!: string;

  @Prop({ type: String, required: true, enum: ["text", "track", "room"] })
  kind!: DirectMessageKind;

  @Prop({ type: String, default: "", maxlength: 2000 })
  content!: string;

  @Prop({
    type: { id: String, title: String, artistName: String, artworkUrl: String, durationMs: Number },
    default: null,
    _id: false,
  })
  track?: SharedTrack | null;

  @Prop({ type: { id: String, name: String, link: String }, default: null, _id: false })
  room?: SharedRoom | null;

  @Prop({ type: Date, default: null })
  readAt?: Date | null;

  createdAt!: Date;
}

export const DirectMessageSchema = SchemaFactory.createForClass(DirectMessageDocument);

// A conversation's history, newest first, cursor on _id.
DirectMessageSchema.index({ conversationId: 1, _id: -1 });
// The inbox: every conversation one user is in, and their unread messages.
DirectMessageSchema.index({ senderId: 1, _id: -1 });
DirectMessageSchema.index({ recipientId: 1, readAt: 1, _id: -1 });
