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

async function call<T>(path: string, cookie = "", method = "GET", body?: unknown) {
  const res = await fetch(`${h.baseUrl}/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
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

    const listeners = await Promise.all(["A", "B", "C"].map((n) => h.createGuest(n)));
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

  it("only takes votes from signed-in listeners, within sane bounds", async () => {
    expect((await call("/tracks/track_1/lyrics/offset", "", "POST", { offsetMs: 500 })).status).toBe(401);
    const guest = await h.createGuest("D");
    const wild = await call("/tracks/track_1/lyrics/offset", guest.cookie, "POST", { offsetMs: 3_600_000 });
    expect(wild.error?.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });
});
