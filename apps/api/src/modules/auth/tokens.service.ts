import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { randomBytes, createHash } from "crypto";
import type { AccessTokenPayload, AuthTokens, AuthenticatedUser, User } from "@soundwithme/types";
import { ERROR_CODES } from "@soundwithme/constants";
import { RefreshTokenDocument } from "../../database/mongodb/models/refresh-token.schema";
import { UsersService } from "../users/users.service";

// Derived from JwtService.sign's own signature rather than importing
// jsonwebtoken's SignOptions/StringValue types directly (jsonwebtoken is a
// transitive dependency of @nestjs/jwt, not one we declare ourselves).
type JwtSignOptions = NonNullable<Parameters<JwtService["sign"]>[1]>;

@Injectable()
export class TokensService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    @InjectModel(RefreshTokenDocument.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private signAccessToken(user: Pick<User, "id" | "username" | "isGuest">): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      username: user.username,
      isGuest: user.isGuest,
    };
    return this.jwtService.sign(payload, {
      // Non-null assertion is safe: app.config.ts's requireEnv() guarantees
      // jwtAccessSecret at boot. expiresIn is cast to jsonwebtoken's own
      // branded `StringValue` type (e.g. "15m") — env values like "15m" are
      // valid at runtime, TS just can't verify a generic `string` against
      // that branded literal type, so this narrows it explicitly instead of
      // widening with `any`.
      secret: this.configService.get<string>("app.jwtAccessSecret")!,
      expiresIn: this.configService.get<string>(
        "app.jwtAccessExpiresIn",
      ) as JwtSignOptions["expiresIn"],
    });
  }

  /** Issues a brand-new access+refresh pair, persisting only the refresh token's hash. */
  async issueTokenPair(user: Pick<User, "id" | "username" | "isGuest">): Promise<AuthTokens> {
    const accessToken = this.signAccessToken(user);
    const refreshToken = randomBytes(48).toString("hex");

    const expiresInDays = this.configService.get<number>("app.jwtRefreshExpiresInDays")!;
    await this.refreshTokenModel.create({
      userId: user.id,
      tokenHash: this.hash(refreshToken),
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    });

    return { accessToken, refreshToken };
  }

  /**
   * Verifies a refresh token, rotates it (revokes the old one, issues a new
   * pair), and detects reuse of an already-rotated token — a strong signal
   * of token theft — by revoking the entire chain if that happens
   * (see ADR-004 in docs/architecture/DECISIONS.md).
   *
   * Takes only the raw token — NOT a userId — because a refresh token is an
   * opaque random string, not a JWT with decodable claims. The user it
   * belongs to is looked up from the stored token record itself.
   */
  async rotateRefreshToken(rawToken: string): Promise<AuthTokens> {
    const tokenHash = this.hash(rawToken);
    const existing = await this.refreshTokenModel.findOne({ tokenHash }).exec();

    if (!existing || existing.expiresAt < new Date()) {
      throw new UnauthorizedException({
        success: false,
        error: { code: ERROR_CODES.REFRESH_TOKEN_INVALID, message: "Refresh token is invalid or expired" },
      });
    }

    if (existing.revokedAt) {
      // This exact token was already rotated away once before — reusing it
      // now means either a race (harmless) or theft (not harmless). Revoke
      // every other still-active token for this user as a precaution.
      await this.refreshTokenModel.updateMany(
        { userId: existing.userId, revokedAt: null },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException({
        success: false,
        error: {
          code: ERROR_CODES.REFRESH_TOKEN_REUSED,
          message: "This refresh token has already been used. All sessions have been revoked.",
        },
      });
    }

    const userDoc = await this.usersService.findById(existing.userId);
    if (!userDoc) {
      throw new UnauthorizedException({
        success: false,
        error: { code: ERROR_CODES.UNAUTHENTICATED, message: "User no longer exists" },
      });
    }
    const user: AuthenticatedUser = this.usersService.toAuthenticatedUser(userDoc);

    const newTokens = await this.issueTokenPair(user);
    const newTokenHash = this.hash(newTokens.refreshToken);

    existing.revokedAt = new Date();
    existing.replacedByTokenHash = newTokenHash;
    await existing.save();

    return newTokens;
  }

  /** Revokes a single refresh token (logout on this device only). */
  async revokeRefreshToken(rawToken: string): Promise<void> {
    await this.refreshTokenModel.updateOne(
      { tokenHash: this.hash(rawToken) },
      { revokedAt: new Date() },
    );
  }

  /** Revokes every refresh token for a user ("log out everywhere"). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenModel.updateMany(
      { userId, revokedAt: null },
      { revokedAt: new Date() },
    );
  }
}
