import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import type { NotificationType } from "@soundwithme/types";

/** How long a notification is kept: the bell is a recent-activity feed, not an archive. */
export const NOTIFICATION_TTL_SECONDS = 60 * 60 * 24 * 30;

@Schema({ timestamps: { createdAt: "createdAt", updatedAt: false } })
export class NotificationDocument extends Document {
  @Prop({ type: String, required: true })
  userId!: string;

  @Prop({ type: String, required: true })
  type!: NotificationType;

  @Prop({ type: String, required: true, maxlength: 120 })
  title!: string;

  @Prop({ type: String, required: true, maxlength: 300 })
  body!: string;

  @Prop({ type: String, default: null })
  link?: string | null;

  @Prop({ type: String, default: null })
  actorId?: string | null;

  @Prop({ type: Date, default: null })
  readAt?: Date | null;

  createdAt!: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(NotificationDocument);

// The bell: newest first for one user, and the unread count.
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, readAt: 1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_TTL_SECONDS });
