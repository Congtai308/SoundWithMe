import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { clientIp, rateLimitAddress } from "../utils/client-ip";

interface TrackedRequest {
  user?: { id?: unknown } | null;
}

/** `user:<id>` for signed-in requests, `ip:<real client address>` otherwise. */
export function throttleTracker(req: Record<string, unknown>): string {
  const user = (req as TrackedRequest).user;
  if (typeof user?.id === "string") return `user:${user.id}`;
  return `ip:${rateLimitAddress(clientIp(req))}`;
}

/**
 * Rate limits per signed-in user instead of per IP. Behind the web app's
 * proxy (Next rewrites, a tunnel) every request reaches the API from the
 * same address, so a plain IP limit would be shared by everyone at once.
 * Put it after JwtAuthGuard (or OptionalJwtAuthGuard) so `req.user` is set;
 * anonymous requests fall back to the real client address (see clientIp).
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return throttleTracker(req);
  }
}
