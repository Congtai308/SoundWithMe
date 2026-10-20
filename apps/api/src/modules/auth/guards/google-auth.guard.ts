import { Injectable, Logger } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * A failed Google sign-in (state mismatch, unverified email, Google error)
 * leaves `req.user` empty instead of throwing: the callback then sends the
 * browser back to the login page rather than showing it a JSON error.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {
  private readonly logger = new Logger(GoogleAuthGuard.name);

  override handleRequest<TUser>(error: unknown, user: TUser, info: unknown): TUser {
    if (error || !user) {
      const reason = error instanceof Error ? error.message : (info as { message?: string } | undefined)?.message;
      this.logger.warn(`Google sign-in failed: ${reason ?? "unknown reason"}`);
      return null as TUser;
    }
    return user;
  }
}
