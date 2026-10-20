import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Request } from "express";
import type { AccessTokenPayload } from "@soundwithme/types";
import { ERROR_CODES } from "@soundwithme/constants";
import { UsersService } from "../../users/users.service";
import { TokensService } from "../tokens.service";

const ACCESS_TOKEN_COOKIE = "swm_access_token";

function cookieExtractor(req: Request): string | null {
  return req?.cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly tokensService: TokensService,
  ) {
    super({
      // Cookie first (web client), bearer header as a fallback (future
      // mobile client, per Architecture Review §13).
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      // Non-null assertion is safe here: app.config.ts's requireEnv() throws
      // at boot if this var is missing, so by the time this constructor runs
      // it is guaranteed to be a string — TS just can't see that guarantee
      // through ConfigService's generic .get<T>().
      secretOrKey: configService.get<string>("app.jwtAccessSecret")!,
    });
  }

  async validate(payload: AccessTokenPayload) {
    // A logged-out session's access token stops working at once, not when it expires.
    if (payload.sid && !(await this.tokensService.isSessionActive(payload.sid))) {
      throw new UnauthorizedException({
        success: false,
        error: { code: ERROR_CODES.UNAUTHENTICATED, message: "This session has ended" },
      });
    }
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        success: false,
        error: { code: ERROR_CODES.UNAUTHENTICATED, message: "User no longer exists" },
      });
    }
    // Whatever is returned here becomes `req.user` in guarded routes.
    return this.usersService.toAuthenticatedUser(user);
  }
}

export { ACCESS_TOKEN_COOKIE };
