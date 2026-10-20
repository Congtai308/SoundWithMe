import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { ListeningProfile } from "@soundwithme/types";
import { ListeningTally, UserDocument } from "../../database/mongodb/models/user.schema";
import { RedisService } from "../../database/redis/redis.service";
import { MusicService } from "../music/music.service";
import { artistFromChannel, classifyGenres } from "./genre-classifier";

/** The same track only counts once per user in this window (replays, page reloads). */
const DEDUPE_WINDOW_SECONDS = 30 * 60;
/** Keep the tallies small: the least relevant entries fall off. */
const MAX_TALLIES = 40;
/** A genre/artist only counts as a habit after this many listens. */
const MIN_PROFILE_COUNT = 2;
const PROFILE_SIZE = 5;

function bump(tallies: ListeningTally[], keys: string[], now: Date): ListeningTally[] {
  const next = tallies.map((t) => ({ key: t.key, count: t.count, lastAt: t.lastAt }));
  for (const key of keys) {
    const existing = next.find((t) => t.key.toLowerCase() === key.toLowerCase());
    if (existing) {
      existing.count += 1;
      existing.lastAt = now;
    } else {
      next.push({ key, count: 1, lastAt: now });
    }
  }
  return next
    .sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, MAX_TALLIES);
}

function top(tallies: ListeningTally[]): ListeningTally[] {
  return tallies.filter((t) => t.count >= MIN_PROFILE_COUNT).slice(0, PROFILE_SIZE);
}

@Injectable()
export class ListeningService {
  constructor(
    @InjectModel(UserDocument.name) private readonly userModel: Model<UserDocument>,
    private readonly musicService: MusicService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Counts one listen. Genres and artist are derived here from the catalog,
   * never taken from the client. Returns false for unknown tracks.
   */
  async recordListen(userId: string, trackId: string): Promise<boolean> {
    const track = await this.musicService.getTrackWithArtist(trackId);
    if (!track) return false;

    const fresh = await this.redisService
      .getClient()
      .set(`listen:${userId}:${track.id}`, "1", "EX", DEDUPE_WINDOW_SECONDS, "NX");
    if (fresh === null) return true;

    const user = await this.userModel.findById(userId).select("listeningStats").exec();
    if (!user) return false;

    const now = new Date();
    const stats = user.listeningStats ?? { genres: [], artists: [] };
    const artist = artistFromChannel(track.artistName);
    await this.userModel
      .updateOne(
        { _id: userId },
        {
          $set: {
            listeningStats: {
              genres: bump(stats.genres, classifyGenres(track.title, track.artistName), now),
              artists: bump(stats.artists, artist ? [artist] : [], now),
            },
          },
        },
      )
      .exec();
    return true;
  }

  async getProfile(userId: string): Promise<ListeningProfile> {
    const user = await this.userModel.findById(userId).select("listeningStats").exec();
    const stats = user?.listeningStats ?? { genres: [], artists: [] };
    return {
      genres: top(stats.genres).map((t) => ({ slug: t.key, count: t.count })),
      artists: top(stats.artists).map((t) => ({ name: t.key, count: t.count })),
    };
  }
}
