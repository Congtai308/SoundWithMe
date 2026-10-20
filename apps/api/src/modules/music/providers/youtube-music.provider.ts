import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Album, Artist, MusicProvider, Track } from "@soundwithme/types";
import { ERROR_CODES } from "@soundwithme/constants";
import { RedisService } from "../../../database/redis/redis.service";

/** Track ids from this provider are `yt_<videoId>`; artist ids are `ytc_<base64url(channel name)>`. */
export const YOUTUBE_TRACK_PREFIX = "yt_";
export const YOUTUBE_ARTIST_PREFIX = "ytc_";
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const TRACK_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
/** Missing videos are rechecked sooner: a private video may go public. */
const TRACK_MISS_TTL_SECONDS = 60 * 10;
const SEARCH_CACHE_TTL_SECONDS = 60 * 60 * 6; // search costs 100 quota units — cache hard
const ARTIST_IMAGE_TTL_SECONDS = 60 * 60 * 24 * 30;
const ARTIST_IMAGE_MISS_TTL_SECONDS = 60 * 60 * 24 * 7;
const REQUEST_TIMEOUT_MS = 5_000;
/** A key out of quota is skipped this long before it's tried again (quota resets daily). */
const KEY_REST_MS = 60 * 60 * 1000;
/** Every search is fetched (and cached) at this size and sliced, so `limit` can't multiply cache misses. */
const SEARCH_FETCH_SIZE = 25;
/** The `videos` endpoint takes up to 50 ids per call (1 quota unit). */
const VIDEOS_BATCH_SIZE = 50;

/**
 * Cold searches cost 100 quota units each (10k/day per key), so each caller
 * gets a budget of them. Cached searches are free and never counted.
 */
export interface QuotaBudget {
  /** `user:<id>` or `ip:<address>`. */
  tracker: string;
  anonymous: boolean;
}
const COLD_SEARCHES_PER_HOUR = { user: 30, anonymous: 10 };
/** All signed-out visitors together; keeps the larger part of the daily quota for signed-in users. */
const ANONYMOUS_COLD_SEARCHES_PER_DAY = 40;

const oEmbedSchema = z.object({
  title: z.string(),
  author_name: z.string(),
  thumbnail_url: z.string().url().optional(),
});

const videosResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      snippet: z.object({
        title: z.string(),
        channelTitle: z.string(),
        thumbnails: z.record(z.object({ url: z.string() })).optional(),
      }),
      // Live streams and premieres have no duration yet.
      contentDetails: z.object({ duration: z.string().optional() }).optional(),
      status: z.object({ embeddable: z.boolean() }).optional(),
    }),
  ),
});

const channelSearchResponseSchema = z.object({
  items: z.array(
    z.object({
      snippet: z.object({
        thumbnails: z.record(z.object({ url: z.string() })).optional(),
      }),
    }),
  ),
});

const searchResponseSchema = z.object({
  items: z.array(z.object({ id: z.object({ videoId: z.string().optional() }) })),
});

const cachedTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artistId: z.string(),
  albumId: z.null(),
  durationMs: z.number(),
  artworkUrl: z.string().nullable(),
  provider: z.literal("youtube"),
  providerTrackId: z.string(),
  playbackSource: z.literal("youtube-embed"),
});

