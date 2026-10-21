import { API_BASE_URL } from "@/services/api-client";

/**
 * Playback positions are anchored to the server's clock (serverTimestamp), but
 * listeners' device clocks drift from it by anything from a few ms to several
 * seconds. Using raw Date.now() would put every listener at a different spot.
 * This estimates `serverNow - clientNow` NTP-style: sample the server time a
 * few times and keep the sample with the smallest round trip, assuming the
 * request and response legs took equal time.
 */
const SAMPLES = 5;
const RESYNC_INTERVAL_MS = 5 * 60_000;

let offsetMs = 0;
let lastSyncedAt = 0;
let inFlight: Promise<number> | null = null;
let settled = false;

async function sampleOnce(): Promise<{ offset: number; roundTrip: number } | null> {
  const sentAt = performance.now();
  const sentWallClock = Date.now();
  const response = await fetch(`${API_BASE_URL}/time`, { cache: "no-store" });
  const receivedAt = performance.now();
  if (!response.ok) return null;
  const body: unknown = await response.json();
  const serverNow =
    typeof body === "object" && body !== null && "data" in body &&
    typeof body.data === "object" && body.data !== null && "now" in body.data &&
    typeof body.data.now === "number"
      ? body.data.now
      : null;
  if (serverNow === null) return null;

  const roundTrip = receivedAt - sentAt;
  const clientMidpoint = sentWallClock + roundTrip / 2;
  return { offset: serverNow - clientMidpoint, roundTrip };
}

/** Re-estimates the offset (deduplicated; cheap to call often). Resolves to the offset in ms. */
export function syncServerClock(force = false): Promise<number> {
  if (!force && Date.now() - lastSyncedAt < RESYNC_INTERVAL_MS) return Promise.resolve(offsetMs);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let best: { offset: number; roundTrip: number } | null = null;
    for (let i = 0; i < SAMPLES; i++) {
      try {
        const sample = await sampleOnce();
        if (sample && (!best || sample.roundTrip < best.roundTrip)) best = sample;
      } catch (error: unknown) {
        // A failed sample just means fewer samples; keep the previous offset if all fail.
        console.warn("[server-clock] sample failed", error);
      }
    }
    if (best) {
      offsetMs = best.offset;
      lastSyncedAt = Date.now();
    }
    return offsetMs;
  })().finally(() => {
    inFlight = null;
    settled = true;
  });
  return inFlight;
}

/**
 * True once a first estimate has been attempted (successful or not). Starting
 * playback before that would place a late joiner by their raw device clock,
 * which can be seconds off, and force a second, audible correction.
 */
export function isServerClockSettled(): boolean {
  return settled;
}

/** Current time on the server's clock, in epoch ms. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function serverClockOffsetMs(): number {
  return offsetMs;
}
