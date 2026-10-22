import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { clientIp, rateLimitAddress } from "../../common/utils/client-ip";
import type { AuthenticatedUser } from "@soundwithme/types";
import { lyricsOffsetSchema, type LyricsOffsetInput } from "@soundwithme/validation";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
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

  /**
   * `lyrics: null` when no lyrics are known for the track. `sharedOffset`:
   * the timing listeners settled on for this video, applied by default.
   */
  @Get(":id/lyrics")
  async getLyrics(@Param("id") id: string) {
    const track = await this.findTrack(id);
    const lyrics = await this.lyricsService.getLyrics(track);
    const sharedOffset = lyrics && lyrics.lines.length > 0 ? await this.lyricsService.sharedOffset(track, lyrics) : null;
    return { success: true, data: { lyrics, sharedOffset } };
  }

  /**
   * A listener re-synced the lyrics: their shift counts toward everyone's
   * default. Only accounts with a verified email vote: guest accounts are
   * free to make, so they could outvote everyone else.
   */
  @Post(":id/lyrics/offset")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async recordLyricsOffset(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(lyricsOffsetSchema)) body: LyricsOffsetInput,
    @Req() req: Request,
  ) {
    if (user.isGuest || !user.emailVerified) {
      throw new ForbiddenException({
        success: false,
        error: { code: ERROR_CODES.FORBIDDEN, message: "Only accounts with a verified email help tune lyrics for everyone" },
      });
    }
    const address = rateLimitAddress(clientIp(req));
    const sharedOffset = await this.lyricsService.recordOffset(await this.findTrack(id), user.id, address, body.offsetMs);
    return { success: true, data: { sharedOffset } };
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
