import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import type { RoomMemberRole } from "@soundwithme/types";

/**
 * Separate collection from `rooms` — the docs are explicit that a room's
 * member list must never be embedded as an array on the Room document
 * (Master Prompt §8, Architecture Review §4: "roomMembers" is the busiest
 * write path in the whole schema due to join/leave churn).
 */
@Schema({ timestamps: { createdAt: "joinedAt", updatedAt: false } })
export class RoomMemberDocument extends Document {
  @Prop({ required: true, index: true })
  roomId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, default: "member" })
  role!: RoomMemberRole;

  @Prop({ type: Date, default: null })
  leftAt?: Date | null;

  joinedAt!: Date;
}

export const RoomMemberSchema = SchemaFactory.createForClass(RoomMemberDocument);

// One active (leftAt: null) membership per (roomId, userId). Unique, so two
// joins racing each other can't both create one (RoomsService catches the
// duplicate). Also makes "is this user an active member" an indexed lookup.
RoomMemberSchema.index(
  { roomId: 1, userId: 1 },
  { name: "one_active_membership", unique: true, partialFilterExpression: { leftAt: { $type: "null" } } },
);
// "Which rooms is this user currently in" — used by a future Home feed.
RoomMemberSchema.index({ userId: 1, leftAt: 1 });
