import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { AuthMethod, AuthenticatedUser, PublicUser } from "@soundwithme/types";
import { UserDocument } from "../../database/mongodb/models/user.schema";

interface CreateUserInput {
  username: string;
  displayName: string;
  email?: string;
  passwordHash?: string;
  googleId?: string;
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

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username }).exec();
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    const existing = await this.userModel.exists({ username });
    return existing !== null;
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
      createdAt: user.createdAt.toISOString(),
    };
  }
}
