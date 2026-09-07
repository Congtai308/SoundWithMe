import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { AuthTokens, AuthenticatedUser } from "@soundwithme/types";
import type { GuestLoginInput, LoginInput, RegisterInput } from "@soundwithme/validation";
import { ERROR_CODES } from "@soundwithme/constants";
import { UsersService } from "../users/users.service";
import { TokensService } from "./tokens.service";

const PASSWORD_HASH_ROUNDS = 12;

interface GoogleProfile {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokensService: TokensService,
  ) {}

  async register(input: RegisterInput): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
    const [existingByEmail, usernameTaken] = await Promise.all([
      this.usersService.findByEmail(input.email),
      this.usersService.isUsernameTaken(input.username),
    ]);

    if (existingByEmail) {
      throw new ConflictException({
        success: false,
        error: { code: ERROR_CODES.USER_ALREADY_EXISTS, message: "An account with this email already exists" },
      });
    }
    if (usernameTaken) {
      throw new ConflictException({
        success: false,
        error: { code: ERROR_CODES.USERNAME_TAKEN, message: "This username is already taken" },
      });
    }

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);
    const userDoc = await this.usersService.create({
      username: input.username,
      displayName: input.displayName ?? input.username,
      email: input.email,
      passwordHash,
      authMethods: ["password"],
      isGuest: false,
    });

    const user = this.usersService.toAuthenticatedUser(userDoc);
    const tokens = await this.tokensService.issueTokenPair(user);
    return { user, tokens };
  }

  async login(input: LoginInput): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
    const userDoc = await this.usersService.findByEmailWithPassword(input.email);

    // Deliberately identical error for "no such user" and "wrong password" —
    // distinguishing them lets an attacker enumerate valid emails.
    const invalidCredentials = () =>
      new UnauthorizedException({
        success: false,
        error: { code: ERROR_CODES.INVALID_CREDENTIALS, message: "Invalid email or password" },
      });

    if (!userDoc || !userDoc.passwordHash) {
      throw invalidCredentials();
    }

    const passwordMatches = await bcrypt.compare(input.password, userDoc.passwordHash);
    if (!passwordMatches) {
      throw invalidCredentials();
    }

    const user = this.usersService.toAuthenticatedUser(userDoc);
    const tokens = await this.tokensService.issueTokenPair(user);
    return { user, tokens };
  }

  async loginAsGuest(input: GuestLoginInput): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
    // Guest accounts get a generated, collision-safe username derived from
    // the display name — they never need to be memorable/typed by anyone.
    const username = await this.generateGuestUsername();

    const userDoc = await this.usersService.create({
      username,
      displayName: input.displayName,
      authMethods: ["guest"],
      isGuest: true,
    });

    const user = this.usersService.toAuthenticatedUser(userDoc);
    const tokens = await this.tokensService.issueTokenPair(user);
    return { user, tokens };
  }

  /**
   * Find-or-create for Google sign-in. Called after the Google OAuth
   * strategy has already verified the profile server-side (see
   * strategies/google.strategy.ts) — this method trusts its input.
   */
  async loginOrRegisterWithGoogle(profile: GoogleProfile): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
    let userDoc = await this.usersService.findByGoogleId(profile.googleId);

    if (!userDoc) {
      // Link to an existing email/password account rather than creating a
      // duplicate, if one already exists with this email.
      const existingByEmail = await this.usersService.findByEmail(profile.email);
      if (existingByEmail) {
        existingByEmail.googleId = profile.googleId;
        if (!existingByEmail.authMethods.includes("google")) {
          existingByEmail.authMethods.push("google");
        }
        await existingByEmail.save();
        userDoc = existingByEmail;
      } else {
        const username = await this.generateUsernameFromEmail(profile.email);
        userDoc = await this.usersService.create({
          username,
          displayName: profile.displayName,
          email: profile.email,
          googleId: profile.googleId,
          avatarUrl: profile.avatarUrl,
          authMethods: ["google"],
          isGuest: false,
        });
      }
    }

    const user = this.usersService.toAuthenticatedUser(userDoc);
    const tokens = await this.tokensService.issueTokenPair(user);
    return { user, tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return this.tokensService.rotateRefreshToken(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokensService.revokeRefreshToken(refreshToken);
  }

  async logoutEverywhere(userId: string): Promise<void> {
    await this.tokensService.revokeAllForUser(userId);
  }

  private async generateGuestUsername(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `guest_${randomSuffix()}`;
      if (!(await this.usersService.isUsernameTaken(candidate))) {
        return candidate;
      }
    }
    // Astronomically unlikely to be reached given the suffix space, but
    // fail loudly rather than silently looping forever.
    throw new Error("Could not generate a unique guest username");
  }

  private async generateUsernameFromEmail(email: string): Promise<string> {
    const base = (email.split("@")[0] ?? "")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 18) || "user";

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}${randomSuffix()}`;
      if (!(await this.usersService.isUsernameTaken(candidate))) {
        return candidate;
      }
    }
    throw new Error("Could not generate a unique username");
  }
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
