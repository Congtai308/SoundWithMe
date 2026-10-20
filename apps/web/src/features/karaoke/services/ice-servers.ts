import { apiClient } from "@/services/api-client";

const STUN_ONLY: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

let current: RTCIceServer[] = STUN_ONLY;
let expiresAt = 0;
let loading: Promise<void> | null = null;

/** The ICE servers to connect with now (STUN until the API's list arrives). */
export function iceServers(): RTCIceServer[] {
  if (Date.now() > expiresAt) void loadIceServers();
  return current;
}

/**
 * Fetches STUN/TURN servers (TURN credentials are short-lived, so they come
 * from the API). NEXT_PUBLIC_ICE_SERVERS, if set, wins — handy for local setups.
 */
export function loadIceServers(): Promise<void> {
  const configured = process.env.NEXT_PUBLIC_ICE_SERVERS;
  if (configured) {
    try {
      current = JSON.parse(configured) as RTCIceServer[];
      expiresAt = Number.POSITIVE_INFINITY;
      return Promise.resolve();
    } catch {
      // Fall back to the API.
    }
  }
  loading ??= apiClient
    .get<{ iceServers: RTCIceServer[]; relay: boolean; ttlSeconds: number }>("/rtc/ice-servers")
    .then((data) => {
      current = data.iceServers.length > 0 ? data.iceServers : STUN_ONLY;
      expiresAt = Date.now() + data.ttlSeconds * 1000;
    })
    .catch(() => {
      // Keep what we have; try again in a minute.
      expiresAt = Date.now() + 60_000;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}
