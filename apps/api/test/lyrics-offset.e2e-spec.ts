import { ERROR_CODES } from "@soundwithme/constants";
import type { Lyrics, SharedLyricsOffset } from "@soundwithme/types";
import { RealtimeHarness } from "./support/realtime-harness";

/** Lyrics timing that listeners settle on is shared: the median of their latest syncs. */
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterAll(() => h.stop());

const LYRICS: Lyrics = {
  trackName: "Neon Skyline",
  artistName: "Test Artist",
  durationMs: 200_000,
  lines: [
    { timeMs: 10_000, text: "first line" },
    { timeMs: 20_000, text: "second line" },
  ],
  plain: null,
};

let visitor = 0;
async function call<T>(path: string, cookie = "", method = "GET", body?: unknown, ip?: string) {
  const res = await fetch(`${h.baseUrl}/api/v1${path}`, {
    method,
    // Each call from its own address unless a test says otherwise (votes are limited per address).
    headers: { "content-type": "application/json", cookie, "x-forwarded-for": ip ?? `198.19.${Math.floor(visitor / 250)}.${(visitor++ % 250) + 1}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { data: T; error?: { code: string } };
  return { status: res.status, data: json.data, error: json.error };
}

describe("Shared lyrics offset", () => {
  beforeAll(async () => {
    // Lyrics as the API cached them, so nothing reaches LRCLIB.
    await h.redis().set("lyrics:v2:track_1", JSON.stringify(LYRICS));
    const stale = await h.redis().keys("lyrics:offsets:track_1:*");
    if (stale.length > 0) await h.redis().del(...stale);
  });

  it("starts with none, then follows the median of each listener's latest sync", async () => {
    const first = await call<{ sharedOffset: SharedLyricsOffset | null }>("/tracks/track_1/lyrics");
    expect(first.data.sharedOffset).toBeNull();

    const listeners = await Promise.all(
      ["a", "b", "c"].map((n) => h.registerUser({ email: `${n}${Date.now()}@example.com`, password: "a-long-password-1", displayName: n })),
    );
    await call("/tracks/track_1/lyrics/offset", listeners[0]!.cookie, "POST", { offsetMs: -1_000 });
    await call("/tracks/track_1/lyrics/offset", listeners[1]!.cookie, "POST", { offsetMs: -1_200 });
    // One odd vote doesn't drag everyone along.
    const odd = await call<{ sharedOffset: SharedLyricsOffset }>("/tracks/track_1/lyrics/offset", listeners[2]!.cookie, "POST", {
      offsetMs: 90_000,
    });
    expect(odd.data.sharedOffset).toEqual({ offsetMs: -1_000, votes: 3 });

    // A listener re-syncing replaces their own vote.
    await call("/tracks/track_1/lyrics/offset", listeners[2]!.cookie, "POST", { offsetMs: -1_100 });
    const after = await call<{ sharedOffset: SharedLyricsOffset }>("/tracks/track_1/lyrics");
    expect(after.data.sharedOffset).toEqual({ offsetMs: -1_100, votes: 3 });
  });

  it("only takes votes from verified accounts, within sane bounds", async () => {
    expect((await call("/tracks/track_1/lyrics/offset", "", "POST", { offsetMs: 500 })).status).toBe(401);
    // Guest accounts are free to make: they keep their own timing but don't vote.
    const guest = await h.createGuest("D");
    expect((await call("/tracks/track_1/lyrics/offset", guest.cookie, "POST", { offsetMs: 500 })).error?.code).toBe(
      ERROR_CODES.FORBIDDEN,
    );
    const member = await h.registerUser({ email: `e${Date.now()}@example.com`, password: "a-long-password-1", displayName: "E" });
    const wild = await call("/tracks/track_1/lyrics/offset", member.cookie, "POST", { offsetMs: 3_600_000 });
    expect(wild.error?.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it("counts at most two voters per address for a song", async () => {
    const voters = await Promise.all(
      ["g", "h", "i"].map((n) => h.registerUser({ email: `${n}${Date.now()}@example.com`, password: "a-long-password-1", displayName: n })),
    );
    const results = [];
    for (const v of voters) {
      results.push(await call<{ sharedOffset: SharedLyricsOffset | null }>("/tracks/track_1/lyrics/offset", v.cookie, "POST", { offsetMs: 7_000 }, "203.0.113.77"));
    }
    const votes = results.map((r) => r.data.sharedOffset?.votes ?? 0);
    expect(votes[2]).toBe(votes[1]); // the third account from that address isn't counted
  });

  it("keeps the newest votes when full, instead of locking the first ones in", async () => {
    const key = (await h.redis().keys("lyrics:offsets:track_1:*")).find((k) => !k.endsWith(":voted-at"))!;
    // Fill the song to the cap with old votes of +9 s.
    const old = Array.from({ length: 500 }, (_, i) => `old-${i}`);
    await h.redis().del(key, `${key}:voted-at`);
    await h.redis().hset(key, Object.fromEntries(old.map((id) => [id, "9000"])));
    await h.redis().zadd(`${key}:voted-at`, ...old.flatMap((id, i) => [i, id]));
    const member = await h.registerUser({ email: `f${Date.now()}@example.com`, password: "a-long-password-1", displayName: "F" });
    const res = await call<{ sharedOffset: SharedLyricsOffset }>("/tracks/track_1/lyrics/offset", member.cookie, "POST", {
      offsetMs: -500,
    });
    expect(res.data.sharedOffset.votes).toBe(500); // still capped
    expect(await h.redis().hget(key, "old-0")).toBeNull(); // the oldest made room
    expect(await h.redis().hget(key, "old-1")).toBe("9000"); // the rest stay
  });
});
