import { GENRE_SLUGS } from "@soundwithme/constants";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { AuthMethod, AuthenticatedUser, PublicUser } from "@soundwithme/types";
import { UserDocument } from "../../database/mongodb/models/user.schema";

export interface CreateUserInput {
  username: string;
  displayName: string;
  email?: string;
  passwordHash?: string;
  googleId?: string;
  emailVerifiedAt?: Date | null;
  passwordOwnerVerifiedAt?: Date | null;
  avatarUrl?: string | null;
  authMethods: AuthMethod[];
  isGuest: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(UserDocument.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async create(input: CreateUserInput): Promise<UserDocument> {
    return this.userModel.create(input);
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  /** Includes passwordHash — only for internal credential verification, never returned to clients. */
  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select("+passwordHash")
      .exec();
  }

  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleId }).exec();
  }

  /**
   * Gives an email account to the Google user who proved they own the
   * address. Any password on it was never tied to that proof, so it goes.
   * Only matches while no Google account is linked yet.
   */
  async claimForGoogle(userId: string, googleId: string): Promise<UserDocument | null> {
    return this.userModel
      .findOneAndUpdate(
        { _id: userId, googleId: null },
        {
          $set: { googleId, authMethods: ["google"], emailVerifiedAt: new Date(), passwordOwnerVerifiedAt: null },
          $unset: { passwordHash: 1 },
        },
        { new: true },
      )
      .exec();
  }

  /**
   * Links Google to an account whose password holder proved they own the
   * address (see passwordOwnerVerifiedAt): the password stays.
   */
  async linkGoogle(userId: string, googleId: string): Promise<UserDocument | null> {
    return this.userModel
      .findOneAndUpdate(
        { _id: userId, googleId: null },
        { $set: { googleId }, $addToSet: { authMethods: "google" } },
        { new: true },
      )
      .exec();
  }

  /**
   * `bySignedInOwner`: the link was opened in a session of this account, so
   * the password holder is the mailbox owner too.
   */
  async markEmailVerified(userId: string, email: string, bySignedInOwner: boolean): Promise<boolean> {
    // Only for the address the link was mailed to, in case it changed since.
    const now = new Date();
    const result = await this.userModel
      .updateOne({ _id: userId, email }, [
        {
          $set: {
            emailVerifiedAt: { $ifNull: ["$emailVerifiedAt", now] },
            ...(bySignedInOwner ? { passwordOwnerVerifiedAt: now } : {}),
          },
        },
      ])
      .exec();
    return result.matchedCount > 0;
  }

  /** A new password from a reset link. Opening that link proves the email too. */
  async resetPassword(userId: string, passwordHash: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        {
          $set: { passwordHash, emailVerifiedAt: new Date(), passwordOwnerVerifiedAt: new Date() },
          $addToSet: { authMethods: "password" },
        },
      )
      .exec();
  }

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username }).exec();
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    const existing = await this.userModel.exists({ username });
    return existing !== null;
  }
  async updateProfile(
    userId: string,
    updates: { displayName?: string; bio?: string | null; avatarUrl?: string | null },
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(userId, { $set: updates }, { new: true })
      .exec();
  }

  async setMusicPreferences(
    userId: string,
    preferences: { genres: string[]; artists: string[] },
  ): Promise<UserDocument | null> {
    // Drop slugs this build doesn't know (e.g. an old client after a catalog change).
    const genres = preferences.genres.filter((slug) => (GENRE_SLUGS as readonly string[]).includes(slug));
    return this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { musicPreferences: { genres, artists: preferences.artists, updatedAt: new Date() } } },
        { new: true },
      )
      .exec();
  }

  async findManyByIds(ids: string[]): Promise<UserDocument[]> {
    if (ids.length === 0) return [];
    return this.userModel.find({ _id: { $in: ids } }).exec();
  }

  /** Username or display name starting with `query` (case-insensitive), registered accounts first. */
  async search(query: string, limit: number): Promise<UserDocument[]> {
    const prefix = new RegExp(`^${escapeRegExp(query)}`, "i");
    return this.userModel
      .find({ $or: [{ username: prefix }, { displayName: prefix }] })
      .sort({ isGuest: 1, displayName: 1 })
      .limit(limit)
      .exec();
  }

  /** Enforces the PRIVACY RULE projection — the only shape ever sent for another user's profile. */
  toPublicUser(user: UserDocument): PublicUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      isGuest: user.isGuest,
    };
  }

  /** Fuller projection for the currently-authenticated user's own /auth/me response. */
  toAuthenticatedUser(user: UserDocument): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      authMethods: user.authMethods,
      isGuest: user.isGuest,
      email: user.email ?? null,
      emailVerified: Boolean(user.emailVerifiedAt),
      musicPreferences: user.musicPreferences
        ? {
            genres: user.musicPreferences.genres,
            artists: user.musicPreferences.artists,
            updatedAt: user.musicPreferences.updatedAt.toISOString(),
          }
        : null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