/** Extracts a video id from a YouTube URL (watch, youtu.be, shorts, embed, music) or a bare id. */
export function parseYouTubeVideoId(input: string): string | null {
  const value = input.trim();
  if (VIDEO_ID_PATTERN.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") candidate = url.searchParams.get("v");
    else {
      const match = url.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      candidate = match?.[2] ?? null;
    }
  }
  return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

/** ISO-8601 duration (PT#H#M#S) → milliseconds. */
function parseIsoDuration(value: string): number {
  const match = value.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const [, d, h, m, s] = match.map((part) => Number(part ?? 0));
  return ((((d ?? 0) * 24 + (h ?? 0)) * 60 + (m ?? 0)) * 60 + (s ?? 0)) * 1000;
}

function artistIdFor(channelName: string): string {
  return YOUTUBE_ARTIST_PREFIX + Buffer.from(channelName, "utf8").toString("base64url");
}

/**
 * YouTube as a catalog. Tracks play through the official embedded player on
 * each client — this provider never downloads or proxies media.
 *
 * - Resolving a link/id works without credentials (oEmbed).
 * - Search needs YOUTUBE_API_KEY (Data API v3); without it search returns [].
 *   Extra keys (comma-separated, or YOUTUBE_API_KEY_BACKUP) take over in turn
 *   when one runs out of daily quota.
 */
@Injectable()
export class YouTubeMusicProvider implements MusicProvider {
  private readonly logger = new Logger(YouTubeMusicProvider.name);
  /** `<key index>:<quota bucket>` → when that key may be tried again. */
  private readonly keyRestingUntil = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  get searchEnabled(): boolean {
    return this.apiKeys.length > 0;
  }

  private get apiKeys(): string[] {
    return this.configService.get<string[]>("app.youtubeApiKeys") ?? [];
  }

  async search(query: string, limit = 20, budget?: QuotaBudget): Promise<Track[]> {
    if (!this.searchEnabled) return [];

    const normalized = query.trim().toLowerCase();
    const cacheKey = `music:yt:search:${normalized}`;
    const cached = await this.redisService.getClient().get(cacheKey);
    let videoIds: string[];

    if (cached !== null) {
      videoIds = z.array(z.string()).parse(JSON.parse(cached));
    } else {
      if (budget) await this.spendColdSearch(budget);
      const params = new URLSearchParams({
        part: "snippet",
        type: "video",
        videoCategoryId: "10", // Music
        videoEmbeddable: "true",
        maxResults: String(SEARCH_FETCH_SIZE),
        q: query,
      });
      const body = await this.fetchDataApi("search", params, "search");
      videoIds = searchResponseSchema
        .parse(body)
        .items.map((item) => item.id.videoId)
        .filter((id): id is string => Boolean(id));
      await this.redisService
        .getClient()
        .set(cacheKey, JSON.stringify(videoIds), "EX", SEARCH_CACHE_TTL_SECONDS);
    }

    return this.getTracks(videoIds.slice(0, limit));
  }

  /**
   * Several videos at once: cached ones from Redis, the rest in batched
   * `videos` calls. A video that can't be loaded is left out instead of
   * failing the whole list.
   */
  async getTracks(videoIds: string[]): Promise<Track[]> {
    const ids = videoIds.filter((id) => VIDEO_ID_PATTERN.test(id));
    if (ids.length === 0) return [];
    const client = this.redisService.getClient();
    const cachedValues = await client.mget(...ids.map((id) => `music:yt:track:${id}`));
    const found = new Map<string, Track>();
    const missing: string[] = [];
    ids.forEach((id, index) => {
      const raw = cachedValues[index];
      const parsed = raw ? cachedTrackSchema.safeParse(JSON.parse(raw)) : null;
      if (parsed?.success) found.set(id, parsed.data);
      else missing.push(id);
    });

    if (missing.length > 0) {
      for (const track of await this.fetchMany(missing)) {
        found.set(track.providerTrackId, track);
        await client.set(`music:yt:track:${track.providerTrackId}`, JSON.stringify(track), "EX", TRACK_CACHE_TTL_SECONDS);
      }
    }
    return ids.map((id) => found.get(id)).filter((track): track is Track => track !== undefined);
  }

  /** Accepts a raw video id or a `yt_`-prefixed track id. */
  async getTrack(providerTrackId: string): Promise<Track | null> {
    const videoId = providerTrackId.startsWith(YOUTUBE_TRACK_PREFIX)
      ? providerTrackId.slice(YOUTUBE_TRACK_PREFIX.length)
      : providerTrackId;
    if (!VIDEO_ID_PATTERN.test(videoId)) return null;

    const cacheKey = `music:yt:track:${videoId}`;
    const cached = await this.redisService.getClient().get(cacheKey);
    // "" = known to be missing or unplayable, so made-up ids can't each cost a lookup.
    if (cached === "") return null;
    if (cached !== null) {
      const parsed = cachedTrackSchema.safeParse(JSON.parse(cached));
      if (parsed.success) return parsed.data;
    }

    const track = await this.fetchOne(videoId);
    await this.redisService
      .getClient()
      .set(cacheKey, track ? JSON.stringify(track) : "", "EX", track ? TRACK_CACHE_TTL_SECONDS : TRACK_MISS_TTL_SECONDS);
    return track;
  }

  async resolveUrl(input: string): Promise<Track | null> {
    const videoId = parseYouTubeVideoId(input);
    return videoId ? this.getTrack(videoId) : null;
  }

  /**
   * Avatar of the artist's YouTube channel, or null. Each new name costs one
   * search (100 quota units), so hits are cached for 30 days and misses for 7.
   */
  async findArtistImage(name: string, budget?: QuotaBudget): Promise<string | null> {
    if (!this.searchEnabled) return null;

    const cacheKey = `music:yt:artist-image:${name.trim().toLowerCase()}`;
    const cached = await this.redisService.getClient().get(cacheKey);
    if (cached !== null) return cached || null;
    if (budget) await this.spendColdSearch(budget);

    const params = new URLSearchParams({ part: "snippet", type: "channel", maxResults: "1", q: name });
    const body = await this.fetchDataApi("search", params, "channel search");
    const thumbnails = channelSearchResponseSchema.parse(body).items[0]?.snippet.thumbnails ?? {};
    const url = (thumbnails.high ?? thumbnails.medium ?? thumbnails.default)?.url ?? null;
    await this.redisService
      .getClient()
      .set(cacheKey, url ?? "", "EX", url ? ARTIST_IMAGE_TTL_SECONDS : ARTIST_IMAGE_MISS_TTL_SECONDS);
    return url;
  }

  async getArtist(providerArtistId: string): Promise<Artist | null> {
    if (!providerArtistId.startsWith(YOUTUBE_ARTIST_PREFIX)) return null;
    const name = Buffer.from(providerArtistId.slice(YOUTUBE_ARTIST_PREFIX.length), "base64url").toString("utf8");
    return name ? { id: providerArtistId, name, imageUrl: null } : null;
  }

  async getAlbum(): Promise<Album | null> {
    return null;
  }

  async getPlaybackCapabilities(): Promise<{ supportsRangeRequests: boolean; supportsHls: boolean }> {
    return { supportsRangeRequests: false, supportsHls: false };
  }

  /**
   * One video: the Data API when a key is configured, oEmbed otherwise, and
   * oEmbed again when every key is out of quota or the Data API is failing,
   * so pasting a link keeps working.
   */
  private async fetchOne(videoId: string): Promise<Track | null> {
    if (!this.searchEnabled) return this.fetchViaOEmbed(videoId);
    try {
      return (await this.fetchViaDataApi([videoId]))[0] ?? null;
    } catch (error: unknown) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      return this.fetchViaOEmbed(videoId);
    }
  }

  private async fetchMany(videoIds: string[]): Promise<Track[]> {
    if (this.searchEnabled) {
      try {
        const tracks: Track[] = [];
        for (let start = 0; start < videoIds.length; start += VIDEOS_BATCH_SIZE) {
          tracks.push(...(await this.fetchViaDataApi(videoIds.slice(start, start + VIDEOS_BATCH_SIZE))));
        }
        return tracks;
      } catch (error: unknown) {
        if (!(error instanceof ServiceUnavailableException)) throw error;
        // Out of quota or failing: fall back to oEmbed below.
      }
    }
    const results = await Promise.allSettled(videoIds.map((id) => this.fetchViaOEmbed(id)));
    return results
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter((track): track is Track => track !== null);
  }

  /** Up to 50 videos in one `videos` call (1 quota unit). Unplayable ones are dropped. */
  private async fetchViaDataApi(videoIds: string[]): Promise<Track[]> {
    const params = new URLSearchParams({ part: "snippet,contentDetails,status", id: videoIds.join(",") });
    const body = await this.fetchDataApi("videos", params, "videos");
    return videosResponseSchema
      .parse(body)
      .items.filter((item) => item.status?.embeddable !== false)
      .map((item): Track => {
        const thumbnails = item.snippet.thumbnails ?? {};
        return {
          id: `${YOUTUBE_TRACK_PREFIX}${item.id}`,
          title: item.snippet.title,
          artistId: artistIdFor(item.snippet.channelTitle),
          albumId: null,
          durationMs: item.contentDetails?.duration ? parseIsoDuration(item.contentDetails.duration) : 0,
          artworkUrl: (thumbnails.high ?? thumbnails.medium ?? thumbnails.default)?.url ?? null,
          provider: "youtube",
          providerTrackId: item.id,
          playbackSource: "youtube-embed",
        };
      });
  }

  /** Counts one cold search against the caller's budget, or refuses with 429. */
  private async spendColdSearch(budget: QuotaBudget): Promise<void> {
    const client = this.redisService.getClient();
    const hourKey = `music:yt:budget:${budget.tracker}:${Math.floor(Date.now() / 3_600_000)}`;
    const used = await client.incr(hourKey);
    if (used === 1) await client.expire(hourKey, 3_600);
    const limit = budget.anonymous ? COLD_SEARCHES_PER_HOUR.anonymous : COLD_SEARCHES_PER_HOUR.user;
    if (used > limit) throw this.budgetSpent(budget.anonymous);

    if (budget.anonymous) {
      const dayKey = `music:yt:budget:anonymous:${new Date().toISOString().slice(0, 10)}`;
      const usedToday = await client.incr(dayKey);
      if (usedToday === 1) await client.expire(dayKey, 86_400);
      if (usedToday > ANONYMOUS_COLD_SEARCHES_PER_DAY) throw this.budgetSpent(true);
    }
  }

  private budgetSpent(anonymous: boolean): HttpException {
    return new HttpException(
      {
        success: false,
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: anonymous
            ? "Too many new searches. Sign in to search more, or paste a YouTube link."
            : "Too many new searches this hour. Try a recent search or paste a YouTube link.",
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** No key needed. oEmbed has no duration — clients read it from the player (durationMs = 0). */
  private async fetchViaOEmbed(videoId: string): Promise<Track | null> {
    const params = new URLSearchParams({ url: `https://www.youtube.com/watch?v=${videoId}`, format: "json" });
    const response = await this.request(`https://www.youtube.com/oembed?${params}`, "oembed");
    // 400/401/403/404: private, removed, or embedding disabled — not playable here.
    // A 429 is YouTube throttling us, not an answer about the video (and must not be cached as a miss).
    if (response.status >= 400 && response.status < 500 && response.status !== 429) return null;
    if (!response.ok) throw this.unavailable();

    const parsed = oEmbedSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return {
      id: `${YOUTUBE_TRACK_PREFIX}${videoId}`,
      title: parsed.data.title,
      artistId: artistIdFor(parsed.data.author_name),
      albumId: null,
      durationMs: 0,
      artworkUrl: parsed.data.thumbnail_url ?? null,
      provider: "youtube",
      providerTrackId: videoId,
      playbackSource: "youtube-embed",
    };
  }

  /**
   * One Data API call, using the first key that still has quota. Search and
   * the other endpoints run out separately (YouTube meters search queries on
   * their own), so a key spent on search still serves `videos`.
   */
  private async fetchDataApi(endpoint: "search" | "videos", params: URLSearchParams, label: string): Promise<unknown> {
    const keys = this.apiKeys;
    let spent = false;
    for (const [index, key] of keys.entries()) {
      const restKey = `${index}:${endpoint}`;
      if ((this.keyRestingUntil.get(restKey) ?? 0) > Date.now()) {
        spent = true;
        continue;
      }
      params.set("key", key);
      const response = await this.request(`https://www.googleapis.com/youtube/v3/${endpoint}?${params}`, label);
      if (response.ok) {
        this.keyRestingUntil.delete(restKey);
        return response.json();
      }
      // Status and key number only — the URL carries the API key and must never be logged.
      this.logger.warn(`YouTube ${label} request failed with HTTP ${response.status} (key #${index + 1})`);
      // The Data API answers 429 (or 403 quotaExceeded) once a key's daily quota is spent.
      if (response.status === 429 || (response.status === 403 && /quota/i.test(await response.text()))) {
        this.keyRestingUntil.set(restKey, Date.now() + KEY_REST_MS);
        spent = true;
        if (index < keys.length - 1) this.logger.warn(`YouTube key #${index + 1} is out of ${endpoint} quota — switching to key #${index + 2}`);
        continue;
      }
      throw this.unavailable();
    }
    throw spent ? this.quotaExceeded() : this.unavailable();
  }

  private async request(url: string, label: string): Promise<Response> {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error: unknown) {
      this.logger.warn(`YouTube ${label} request failed: ${error instanceof Error ? error.name : "unknown error"}`);
      throw this.unavailable();
    }
  }

  private quotaExceeded(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      success: false,
      error: {
        code: ERROR_CODES.MUSIC_PROVIDER_QUOTA_EXCEEDED,
        message: "YouTube search is used up for today. Pasting a YouTube link still works.",
      },
    });
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      success: false,
      error: {
        code: ERROR_CODES.MUSIC_PROVIDER_UNAVAILABLE,
        message: "YouTube is not reachable right now. Try again in a moment.",
      },
    });
  }
}
