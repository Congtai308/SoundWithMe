import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ERROR_CODES } from "@soundwithme/constants";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import { UserThrottlerGuard } from "../../common/guards/user-throttler.guard";
import { MusicService } from "./music.service";
import { LyricsService } from "./lyrics/lyrics.service";

/**
 * An uncached track costs a YouTube lookup and uncached lyrics up to three
 * LRCLIB searches, so both are rate limited per user (or per address for
 * signed-out visitors, whom the home page also plays for).
 */
@Controller("tracks")
@UseGuards(OptionalJwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class TracksController {
  constructor(
    private readonly musicService: MusicService,
    private readonly lyricsService: LyricsService,
  ) {}

  @Get(":id")
  async getTrack(@Param("id") id: string) {
    return { success: true, data: { track: await this.findTrack(id) } };
  }

  /** `lyrics: null` when no lyrics are known for the track. */
  @Get(":id/lyrics")
  async getLyrics(@Param("id") id: string) {
    const lyrics = await this.lyricsService.getLyrics(await this.findTrack(id));
    return { success: true, data: { lyrics } };
  }

  private async findTrack(id: string) {
    const track = await this.musicService.getTrackWithArtist(id);
    if (!track) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.TRACK_NOT_FOUND, message: "Track not found" },
      });
    }
    return track;
  }
}
