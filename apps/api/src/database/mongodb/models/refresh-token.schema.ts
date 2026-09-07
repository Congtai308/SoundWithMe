import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

/**
 * Resolves the "logout everywhere" open decision from Architecture Review
 * §9: refresh tokens are tracked server-side (by hash, never raw) so they
 * can be revoked individually or all-at-once for a user. Access tokens stay
 * short-lived and stateless; only the refresh token has server-side state.
 */
@Schema({ timestamps: { createdAt: "createdAt", updatedAt: false } })
export class RefreshTokenDocument extends Document {
  @Prop({ required: true, index: true })
  userId!: string;

  // SHA-256 hash of the actual refresh token — the raw token is never
  // persisted, so a database read alone can't be used to forge sessions.
  @Prop({ required: true, unique: true, index: true })
  tokenHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt?: Date | null;
  // Set when this token is exchanged during rotation, pointing at its
  // replacement — lets us detect refresh-token reuse (a strong signal of
  // token theft) and revoke the whole chain if it happens.
  @Prop({ type: String, default: null })
  replacedByTokenHash?: string | null;

  createdAt!: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshTokenDocument);
