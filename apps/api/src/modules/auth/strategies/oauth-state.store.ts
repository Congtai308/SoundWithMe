import { randomBytes, timingSafeEqual } from "crypto";
import type { Request } from "express";
import { wantsSecureCookies } from "../../../common/utils/auth-cookies";

const OAUTH_STATE_COOKIE = "swm_oauth_state";
/** Covers both /auth/google (where sign-in starts) and /auth/google/callback. */
const OAUTH_STATE_PATH = "/api/v1/auth/google";
const OAUTH_STATE_TTL_MS = 10 * 60_000;

type StoreCallback = (error: Error | null, state?: string) => void;
type VerifyCallback = (error: Error | null, verifier: string | false, info?: { message: string }) => void;

/**
 * OAuth `state` + PKCE verifier for passport-oauth2, kept in a short-lived
 * httpOnly cookie of the browser that started signing in (the API has no
 * server sessions). The callback only goes ahead when its `state` matches
 * that cookie, so a link carrying someone else's authorization code can't
 * sign a victim into the attacker's account (login CSRF).
 */
export class OAuthStateCookieStore {
  store(req: Request, verifier: string, _state: unknown, _meta: unknown, callback: StoreCallback): void {
    const state = randomBytes(24).toString("base64url");
    req.res!.cookie(OAUTH_STATE_COOKIE, `${state}.${verifier}`, {
      httpOnly: true,
      secure: wantsSecureCookies(req),
      // Lax still sends it on the top-level redirect back from Google.
      sameSite: "lax",
      path: OAUTH_STATE_PATH,
      maxAge: OAUTH_STATE_TTL_MS,
    });
    callback(null, state);
  }

  verify(req: Request, providedState: unknown, _meta: unknown, callback: VerifyCallback): void {
    const stored: unknown = req.cookies?.[OAUTH_STATE_COOKIE];
    // One use only.
    req.res?.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_STATE_PATH });
    const separator = typeof stored === "string" ? stored.indexOf(".") : -1;
    if (typeof stored !== "string" || separator <= 0 || typeof providedState !== "string") {
      callback(null, false, { message: "Sign-in expired or was started in another browser" });
      return;
    }
    const state = stored.slice(0, separator);
    const verifier = stored.slice(separator + 1);
    if (!verifier || !sameString(state, providedState)) {
      callback(null, false, { message: "Sign-in expired or was started in another browser" });
      return;
    }
    callback(null, verifier);
  }
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
