import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { Lyrics, SharedLyricsOffset, TrackWithArtist } from "@soundwithme/types";
import { ERROR_CODES } from "@soundwithme/constants";
import { z } from "zod";
import { createHash } from "crypto";
import { RedisService } from "../../../database/redis/redis.service";
import { findBestLyrics, parseLrc, type LrclibRecord } from "./lrc";

const LRCLIB_SEARCH_URL = "https://lrclib.net/api/search";
const REQUEST_TIMEOUT_MS = 8_000;
const HIT_TTL_SECONDS = 60 * 60 * 24 * 30;
/** "No lyrics" is retried sooner — LRCLIB is community-run and grows daily. */
const MISS_TTL_SECONDS = 60 * 60 * 24;
const USER_AGENT = "SoundWithMe (https://github.com/Congtai308/SoundWithMe)";
/** Shared offsets fade out if nobody re-syncs the song for this long. */
const OFFSET_TTL_SECONDS = 60 * 60 * 24 * 90;
/** One vote per listener, the latest this many count: a new vote pushes out the oldest. */
const MAX_OFFSET_VOTES = 500;
/**
 * Listeners who may vote on one song from one network address. Email
 * aliases make many verified accounts cheap for one person; addresses
 * aren't, so this is what keeps one person from outvoting a song's listeners.
 */
const VOTERS_PER_ADDRESS = 2;
/**
 * Records a vote and keeps only the newest MAX votes, in one step.
 * KEYS[1] = hash userId → offset, KEYS[2] = sorted set userId → time voted,
 * KEYS[3] = set of the voters seen from this address.
 * ARGV = userId, offsetMs, now, max, ttl seconds, voters per address.
 * Returns 0 when the address already has its voters (the vote isn't counted).
 */
const RECORD_VOTE_SCRIPT = `
if redis.call("SISMEMBER", KEYS[3], ARGV[1]) == 0 and redis.call("SCARD", KEYS[3]) >= tonumber(ARGV[6]) then
  return 0
end
redis.call("SADD", KEYS[3], ARGV[1])
redis.call("EXPIRE", KEYS[3], ARGV[5])
redis.call("HSET", KEYS[1], ARGV[1], ARGV[2])
redis.call("ZADD", KEYS[2], ARGV[3], ARGV[1])
while redis.call("ZCARD", KEYS[2]) > tonumber(ARGV[4]) do
  local oldest = redis.call("ZPOPMIN", KEYS[2])
  redis.call("HDEL", KEYS[1], oldest[1])
end
redis.call("EXPIRE", KEYS[1], ARGV[5])
redis.call("EXPIRE", KEYS[2], ARGV[5])
return 1
`;

/**
 * LRCLIB is writable by anyone, so its records are untrusted: oversized ones
 * are dropped before the title matching (regexes) ever sees them.
 */
const lrclibRecordSchema = z.object({
  trackName: z.string().max(300),
  artistName: z.string().max(300),
  duration: z.number(),
  instrumental: z.boolean(),
  plainLyrics: z.string().max(100_000).nullable(),
  syncedLyrics: z.string().max(100_000).nullable(),
});

/**
 * Synced lyrics from LRCLIB, a free community lyrics database. Fetched
 * server-side so a whole room shares one cached lookup: LRCLIB rate-limits
 * per IP, and its 429s carry no CORS headers, so browsers calling it directly
 * just see an opaque network error.
 */
@Injectable()
export class LyricsService {
  private readonly logger = new Logger(LyricsService.name);
  /** Everyone in a room asks at the same moment when the song changes. */
  private readonly inFlight = new Map<string, Promise<Lyrics | null>>();

  constructor(private readonly redisService: RedisService) {}

