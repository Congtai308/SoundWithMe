import { ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { AuthTokens, AuthenticatedUser } from "@soundwithme/types";
import type { GuestLoginInput, LoginInput, RegisterInput } from "@soundwithme/validation";
import { ERROR_CODES } from "@soundwithme/constants";
import { UsersService, type CreateUserInput } from "../users/users.service";
import type { UserDocument } from "../../database/mongodb/models/user.schema";
import { TokensService } from "./tokens.service";
import { RedisService } from "../../database/redis/redis.service";

const PASSWORD_HASH_ROUNDS = 12;
/**
 * Password guessing is limited per email *and address*: 10 tries per 15
 * minutes from one address. Counting per email alone let anyone lock a
 * stranger out by typing wrong passwords for them.
 */
const LOGIN_ATTEMPTS_PER_ADDRESS = 10;
/**
 * Wrong passwords per email from every address together. Past this the
 * account is under attack from many addresses: only an address with at
 * most a couple of attempts of its own (the owner, typically) still gets
 * to try, so the owner isn't locked out with the attacker.
 */
const LOGIN_FAILURES_PER_ACCOUNT = 100;
const LOGIN_FRESH_ADDRESS_ATTEMPTS = 3;
const LOGIN_WINDOW_SECONDS = 15 * 60;
/**
 * Compared against when there is no password to check, so a login takes
 * the same bcrypt time whether or not the account exists.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hash("not-a-real-password", PASSWORD_HASH_ROUNDS);

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
    private readonly redisService: RedisService,
  ) {}

  async register(
    input: RegisterInput,
  ): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
    const existingByEmail = await this.usersService.findByEmail(input.email);

    if (existingByEmail) {
      throw new ConflictException({
        success: false,
        error: {
          code: ERROR_CODES.USER_ALREADY_EXISTS,
          message: "An account with this email already exists",
        },
      });
    }

    // Username is a stable public @handle, but the register form no longer
    // asks for one directly (design decision: fewer fields, matches the
    // "Display Name + Email + Password" reference) — auto-generate it from
    // the email, same helper already used for Google sign-up.
    const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);
    const userDoc = await this.createWithUsername(usernamesFromEmail(input.email), {
      displayName: input.displayName,
      email: input.email,
      passwordHash,
      authMethods: ["password"],
      isGuest: false,
    });

    const user = this.usersService.toAuthenticatedUser(userDoc);
    const tokens = await this.tokensService.issueTokenPair(user);
    return { user, tokens };
  }

  async login(
    input: LoginInput,
    clientAddress: string,
  ): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
    const addressKey = `auth:login-attempts:${input.email}:${clientAddress}`;
    const accountKey = `auth:login-failures:${input.email}`;
    const redis = this.redisService.getClient();
    // The attempt is counted before the password is checked, so guesses sent
    // in parallel can't all slip past the limit while bcrypt runs.
    const results = await redis
      .multi()
      .incr(addressKey)
      .expire(addressKey, LOGIN_WINDOW_SECONDS)
      .get(accountKey)
      .exec();
    const attempts = Number(results?.[0]?.[1] ?? 0);
    const accountFailures = Number(results?.[2]?.[1] ?? 0);
    if (
      attempts > LOGIN_ATTEMPTS_PER_ADDRESS ||
      (accountFailures >= LOGIN_FAILURES_PER_ACCOUNT && attempts > LOGIN_FRESH_ADDRESS_ATTEMPTS)
    ) {
      throw new HttpException(
        {
          success: false,
          error: { code: ERROR_CODES.RATE_LIMITED, message: "Too many wrong passwords. Try again in 15 minutes." },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const userDoc = await this.usersService.findByEmailWithPassword(input.email);

    // Deliberately identical error (and timing: bcrypt runs either way) for
    // "no such user" and "wrong password", so neither reveals which emails exist.
    const matches = await bcrypt.compare(input.password, userDoc?.passwordHash ?? (await DUMMY_PASSWORD_HASH));
    if (!userDoc?.passwordHash || !matches) {
      await redis.multi().incr(accountKey).expire(accountKey, LOGIN_WINDOW_SECONDS).exec();
      throw new UnauthorizedException({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_CREDENTIALS,
          message: "Invalid email or password",
        },
      });
    }
    await redis.del(addressKey);

    const user = this.usersService.toAuthenticatedUser(userDoc);
    const tokens = await this.tokensService.issueTokenPair(user);
    return { user, tokens };
  }

  async loginAsGuest(
    input: GuestLoginInput,
  ): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
    // Guest accounts get a generated, collision-safe username derived from
    // the display name — they never need to be memorable/typed by anyone.
    const userDoc = await this.createWithUsername(guestUsernames(), {
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
  async loginOrRegisterWithGoogle(
    profile: GoogleProfile,
  ): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
    let userDoc = await this.usersService.findByGoogleId(profile.googleId);

    if (!userDoc) {
      const existingByEmail = await this.usersService.findByEmail(profile.email);
      if (existingByEmail) {
        // Signing up with a password never proves the email is yours; Google
        // (verified addresses only, see GoogleStrategy) just did. So the
        // account is this person's: whoever set its password, possibly
        // someone who registered the address first to wait for its owner,
        // loses it and every session. Never moves an account between Google
        // accounts.
        if (existingByEmail.googleId) throw this.linkedToAnotherGoogleAccount();
        const claimed = await this.usersService.claimForGoogle(existingByEmail.id, profile.googleId);
        if (!claimed) throw this.linkedToAnotherGoogleAccount();
        await this.tokensService.revokeAllForUser(claimed.id);
        userDoc = claimed;
      } else {
        userDoc = await this.createWithUsername(usernamesFromEmail(profile.email), {
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

  private linkedToAnotherGoogleAccount(): ConflictException {
    return new ConflictException({
      success: false,
      error: {
        code: ERROR_CODES.USER_ALREADY_EXISTS,
        message: "This email's account is already linked to a different Google account",
      },
    });
  }

  /**
   * Creates the user with the first free username from `candidates`. The
   * unique index decides, not a prior lookup, so two sign-ups racing for the
   * same handle both succeed (the loser takes the next candidate). A clash
   * on the email means the account already exists.
   */
  private async createWithUsername(
    candidates: Iterable<string>,
    input: Omit<CreateUserInput, "username">,
  ): Promise<UserDocument> {
    for (const username of candidates) {
      if (await this.usersService.isUsernameTaken(username)) continue;
      try {
        return await this.usersService.create({ ...input, username });
      } catch (error: unknown) {
        const field = duplicateKeyField(error);
        if (field === "username") continue;
        if (field === "email") {
          throw new ConflictException({
            success: false,
            error: { code: ERROR_CODES.USER_ALREADY_EXISTS, message: "An account with this email already exists" },
          });
        }
        throw error;
      }
    }
    // Astronomically unlikely given the suffix space, but fail loudly rather than loop forever.
    throw new Error("Could not generate a unique username");
  }
}

const USERNAME_ATTEMPTS = 6;

function* guestUsernames(): Generator<string> {
  for (let attempt = 0; attempt < USERNAME_ATTEMPTS; attempt++) yield `guest_${randomSuffix()}`;
}

/** The email's local part first, then the same with a random suffix. */
function* usernamesFromEmail(email: string): Generator<string> {
  const base = (email.split("@")[0] ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 18) || "user";
  yield base;
  for (let attempt = 1; attempt < USERNAME_ATTEMPTS; attempt++) yield `${base}${randomSuffix()}`;
}

/** The field a MongoDB E11000 error is about, or null for any other error. */
function duplicateKeyField(error: unknown): string | null {
  if (typeof error !== "object" || error === null || (error as { code?: unknown }).code !== 11000) return null;
  const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  return Object.keys(keyPattern)[0] ?? "unknown";
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
