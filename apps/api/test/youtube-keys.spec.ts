import type { ConfigService } from "@nestjs/config";
import type { RedisService } from "../src/database/redis/redis.service";
import { YouTubeMusicProvider } from "../src/modules/music/providers/youtube-music.provider";

const SEARCH_BODY = { items: [] };
const quotaResponse = () => new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 });
const okResponse = () => new Response(JSON.stringify(SEARCH_BODY), { status: 200 });

function makeProvider(keys: string[]) {
  const config = { get: () => keys } as unknown as ConfigService;
  const client = { get: async () => null, set: async () => "OK" };
  const redis = { getClient: () => client } as unknown as RedisService;
  return new YouTubeMusicProvider(config, redis);
}

const keyOf = (call: unknown[]) => new URL(String(call[0])).searchParams.get("key");

describe("YouTube API key rotation", () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  it("switches to the backup key when the first is out of quota, and stays on it", async () => {
    const provider = makeProvider(["main", "backup"]);
    fetchMock.mockImplementation(async (url: string) =>
      new URL(url).searchParams.get("key") === "main" ? quotaResponse() : okResponse(),
    );

    await expect(provider.search("song a")).resolves.toEqual([]);
    expect(fetchMock.mock.calls.map(keyOf)).toEqual(["main", "backup"]);

    // The spent key rests: the next search goes straight to the backup.
    await provider.search("song b");
    expect(fetchMock.mock.calls.map(keyOf)).toEqual(["main", "backup", "backup"]);
  });

  it("reports quota exceeded once every key is spent", async () => {
    const provider = makeProvider(["main", "backup"]);
    fetchMock.mockImplementation(async () => quotaResponse());
    await expect(provider.search("song")).rejects.toMatchObject({
      response: { error: { code: "MUSIC_PROVIDER_QUOTA_EXCEEDED" } },
    });
  });

  it("does not burn the backup key on ordinary failures", async () => {
    const provider = makeProvider(["main", "backup"]);
    fetchMock.mockImplementation(async () => new Response("", { status: 500 }));
    await expect(provider.search("song")).rejects.toMatchObject({
      response: { error: { code: "MUSIC_PROVIDER_UNAVAILABLE" } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("YouTube lookups", () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;
  const video = (id: string) => ({
    id,
    snippet: { title: `Song ${id}`, channelTitle: "Artist" },
    contentDetails: { duration: "PT3M" },
    status: { embeddable: true },
  });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  /** A provider over an in-memory Redis (get/set/mget/incr/expire). */
  function memoryProvider(keys: string[]) {
    const store = new Map<string, string>();
    const client = {
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string) => {
        store.set(key, value);
        return "OK";
      },
      mget: async (...list: string[]) => list.map((key) => store.get(key) ?? null),
      incr: async (key: string) => {
        const next = Number(store.get(key) ?? 0) + 1;
        store.set(key, String(next));
        return next;
      },
      expire: async () => 1,
    };
    const config = { get: () => keys } as unknown as ConfigService;
    return new YouTubeMusicProvider(config, { getClient: () => client } as unknown as RedisService);
  }

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  it("loads a search's videos in one batched call", async () => {
    const ids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"];
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/search?")
        ? json({ items: ids.map((videoId) => ({ id: { videoId } })) })
        : json({ items: ids.map(video) }),
    );
    const tracks = await memoryProvider(["main"]).search("lofi");
    expect(tracks.map((t) => t.providerTrackId)).toEqual(ids);
    const videoCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/videos?"));
    expect(videoCalls).toHaveLength(1);
    expect(new URL(String(videoCalls[0]![0])).searchParams.get("id")).toBe(ids.join(","));
  });

  it("falls back to oEmbed for a pasted link once the keys are out of quota", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("oembed")
        ? json({ title: "Linked song", author_name: "Channel" })
        : new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 }),
    );
    const track = await memoryProvider(["main"]).resolveUrl("https://youtu.be/ddddddddddd");
    expect(track).toMatchObject({ title: "Linked song", providerTrackId: "ddddddddddd", durationMs: 0 });
  });

  it("caps uncached searches per visitor, while cached ones stay free", async () => {
    fetchMock.mockImplementation(async () => json({ items: [] }));
    const provider = memoryProvider(["main"]);
    const budget = { tracker: "ip:203.0.113.5", anonymous: true };
    for (let n = 0; n < 10; n++) await provider.search(`query ${n}`, 20, budget);
    await expect(provider.search("query 0", 20, budget)).resolves.toEqual([]); // cached
    await expect(provider.search("query 10", 20, budget)).rejects.toMatchObject({
      response: { error: { code: "RATE_LIMITED" } },
    });
    // A different limit doesn't make the same query a new (paid) search.
    const calls = fetchMock.mock.calls.length;
    await provider.search("query 0", 5, budget);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});

