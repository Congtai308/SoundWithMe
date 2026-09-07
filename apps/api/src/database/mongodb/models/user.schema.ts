import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import type { AuthMethod } from "@soundwithme/types";

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

  @Prop({ type: String, default: null })
  avatarUrl?: string | null;

  @Prop({ type: String, default: null })
  bio?: string | null;

  @Prop({ type: [String], default: [] })
  authMethods!: AuthMethod[];

  @Prop({ default: false, index: true })
  isGuest!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserDocument);
