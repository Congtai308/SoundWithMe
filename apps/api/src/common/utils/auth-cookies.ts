import type { Request, Response } from "express";
import type { AuthTokens } from "@soundwithme/types";

const ACCESS_TOKEN_COOKIE = "swm_access_token";
const REFRESH_TOKEN_COOKIE = "swm_refresh_token";

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;
/** localhost, loopback and private (LAN) addresses: the only places plain http is expected. */
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^.]+\.local)$/i;

function lastHeaderValue(req: Request, name: string): string | undefined {
  const header = req.headers[name];
  const value = Array.isArray(header) ? header.join(",") : header;
  return value?.split(",").at(-1)?.trim() || undefined;
}

/**
 * Whether auth cookies get the Secure flag. Always in production, and
 * otherwise whenever the browser isn't on this machine or the LAN: behind
 * the tunnel (https://xxx.trycloudflare.com) the cookies must never travel
 * over plain http. Forwarded headers are only read from the local proxies
 * (Next, cloudflared); a forged one could only make the sender's own
 * cookies less strict.
 */
export function wantsSecureCookies(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const viaLocalProxy = LOOPBACK.test(req.socket?.remoteAddress ?? "");
  const proto = (viaLocalProxy && lastHeaderValue(req, "x-forwarded-proto")) || req.protocol;
  if (proto === "https") return true;
  const host = (viaLocalProxy && lastHeaderValue(req, "x-forwarded-host")) || req.headers.host || "";
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]!;
  return !LOCAL_HOST.test(hostname);
}

/**
 * Single place enforcing HttpOnly/Secure/SameSite on auth cookies (Master
 * Prompt §53). Nothing else in the codebase should set these cookies
 * directly.
 */
export function setAuthCookies(res: Response, tokens: AuthTokens, refreshExpiresInDays: number) {
  const secure = wantsSecureCookies(res.req);
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    // Access token cookie has no explicit maxAge — it's validated by JWT
    // expiry, not cookie expiry; browser can keep the (expired) cookie
    // around harmlessly.
  });

  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
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
