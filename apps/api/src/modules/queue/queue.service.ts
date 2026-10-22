import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, isValidObjectId } from "mongoose";
import type { PlaybackState, QueueItem, SkipVoteState } from "@soundwithme/types";
import { ERROR_CODES } from "@soundwithme/constants";
import { QueueItemDocument } from "../../database/mongodb/models/queue-item.schema";
import { RedisService } from "../../database/redis/redis.service";
import { RoomsService } from "../rooms/rooms.service";
import { MusicService } from "../music/music.service";
import { PlaybackService } from "../playback/playback.service";

/** Upper bound on upcoming items per room — keeps every queue read bounded. */
export const MAX_QUEUE_LENGTH = 100;
const SKIP_VOTES_TTL_SECONDS = 60 * 60 * 6;

/** Play order: most-wanted first; among equal scores, whoever was added first. */
const PLAY_ORDER = { score: -1, _id: 1 } as const;
/** A tab may reach the end of a song a little before the server's clock does. */
const ENDED_TOLERANCE_MS = 5_000;
/** Songs of unknown length can be ended by listeners only after this long. */
const ENDED_UNKNOWN_LENGTH_MS = 30_000;

interface QueueActor {
  id: string;
  displayName: string;
}

export interface SkipVoteResult {
  skip: SkipVoteState;
  /** Set when this vote passed and the room moved to the next song. */
  advanced: { state: PlaybackState; queue: QueueItem[] } | null;
}

@Injectable()
export class QueueService {
  constructor(
    @InjectModel(QueueItemDocument.name) private readonly queueModel: Model<QueueItemDocument>,
    private readonly roomsService: RoomsService,
    private readonly musicService: MusicService,
    private readonly playbackService: PlaybackService,
    private readonly redisService: RedisService,
  ) {}

  /** Upcoming tracks in play order. Caller must already be authorised for the room. */
  async listUpcoming(roomId: string): Promise<QueueItem[]> {
    const docs = await this.queueModel
      .find({ roomId, status: "queued" })
      .sort(PLAY_ORDER)
      .limit(MAX_QUEUE_LENGTH)
      .exec();
    return docs.map((doc) => this.toQueueItem(doc));
  }

  /**
   * `whoCanAddSongs` "host" limits adding to the host and DJs; "everyone"
   * (and the legacy "vote") lets any active member add.
   */
  async add(roomId: string, actor: QueueActor, trackId: string): Promise<QueueItem[]> {
    return this.addMany(roomId, actor, [trackId]);
  }

