import {
  Body,
  ConflictException,
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
  completeSignupSchema,
  forgotPasswordSchema,
  guestLoginSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type CompleteSignupInput,
  type ForgotPasswordInput,
  type GuestLoginInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from "@soundwithme/validation";
import { ERROR_CODES } from "@soundwithme/constants";
import type { AuthenticatedUser } from "@soundwithme/types";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import {
  setAuthCookies,
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
} from "../../common/utils/auth-cookies";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { UserThrottlerGuard } from "../../common/guards/user-throttler.guard";
import { GoogleAuthGuard } from "./guards/google-auth.guard";
import { OptionalJwtAuthGuard } from "./guards/optional-jwt-auth.guard";
import { clientIp } from "../../common/utils/client-ip";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // Per real client address (see clientIp). Roomy enough for many people on
  // one wifi; password guessing is limited per email and address in AuthService.login.
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post("register")
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput, @Req() req: Request) {
    // The same answer for every email: see AuthService.register.
    this.authService.register(body, clientIp(req));
    return { success: true, data: { status: "check-email" } };
  }

  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post("register/complete")
  async completeSignup(
    @Body(new ZodValidationPipe(completeSignupSchema)) body: CompleteSignupInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.completeSignup(body);
    this.setCookies(res, tokens);
    return { success: true, data: { user } };
  }

  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.login(body, clientIp(req));
    this.setCookies(res, tokens);
    return { success: true, data: { user } };
  }

  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
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
    const webAppUrl = this.configService.get<string>("app.webAppUrl");
    // req.user here is the raw profile shape from GoogleStrategy.validate(),
    // NOT yet an AuthenticatedUser — that mapping happens inside the service.
    // Empty when sign-in failed (see GoogleAuthGuard).
    const profile = req.user as
      | { googleId: string; email: string; displayName: string; avatarUrl: string | null }
      | undefined
      | null;
    if (!profile) {
      res.redirect(`${webAppUrl}/login?error=google`);
      return;
    }

    let tokens: { accessToken: string; refreshToken: string };
    try {
      ({ tokens } = await this.authService.loginOrRegisterWithGoogle(profile));
    } catch (error: unknown) {
      if (!(error instanceof ConflictException)) throw error;
      res.redirect(`${webAppUrl}/login?error=google-linked`);
      return;
    }
    this.setCookies(res, tokens);
    res.redirect(`${webAppUrl}/discover`);
  }

  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: ERROR_CODES.REFRESH_TOKEN_INVALID,
          message: "No refresh token provided",
        },
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

  /** Mails a new verification link to the signed-in user (at most a few an hour). */
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("verify-email/send")
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.resendVerification(user.id);
    return { success: true, data: { status: "sent" } };
  }

  /**
   * Opened from the mailed link, signed in or not. Signed in as the account
   * itself also proves the password holder owns the mailbox (Google sign-in
   * with this address then keeps the password).
   */
  @UseGuards(OptionalJwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("verify-email")
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
    @CurrentUser() user: AuthenticatedUser | null,
  ) {
    await this.authService.verifyEmail(body.token, user?.id ?? null);
    return { success: true, data: { status: "verified" } };
  }

  /** Always the same answer, so it can't be used to find out which emails have accounts. */
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("password/forgot")
  forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput, @Req() req: Request) {
    this.authService.forgotPassword(body.email, clientIp(req));
    return { success: true, data: { status: "sent-if-exists" } };
  }

  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("password/reset")
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.resetPassword(body);
    // Every session ended, this browser's included: sign in again with the new password.
    clearAuthCookies(res);
    return { success: true, data: { status: "reset" } };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: { user } };
  }

  private setCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    const refreshExpiresInDays = this.configService.get<number>(
      "app.jwtRefreshExpiresInDays",
    )!;
    setAuthCookies(res, tokens, refreshExpiresInDays);
  }
}
