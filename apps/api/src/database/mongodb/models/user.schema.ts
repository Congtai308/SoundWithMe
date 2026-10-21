import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import type { AuthMethod } from "@soundwithme/types";

export interface ListeningTally {
  key: string;
  count: number;
  lastAt: Date;
}

@Schema({ timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } })
export class UserDocument extends Document {
  @Prop({ required: true, unique: true, index: true, trim: true })
  username!: string;

  @Prop({ required: true, trim: true })
  displayName!: string;

  // Sparse unique: many guest users will have no email at all, and a
  // non-sparse unique index would reject every guest after the first
  // (since MongoDB would treat multiple `null` emails as duplicates).
  @Prop({ unique: true, sparse: true, index: true, lowercase: true, trim: true })
  email?: string;

  // Never returned to clients directly — excluded at the DTO/projection
  // layer (Master Prompt §53: never expose password hashes).
  @Prop({ select: false })
  passwordHash?: string;

  @Prop({ unique: true, sparse: true, index: true })
  googleId?: string;

  // When the owner proved the address is theirs (a mailed link, or Google
  // saying it's verified). Null for unverified and guest accounts.
  @Prop({ type: Date, default: null })
  emailVerifiedAt?: Date | null;

  // When the person who holds the password proved they own the mailbox: they
  // opened the confirmation link while signed in, or set the password from a
  // reset link. A verified email alone doesn't show that (anyone can register
  // someone else's address and wait for its owner to click the link).
  @Prop({ type: Date, default: null })
  passwordOwnerVerifiedAt?: Date | null;

  @Prop({ type: String, default: null })
  avatarUrl?: string | null;

  @Prop({ type: String, default: null })
  bio?: string | null;

  @Prop({ type: [String], default: [] })
  authMethods!: AuthMethod[];

  @Prop({ default: false, index: true })
  isGuest!: boolean;

  // Onboarding answers; null until the user finishes or skips onboarding.
  @Prop({
    type: { genres: [String], artists: [String], updatedAt: Date },
    default: null,
    _id: false,
  })
  musicPreferences?: { genres: string[]; artists: string[]; updatedAt: Date } | null;

  // Learned from what the user actually listens to (see ListeningService).
  // Arrays, not Maps: artist names may contain "." which Mongo map keys can't.
  @Prop({
    type: {
      genres: [{ key: String, count: Number, lastAt: Date, _id: false }],
      artists: [{ key: String, count: Number, lastAt: Date, _id: false }],
    },
    default: () => ({ genres: [], artists: [] }),
    _id: false,
  })
  listeningStats?: { genres: ListeningTally[]; artists: ListeningTally[] };

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserDocument);
