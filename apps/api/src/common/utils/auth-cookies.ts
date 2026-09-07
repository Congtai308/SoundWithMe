import type { Response } from "express";
import type { AuthTokens } from "@soundwithme/types";

const ACCESS_TOKEN_COOKIE = "swm_access_token";
const REFRESH_TOKEN_COOKIE = "swm_refresh_token";

const isProd = process.env.NODE_ENV === "production";

/**
 * Single place enforcing HttpOnly/Secure/SameSite on auth cookies (Master
 * Prompt §53). Nothing else in the codebase should set these cookies
 * directly.
 */
export function setAuthCookies(res: Response, tokens: AuthTokens, refreshExpiresInDays: number) {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    // Access token cookie has no explicit maxAge — it's validated by JWT
    // expiry, not cookie expiry; browser can keep the (expired) cookie
    // around harmlessly.
  });

  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    // Scoped to /auth/* only (covers /auth/refresh AND /auth/logout, which
    // both need to read it) — the browser never sends it to unrelated routes.
    path: "/api/v1/auth",
    maxAge: refreshExpiresInDays * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/api/v1/auth" });
}

export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };
