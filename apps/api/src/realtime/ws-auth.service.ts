import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { IncomingHttpHeaders } from "http";
import { UsersService } from "../modules/users/users.service";
import { TokensService } from "../modules/auth/tokens.service";
import { ACCESS_TOKEN_COOKIE } from "../modules/auth/strategies/jwt.strategy";
import type { SocketSession, SocketUser } from "./realtime.types";

interface HandshakeLike {
  auth: Record<string, unknown>;
  headers: IncomingHttpHeaders;
}

/**
 * Resolves the user behind a Socket.IO handshake. Token sources, in order:
 * `handshake.auth.token` (mobile / explicit clients), `Authorization: Bearer`,
 * then the httpOnly access-token cookie (web client — JS can't read it, but
 * the browser sends it with the handshake request).
 */
@Injectable()
export class WsAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly tokensService: TokensService,
  ) {}

  async authenticate(handshake: HandshakeLike): Promise<{ user: SocketUser; session: SocketSession } | null> {
    const token = this.extractToken(handshake);
    if (!token) return null;

    let payload: { sub?: unknown; sid?: unknown; exp?: unknown };
    try {
      payload = await this.jwtService.verifyAsync<{ sub?: unknown; sid?: unknown; exp?: unknown }>(token, {
        secret: this.configService.get<string>("app.jwtAccessSecret"),
      });
    } catch {
      // Expired, malformed or wrongly-signed token: treat as unauthenticated.
      return null;
    }
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    const sessionId = typeof payload.sid === "string" ? payload.sid : null;
    // A logged-out session's still-unexpired access token can't open new sockets.
    if (sessionId !== null && !(await this.tokensService.isSessionActive(sessionId))) return null;

    const user = await this.usersService.findById(payload.sub);
    if (!user) return null;

    return {
      user: { id: user.id, displayName: user.displayName, isGuest: user.isGuest, avatarUrl: user.avatarUrl ?? null },
      session: { id: sessionId, tokenExpiresAt: payload.exp * 1000 },
    };
  }

  /**
   * Whether a socket may stay connected past its token's expiry: only while
   * its login session still has a usable refresh token (the browser keeps
   * refreshing). Tokens from before sessions existed never qualify.
   */
  async isSessionActive(session: SocketSession): Promise<boolean> {
    return session.id !== null && (await this.tokensService.isSessionActive(session.id));
  }

  private extractToken({ auth, headers }: HandshakeLike): string | null {
    if (typeof auth.token === "string" && auth.token.length > 0) {
      return auth.token;
    }

    const authorization = headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      return authorization.slice("Bearer ".length).trim() || null;
    }

    return readCookie(headers.cookie, ACCESS_TOKEN_COOKIE);
  }
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
