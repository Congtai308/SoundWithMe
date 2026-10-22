import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { PlaybackState, Track } from "@soundwithme/types";
import { playbackStateSchema, playbackStateUpdateSchema } from "@soundwithme/validation";
import { ERROR_CODES } from "@soundwithme/constants";
import { RedisService } from "../../database/redis/redis.service";
import { AppEventsService } from "../../common/events/app-events.service";
import { RoomsService } from "../rooms/rooms.service";
import { MusicService } from "../music/music.service";

const PLAYBACK_STATE_TTL_SECONDS = 60 * 60 * 24;
/** Redis sorted set: roomId → epoch ms when its song ends by the server's clock (playing rooms only). */
export const PLAYBACK_ENDS_KEY = "playback:ends";
const DEFAULT_SPEED = 1;

/**
 * Read-modify-write runs inside Redis so concurrent writers to the same room
 * can never read the same version and both write version + 1.
 *
 * KEYS[1] = playback key
 * ARGV[1] = JSON patch (already validated, only allowed fields)
 * ARGV[2] = JSON initial state used when the key does not exist yet
 * ARGV[3] = server timestamp (epoch ms)
 * ARGV[4] = TTL seconds
 * ARGV[5] = expected current version ("0" = the room has no state yet), or ""
 *           to write unconditionally
 *
 * Returns the stored JSON; nil when no state exists and the patch has no
 * trackId (playback cannot start without a track); or the string "STALE"
 * when ARGV[5] is set and the current version differs (compare-and-set).
 */
const UPSERT_PLAYBACK_STATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local patch = cjson.decode(ARGV[1])
local state
if raw then
  state = cjson.decode(raw)
  if ARGV[5] ~= "" and state.version ~= tonumber(ARGV[5]) then
    return "STALE"
  end
  state.version = state.version + 1
else
  if ARGV[5] ~= "" and tonumber(ARGV[5]) ~= 0 then
    return "STALE"
  end
  if patch.trackId == nil then
    return false
  end
  state = cjson.decode(ARGV[2])
  state.version = 1
end
for key, value in pairs(patch) do
  state[key] = value