  async getLyrics(track: TrackWithArtist): Promise<Lyrics | null> {
    // v2: matching checks the song name and artist (v1 could cache another song's lyrics).
    const cacheKey = `lyrics:v2:${track.id}`;
    const cached = await this.redisService.getClient().get(cacheKey);
    if (cached !== null) return cached === "" ? null : (JSON.parse(cached) as Lyrics);

    const pending = this.inFlight.get(track.id);
    if (pending) return pending;

    const lookup = this.lookup(track)
      .then(async (lyrics) => {
        await this.redisService
          .getClient()
          .set(cacheKey, lyrics ? JSON.stringify(lyrics) : "", "EX", lyrics ? HIT_TTL_SECONDS : MISS_TTL_SECONDS);
        return lyrics;
      })
      .finally(() => this.inFlight.delete(track.id));
    this.inFlight.set(track.id, lookup);
    return lookup;
  }

  /**
   * The timing shift listeners settled on for this song's lyrics: the median
   * of their latest choices, so one odd vote can't move it. Tied to these
   * exact lyrics: if the lyrics found for the song change, so does the key.
   */
  async sharedOffset(track: TrackWithArtist, lyrics: Lyrics): Promise<SharedLyricsOffset | null> {
    const votes = (await this.redisService.getClient().hvals(this.offsetKey(track, lyrics)))
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (votes.length === 0) return null;
    const middle = Math.floor(votes.length / 2);
    const median = votes.length % 2 ? votes[middle]! : (votes[middle - 1]! + votes[middle]!) / 2;
    return { offsetMs: Math.round(median / 100) * 100, votes: votes.length };
  }

  /**
   * A listener's own sync for a song (their latest one counts; callers check
   * who may vote). `address`: where it came from (see rateLimitAddress).
   */
  async recordOffset(
    track: TrackWithArtist,
    userId: string,
    address: string,
    offsetMs: number,
  ): Promise<SharedLyricsOffset | null> {
    const lyrics = await this.getLyrics(track);
    if (!lyrics || lyrics.lines.length === 0) return null;
    const key = this.offsetKey(track, lyrics);
    await this.redisService
      .getClient()
      .eval(
        RECORD_VOTE_SCRIPT,
        3,
        key,
        `${key}:voted-at`,
        `${key}:from:${address}`,
        userId,
        String(offsetMs),
        String(Date.now()),
        String(MAX_OFFSET_VOTES),
        String(OFFSET_TTL_SECONDS),
        String(VOTERS_PER_ADDRESS),
      );
    return this.sharedOffset(track, lyrics);
  }

  private offsetKey(track: TrackWithArtist, lyrics: Lyrics): string {
    const fingerprint = createHash("sha1")
      .update(lyrics.lines.map((line) => `${line.timeMs} ${line.text}`).join("\n"))
      .digest("hex")
      .slice(0, 12);
    return `lyrics:offsets:${track.id}:${fingerprint}`;
  }

  private async lookup(track: TrackWithArtist): Promise<Lyrics | null> {
    let failure: unknown = null;
    const best = await findBestLyrics(
      { title: track.title, artistName: track.artistName, durationMs: track.durationMs },
      // A failed query doesn't stop the others: a later one may still find the song.
      (q) =>
        this.search(q).catch((error: unknown) => {
          failure = error;
          return [];
        }),
    );
    // "No lyrics" gets cached for a day: only say so when every query was answered.
    if (!best && failure) throw failure;
    if (!best) return null;
    return {
      trackName: best.trackName,
      artistName: best.artistName,
      durationMs: Math.round(best.duration * 1000),
      lines: best.syncedLyrics ? parseLrc(best.syncedLyrics) : [],
      plain: best.plainLyrics,
    };
  }

  private async search(q: string): Promise<LrclibRecord[]> {
    let res: Response;
    try {
      res = await fetch(`${LRCLIB_SEARCH_URL}?${new URLSearchParams({ q })}`, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error: unknown) {
      this.logger.warn(`LRCLIB unreachable: ${error instanceof Error ? error.message : String(error)}`);
      throw this.unavailable();
    }
    if (!res.ok) {
      this.logger.warn(`LRCLIB search failed: ${res.status}`);
      throw this.unavailable();
    }
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return [];
    return body.flatMap((item): LrclibRecord[] => {
      const parsed = lrclibRecordSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  }

  /** Not cached as a miss: the next request tries again. */
  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      success: false,
      error: { code: ERROR_CODES.LYRICS_UNAVAILABLE, message: "Lyrics service is busy — try again in a minute." },
    });
  }
}
