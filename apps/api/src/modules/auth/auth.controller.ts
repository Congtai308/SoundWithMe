import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  guestLoginSchema,
  loginSchema,
  registerSchema,
  type GuestLoginInput,
  type LoginInput,
  type RegisterInput,
} from "@soundwithme/validation";
import { ERROR_CODES } from "@soundwithme/constants";
import type { AuthenticatedUser } from "@soundwithme/types";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { setAuthCookies, clearAuthCookies, REFRESH_TOKEN_COOKIE } from "../../common/utils/auth-cookies";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { GoogleAuthGuard } from "./guards/google-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // Stricter than the default global throttle (Master Prompt §56) — these
  // endpoints are prime targets for credential stuffing / account-creation abuse.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("register")
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.register(body);
    this.setCookies(res, tokens);
    return { success: true, data: { user } };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.login(body);
    this.setCookies(res, tokens);
    return { success: true, data: { user } };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("guest")
  async loginAsGuest(
    @Body(new ZodValidationPipe(guestLoginSchema)) body: GuestLoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.loginAsGuest(body);
    this.setCookies(res, tokens);
    return { success: true, data: { user } };
  }

  @Get("google")
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // Guard handles the redirect to Google's consent screen; this body never runs.
  }

  @Get("google/callback")
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    // req.user here is the raw profile shape from GoogleStrategy.validate(),
    // NOT yet an AuthenticatedUser — that mapping happens inside the service.
    const profile = req.user as {
      googleId: string;
      email: string;
      displayName: string;
      avatarUrl: string | null;
    };

    const { tokens } = await this.authService.loginOrRegisterWithGoogle(profile);
    this.setCookies(res, tokens);

    const webAppUrl = this.configService.get<string>("app.webAppUrl");
    res.redirect(`${webAppUrl}/home`);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException({
        success: false,
        error: { code: ERROR_CODES.REFRESH_TOKEN_INVALID, message: "No refresh token provided" },
      });
    }

    const tokens = await this.authService.refresh(refreshToken);
    this.setCookies(res, tokens);
    return { success: true, data: { status: "ok" } };
  }

  @HttpCode(HttpStatus.OK)
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    clearAuthCookies(res);
    return { success: true, data: { status: "ok" } };
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post("logout-everywhere")
  async logoutEverywhere(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutEverywhere(user.id);
    clearAuthCookies(res);
    return { success: true, data: { status: "ok" } };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: { user } };
  }

  private setCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
    const refreshExpiresInDays = this.configService.get<number>("app.jwtRefreshExpiresInDays")!;
    setAuthCookies(res, tokens, refreshExpiresInDays);
  }
}