end
state.serverTimestamp = tonumber(ARGV[3])
local encoded = cjson.encode(state)
redis.call('SET', KEYS[1], encoded, 'EX', tonumber(ARGV[4]))
return encoded
`;

@Injectable()
export class PlaybackService {
  constructor(
    private readonly redisService: RedisService,
    private readonly roomsService: RoomsService,
    private readonly musicService: MusicService,
    private readonly events: AppEventsService,
  ) {}

  async play(roomId: string, userId: string, positionMs: number): Promise<PlaybackState> {
    await this.verifyCanControlPlayback(roomId, userId);
    return this.initOrUpdatePlaybackState(roomId, { isPlaying: true, positionMs });
  }

  async pause(roomId: string, userId: string, positionMs: number): Promise<PlaybackState> {
    await this.verifyCanControlPlayback(roomId, userId);
    return this.initOrUpdatePlaybackState(roomId, { isPlaying: false, positionMs });
  }

  async seek(roomId: string, userId: string, positionMs: number): Promise<PlaybackState> {
    await this.verifyCanControlPlayback(roomId, userId);
    return this.initOrUpdatePlaybackState(roomId, { positionMs });
  }

  /**
   * Starts `trackId` from the beginning. The track must exist in the
   * catalog, and the room's currentTrackId is persisted to MongoDB — the one
   * playback change that is durable (track changes only, never ticks).
   */
  async changeTrack(roomId: string, userId: string, trackId: string): Promise<PlaybackState> {
    await this.verifyCanControlPlayback(roomId, userId);
    const track = await this.requirePlayableTrack(trackId);

    const state = await this.initOrUpdatePlaybackState(roomId, {
      trackId: track.id,
      positionMs: 0,
      isPlaying: true,
    });
    await this.roomsService.setCurrentTrack(roomId, track.id);
    this.events.emit("room.trackChanged", { roomId, trackId: track.id });
    return state;
  }

  /** Current state for a listener who is allowed to be in the room. */
  async getStateForMember(roomId: string, userId: string): Promise<PlaybackState | null> {
    await this.roomsService.getRoomForActiveMember(roomId, userId);
    return this.getPlaybackState(roomId);
  }

  async getPlaybackState(roomId: string): Promise<PlaybackState | null> {
    const raw = await this.redisService.getClient().get(this.playbackKey(roomId));
    return raw === null ? null : this.parseStoredState(roomId, raw);
  }

  /**
   * Applies `update` to the room's playback state, creating it with
   * version 1 if it does not exist. Only trackId / isPlaying / positionMs /
   * speed are taken from `update`; roomId, version and serverTimestamp are
   * always decided here.
   */
  async initOrUpdatePlaybackState(
    roomId: string,
    update: Partial<PlaybackState>,
  ): Promise<PlaybackState> {
    const result = await this.writeState(roomId, update, null);
    if (result === "stale") {
      // Unreachable without an expected version; kept explicit for the type.
      throw this.corruptedStateError(roomId);
    }
    return result;
  }

  /**
   * Like changeTrack, but only if the room is still at `expectedVersion`.
   * Returns null when another client already moved playback on — this is
   * what makes "advance on track end" safe to send from every client.
   * `userId` null: the room itself is advancing (a passed skip vote), so no
   * one's permission is checked.
   */
  async changeTrackIfCurrent(
    roomId: string,
    userId: string | null,
    trackId: string,
    expectedVersion: number,
  ): Promise<PlaybackState | null> {
    if (userId !== null) await this.verifyCanControlPlayback(roomId, userId);
    const track = await this.requirePlayableTrack(trackId);
    const result = await this.writeState(
      roomId,
      { trackId: track.id, positionMs: 0, isPlaying: true },
      expectedVersion,
    );
    if (result === "stale") return null;
    await this.roomsService.setCurrentTrack(roomId, track.id);
    this.events.emit("room.trackChanged", { roomId, trackId: track.id });
    return result;
  }

  private async writeState(
    roomId: string,
    update: Partial<PlaybackState>,
    expectedVersion: number | null,
  ): Promise<PlaybackState | "stale"> {
    const parsed = playbackStateUpdateSchema.safeParse(update);
    if (!parsed.success) {
      throw new BadRequestException({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: parsed.error.issues[0]?.message ?? "Invalid playback update",
        },
      });
    }

    const initialState = {
      roomId,
      isPlaying: false,
      positionMs: 0,
      speed: DEFAULT_SPEED,
    };

    const result: unknown = await this.redisService
      .getClient()
      .eval(
        UPSERT_PLAYBACK_STATE_SCRIPT,
        1,
        this.playbackKey(roomId),
        JSON.stringify(parsed.data),
        JSON.stringify(initialState),
        String(Date.now()),
        String(PLAYBACK_STATE_TTL_SECONDS),
        expectedVersion === null ? "" : String(expectedVersion),
      );

    if (result === "STALE") return "stale";
    if (result === null) {
      throw new BadRequestException({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "A trackId is required to start playback in this room",
        },
      });
    }
    if (typeof result !== "string") {
      throw this.corruptedStateError(roomId);
    }

    const state = this.parseStoredState(roomId, result);
    await this.scheduleEnd(state);
    return state;
  }

  /**
   * Notes when the song now playing ends (QueueGateway moves the room on
   * then, whoever is or isn't connected). Paused rooms and songs of unknown
   * length have no end.
   */
  private async scheduleEnd(state: PlaybackState): Promise<void> {
    const redis = this.redisService.getClient();
    const durationMs = state.isPlaying ? ((await this.musicService.getTrack(state.trackId))?.durationMs ?? 0) : 0;
    if (durationMs <= 0 || state.speed <= 0) {
      await redis.zrem(PLAYBACK_ENDS_KEY, state.roomId);
      return;
    }
    const endsAt = state.serverTimestamp + Math.max(0, durationMs - state.positionMs) / state.speed;
    await redis.zadd(PLAYBACK_ENDS_KEY, Math.round(endsAt), state.roomId);
  }

  /** Rooms whose song should have ended by `now`. */
  async roomsDueToEnd(now: number): Promise<string[]> {
    return this.redisService.getClient().zrangebyscore(PLAYBACK_ENDS_KEY, 0, now);
  }

  /** Forgets a room's end (it moved on, or has nothing left to play). */
  async unscheduleEnd(roomId: string): Promise<void> {
    await this.redisService.getClient().zrem(PLAYBACK_ENDS_KEY, roomId);
  }

  /** Drops a room's playback state (the room ended). */
  async clearPlaybackState(roomId: string): Promise<void> {
    await this.redisService.getClient().multi().del(this.playbackKey(roomId)).zrem(PLAYBACK_ENDS_KEY, roomId).exec();
  }

  /**
   * Resolves to true when `userId` may control playback in `roomId`;
   * otherwise throws. Permissions are read from the stored room, never from
   * the caller: the host, a DJ, or any member when the room allows everyone.
   */
  async verifyCanControlPlayback(roomId: string, userId: string): Promise<boolean> {
    // Throws ROOM_CLOSED / NOT_ROOM_MEMBER for closed rooms and non-members.
    const room = await this.roomsService.getRoomForActiveMember(roomId, userId);
    if (this.roomsService.canControlPlayback(room, userId)) return true;
    throw new ForbiddenException({
      success: false,
      error: {
        code: ERROR_CODES.NOT_ROOM_HOST,
        message: "Only the host and DJs can control playback in this room",
      },
    });
  }

  private async requirePlayableTrack(trackId: string): Promise<Track> {
    const track = await this.musicService.getTrack(trackId);
    if (!track) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.TRACK_NOT_FOUND, message: "Track not found" },
      });
    }
    return track;
  }

  private playbackKey(roomId: string): string {
    return `room:${roomId}:playback`;
  }

  private parseStoredState(roomId: string, raw: string): PlaybackState {
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      throw this.corruptedStateError(roomId);
    }

    const parsed = playbackStateSchema.safeParse(decoded);
    if (!parsed.success || parsed.data.roomId !== roomId) {
      throw this.corruptedStateError(roomId);
    }
    return parsed.data;
  }

  private corruptedStateError(roomId: string): InternalServerErrorException {
    return new InternalServerErrorException({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: `Stored playback state for room ${roomId} is invalid`,
      },
    });
  }
}