  /**
   * Appends tracks in the given order. Unknown tracks are skipped; it fails
   * only when none can be added. All-or-nothing on capacity, so a paste never
   * half-lands in a nearly full queue.
   */
  async addMany(roomId: string, actor: QueueActor, trackIds: string[]): Promise<QueueItem[]> {
    const room = await this.roomsService.getRoomForActiveMember(roomId, actor.id);
    if (room.settings.whoCanAddSongs === "host" && !this.roomsService.isHostOrDj(room, actor.id)) {
      throw new ForbiddenException({
        success: false,
        error: { code: ERROR_CODES.NOT_ROOM_HOST, message: "Only the host and DJs can add songs in this room" },
      });
    }

    const upcoming = await this.queueModel.countDocuments({ roomId, status: "queued" }).exec();
    if (upcoming + trackIds.length > MAX_QUEUE_LENGTH) {
      const space = MAX_QUEUE_LENGTH - upcoming;
      throw new ConflictException({
        success: false,
        error: {
          code: ERROR_CODES.QUEUE_FULL,
          message:
            space > 0
              ? `Only ${space} more ${space === 1 ? "song fits" : "songs fit"} in the queue (${MAX_QUEUE_LENGTH} max)`
              : `The queue is full (${MAX_QUEUE_LENGTH} songs)`,
        },
      });
    }

    // Sequential: keeps provider lookups gentle and the order obvious.
    const tracks = [];
    for (const trackId of trackIds) {
      const track = await this.musicService.getTrackWithArtist(trackId);
      if (track) tracks.push(track);
    }
    if (tracks.length === 0) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.TRACK_NOT_FOUND, message: "Track not found" },
      });
    }

    // insertMany assigns ObjectIds in array order, which is the tiebreak among equal scores.
    await this.queueModel.insertMany(
      tracks.map((track) => ({
        roomId,
        trackId: track.id,
        track: {
          title: track.title,
          artistName: track.artistName,
          artworkUrl: track.artworkUrl,
          durationMs: track.durationMs,
        },
        addedBy: actor.id,
        addedByName: actor.displayName,
      })),
      { ordered: true },
    );
    return this.listUpcoming(roomId);
  }

  /** The host and DJs can remove anything; everyone else only what they added themselves. */
  async remove(roomId: string, actorId: string, queueItemId: string): Promise<QueueItem[]> {
    const room = await this.roomsService.getRoomForActiveMember(roomId, actorId);
    const item = await this.findQueued(roomId, queueItemId);
    if (!this.roomsService.isHostOrDj(room, actorId) && item.addedBy !== actorId) {
      throw new ForbiddenException({
        success: false,
        error: { code: ERROR_CODES.FORBIDDEN, message: "You can only remove songs you added" },
      });
    }

    item.status = "removed";
    await item.save();
    return this.listUpcoming(roomId);
  }

  /**
   * One vote per member per song: 1 = sooner, -1 = later, 0 = take it back.
   * Done as one pipeline update, so concurrent votes never lose each other
   * and the score always matches the voter lists.
   */
  async vote(roomId: string, actorId: string, queueItemId: string, value: 1 | 0 | -1): Promise<QueueItem[]> {
    await this.roomsService.getRoomForActiveMember(roomId, actorId);
    const item = await this.findQueued(roomId, queueItemId);
    const without = (field: "upvotes" | "downvotes") => ({ $setDifference: [{ $ifNull: [`$${field}`, []] }, [actorId]] });
    const withVote = (field: "upvotes" | "downvotes") => ({ $setUnion: [{ $ifNull: [`$${field}`, []] }, [actorId]] });
    await this.queueModel
      .updateOne({ _id: item._id, status: "queued" }, [
        {
          $set: {
            upvotes: value === 1 ? withVote("upvotes") : without("upvotes"),
            downvotes: value === -1 ? withVote("downvotes") : without("downvotes"),
          },
        },
        { $set: { score: { $subtract: [{ $size: "$upvotes" }, { $size: "$downvotes" }] } } },
      ])
      .exec();
    return this.listUpcoming(roomId);
  }

  /**
   * Starts the next queued track — only if playback is still at `fromVersion`.
   * Every client sends this when a track ends (`ended`); the compare-and-set
   * in PlaybackService lets exactly one of them through, and only that one
   * consumes the queue item. Returns null when the request was stale.
   * `actorId` null: the room advances itself (a skip vote passed).
   *
   * Skipping needs playback control. `ended` doesn't — listeners keep the
   * room going when the host is away — but then the server checks against
   * its own clock that the song really is over.
   */
  async playNext(
    roomId: string,
    actorId: string | null,
    fromVersion: number,
    ended = false,
  ): Promise<{ state: PlaybackState; queue: QueueItem[] } | null> {
    let actor = actorId;
    if (ended && actorId !== null) {
      const room = await this.roomsService.getRoomForActiveMember(roomId, actorId);
      if (!this.roomsService.canControlPlayback(room, actorId)) {
        if (!(await this.hasEnded(roomId, fromVersion))) return null;
        actor = null;
      }
    }

    const next = await this.queueModel.findOne({ roomId, status: "queued" }).sort(PLAY_ORDER).exec();
    if (!next) {
      throw new ConflictException({
        success: false,
        error: { code: ERROR_CODES.QUEUE_EMPTY, message: "The queue is empty" },
      });
    }

    const state = await this.playbackService.changeTrackIfCurrent(roomId, actor, next.trackId, fromVersion);
    if (!state) return null;

    await this.queueModel.updateOne({ _id: next._id, status: "queued" }, { status: "played" }).exec();
    return { state, queue: await this.listUpcoming(roomId) };
  }

  /**
   * Whether the room should move to its next song by itself: nothing has
   * played yet, or the current song is over by the server's clock. With the
   * version to advance from (0 = no playback yet).
   */
  async needsNextSong(roomId: string): Promise<{ needed: boolean; version: number }> {
    const state = await this.playbackService.getPlaybackState(roomId);
    if (!state) return { needed: true, version: 0 };
    return { needed: await this.hasEnded(roomId, state.version), version: state.version };
  }

  /** Songs a room played or queued lately, newest first. */
  async recentTrackIds(roomId: string, limit: number): Promise<string[]> {
    const docs = await this.queueModel.find({ roomId }).sort({ _id: -1 }).limit(limit).select({ trackId: 1 }).exec();
    return docs.map((doc) => doc.trackId);
  }

  async upcomingCount(roomId: string): Promise<number> {
    return this.queueModel.countDocuments({ roomId, status: "queued" }).exec();
  }

  /**
   * Whether the song at `fromVersion` has played to its end by the server's
   * clock. Songs without a known length (some YouTube links) count as over
   * after ENDED_UNKNOWN_LENGTH_MS, so a listener can't skip one right away.
   */
  private async hasEnded(roomId: string, fromVersion: number): Promise<boolean> {
    const state = await this.playbackService.getPlaybackState(roomId);
    if (!state || state.version !== fromVersion || !state.isPlaying) return false;
    const playedMs = state.positionMs + (Date.now() - state.serverTimestamp) * state.speed;
    const track = await this.musicService.getTrack(state.trackId);
    const durationMs = track?.durationMs ?? 0;
    return durationMs > 0 ? playedMs >= durationMs - ENDED_TOLERANCE_MS : playedMs >= ENDED_UNKNOWN_LENGTH_MS;
  }

  /**
   * Vote to skip the current song. When half the people connected (rounded
   * up) want it gone, the room moves to the next queued song — no host
   * needed. `listenerCount`: distinct users connected to the room now.
   */
  async voteSkip(roomId: string, actorId: string, vote: boolean, listenerCount: number): Promise<SkipVoteResult> {
    await this.roomsService.getRoomForActiveMember(roomId, actorId);
    const state = await this.playbackService.getPlaybackState(roomId);
    if (!state) {
      throw new ConflictException({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Nothing is playing" },
      });
    }

    const key = this.skipKey(roomId, state.trackId);
    const redis = this.redisService.getClient();
    if (vote) await redis.multi().sadd(key, actorId).expire(key, SKIP_VOTES_TTL_SECONDS).exec();
    else await redis.srem(key, actorId);

    const skip = await this.skipState(roomId, state.trackId, listenerCount);
    if (!vote || skip.voterIds.length < skip.needed) return { skip, advanced: null };

    const hasNext = (await this.queueModel.exists({ roomId, status: "queued" }).exec()) !== null;
    if (!hasNext) return { skip, advanced: null };
    const advanced = await this.playNext(roomId, null, state.version);
    return { skip, advanced };
  }

  async skipState(roomId: string, trackId: string, listenerCount: number): Promise<SkipVoteState> {
    const voterIds = await this.redisService.getClient().smembers(this.skipKey(roomId, trackId));
    return { roomId, trackId, voterIds, needed: Math.max(1, Math.ceil(listenerCount / 2)) };
  }

  /** A new song starts with no skip votes. */
  async clearSkipVotes(roomId: string, trackId: string): Promise<void> {
    await this.redisService.getClient().del(this.skipKey(roomId, trackId));
  }

  private async findQueued(roomId: string, queueItemId: string): Promise<QueueItemDocument> {
    const item = isValidObjectId(queueItemId)
      ? await this.queueModel.findOne({ _id: queueItemId, roomId, status: "queued" }).exec()
      : null;
    if (!item) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.QUEUE_ITEM_NOT_FOUND, message: "That song is no longer in the queue" },
      });
    }
    return item;
  }

  private skipKey(roomId: string, trackId: string): string {
    return `room:${roomId}:skip:${trackId}`;
  }

  private toQueueItem(doc: QueueItemDocument): QueueItem {
    const upvotes = doc.upvotes ?? [];
    const downvotes = doc.downvotes ?? [];
    return {
      id: doc.id,
      roomId: doc.roomId,
      trackId: doc.trackId,
      track: {
        title: doc.track.title,
        artistName: doc.track.artistName,
        artworkUrl: doc.track.artworkUrl ?? null,
        durationMs: doc.track.durationMs,
      },
      addedBy: doc.addedBy,
      addedByName: doc.addedByName,
      position: doc.id,
      upvotes,
      downvotes,
      score: upvotes.length - downvotes.length,
      status: doc.status,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}
