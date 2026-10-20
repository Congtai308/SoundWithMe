import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type FriendshipStatus = "pending" | "accepted";

/**
 * One row per pair of users, whichever of them asked first. `pairKey` (the
 * two ids sorted) is unique, so a pair can never have two rows — two people
 * asking each other at the same moment end up on the same request.
 */
@Schema({ timestamps: { createdAt: "createdAt", updatedAt: false } })
export class FriendshipDocument extends Document {
  @Prop({ type: String, required: true, unique: true })
  pairKey!: string;

  @Prop({ type: String, required: true })
  requesterId!: string;

  @Prop({ type: String, required: true })
  addresseeId!: string;

  @Prop({ type: String, required: true, enum: ["pending", "accepted"], default: "pending" })
  status!: FriendshipStatus;

  @Prop({ type: Date, default: null })
  acceptedAt?: Date | null;

  createdAt!: Date;
}

export const FriendshipSchema = SchemaFactory.createForClass(FriendshipDocument);

// "My friends" and "requests to / from me", per side of the pair.
FriendshipSchema.index({ requesterId: 1, status: 1 });
FriendshipSchema.index({ addresseeId: 1, status: 1 });

export function pairKeyOf(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
