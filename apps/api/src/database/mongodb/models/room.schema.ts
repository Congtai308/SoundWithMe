import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import type { RoomSettings, RoomStatus, RoomType } from "@soundwithme/types";

const DEFAULT_SETTINGS: RoomSettings = {
  whoCanControlPlayback: "host",
  whoCanAddSongs: "everyone",
  chatEnabled: true,
  reactionsEnabled: true,
  songRequestsEnabled: true,
  maxListeners: 50,
  maxSingers: 2,
};

@Schema({ timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } })
export class RoomDocument extends Document {
  @Prop({ required: true, trim: true, maxlength: 80 })
  name!: string;

  @Prop({ type: String, default: null, maxlength: 500 })
  description?: string | null;

  @Prop({ type: String, default: null })
  coverUrl?: string | null;

  @Prop({ required: true, index: true })
  hostId!: string;

  @Prop({ required: true, index: true })
  type!: RoomType;

  @Prop({ required: true, default: "active", index: true })
  status!: RoomStatus;

  // Denormalized settings object rather than a separate collection — small,
  // fixed shape, always read together with the room itself.
  @Prop({ type: Object, default: DEFAULT_SETTINGS })
  settings!: RoomSettings;

  @Prop({ type: String, default: null })
  currentTrackId?: string | null;

  // Kept in sync by RoomsService on join/leave rather than computed with a
  // count() query on every room-list request (Architecture Review §4: this
  // is exactly the kind of denormalization worth doing for a hot read path).
  @Prop({ default: 0 })
  memberCount!: number;

  // Bounded by MAX_ROOM_DJS (validation package).
  @Prop({ type: [String], default: [] })
  djIds!: string[];

  // Bounded by the room's own size (maxListeners ≤ 100).
  @Prop({ type: [String], default: [] })
  mutedUserIds!: string[];

  // Removed by the host: can't join again. Bounded in RoomsService (MAX_BANNED).
  @Prop({ type: [String], default: [] })
  bannedUserIds!: string[];

  // Private rooms: the secret in the invite link. Never sent to anyone but the host.
  @Prop({ type: String, default: null })
  inviteCode?: string | null;

  // Private rooms, optional: bcrypt hash. Never selected unless checking a passcode.
  @Prop({ type: String, default: null, select: false })
  passcodeHash?: string | null;

  // Not secret: lets the join screen ask for a passcode only when one exists.
  @Prop({ type: Boolean, default: false })
  hasPasscode!: boolean;

  @Prop({ type: Date, default: null })
  closedAt?: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RoomSchema = SchemaFactory.createForClass(RoomDocument);

// Supports the "list active public rooms" query pattern (Architecture
// Review §4: index tied to real query patterns, documented here).
RoomSchema.index({ status: 1, type: 1, createdAt: -1 });
// One live room per host: the database itself refuses a second, so two
// "create" clicks racing each other can't both get through.
RoomSchema.index(
  { hostId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "active" }, name: "one_active_room_per_host" },
);
