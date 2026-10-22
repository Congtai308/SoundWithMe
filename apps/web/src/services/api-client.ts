import type { ApiResponse } from "@soundwithme/types";
import { errorMessage } from "./error-messages";

/**
 * The API's base URL. Opened from another host (a tunnel, a LAN IP), the app
 * goes through its own origin, which next.config.mjs proxies to the API.
 */
function apiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    return `${window.location.origin}/api/v1`;
  }
  return "http://localhost:4000/api/v1";
}

const API_BASE_URL = apiBaseUrl();
// Health/readiness endpoints intentionally sit outside the /api/v1 prefix.
export const API_ROOT_URL = API_BASE_URL.replace(/\/api\/v1$/, "");
export { API_BASE_URL };

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, string | number | boolean | null> = {},
  ) {
    super(errorMessage(code, message, details));
    this.name = "ApiClientError";
  }
}

// Dedupes concurrent refresh attempts — if several requests 401 at once
// (e.g. a page fires multiple queries in parallel right as the access
// token expires), they share ONE refresh call instead of each triggering
// their own.
let refreshPromise: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include", // cookies for session auth
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = (await response.json()) as ApiResponse<T>;

  if (!body.success) {
    // Access token expires after 15 minutes — if a request fails because
    // of that mid-session, try ONE silent refresh and retry the original
    // request exactly once. Never retries the refresh call itself (that's
    // excluded below), so a genuinely expired/invalid session still fails
    // cleanly instead of looping.
    const isExpiredAccessToken =
      response.status === 401 && body.error.code === "UNAUTHENTICATED";
    if (isExpiredAccessToken && !isRetry && !path.startsWith("/auth/refresh")) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return request<T>(path, init, true);
      }
    }
    throw new ApiClientError(body.error.code, body.error.message, body.error.details);
  }

  return body.data;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PUT", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
