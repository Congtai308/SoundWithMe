import { Body, Controller, Get, NotFoundException, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  artistImagesQuerySchema,
  resolveTrackSchema,
  searchTracksQuerySchema,
  type ArtistImagesQuery,
  type ResolveTrackInput,
  type SearchTracksQuery,
} from "@soundwithme/validation";
import { ERROR_CODES } from "@soundwithme/constants";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import { UserThrottlerGuard, throttleTracker } from "../../common/guards/user-throttler.guard";
import type { QuotaBudget } from "./providers/youtube-music.provider";
import { MusicService } from "./music.service";

@Controller("music")
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  /**
   * Open to signed-out visitors (the home page plays for them too), but each
   * caller gets a budget of uncached searches, since those cost YouTube quota.
   */
  @Get("search")
  @UseGuards(OptionalJwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async search(
    @Req() req: Record<string, unknown>,
    @Query(new ZodValidationPipe(searchTracksQuerySchema)) query: SearchTracksQuery,
  ) {
    const tracks = await this.musicService.search(query.q, query.limit, budgetFor(req));
    return { success: true, data: { tracks } };
  }

  /** Artist avatars for onboarding. Cold names cost YouTube quota, hence the tight limit. */
  @Get("artist-images")
  @UseGuards(OptionalJwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async artistImages(
    @Req() req: Record<string, unknown>,
    @Query(new ZodValidationPipe(artistImagesQuerySchema)) query: ArtistImagesQuery,
  ) {
    const images = await this.musicService.findArtistImages(query.names, budgetFor(req));
    return { success: true, data: { images } };
  }

  /** Makes the server call YouTube, so it is signed-in only and rate limited. */
  @Post("resolve")
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async resolve(@Body(new ZodValidationPipe(resolveTrackSchema)) body: ResolveTrackInput) {
    const track = await this.musicService.resolveUrl(body.url);
    if (!track) {
      throw new NotFoundException({
        success: false,
        error: {
          code: ERROR_CODES.TRACK_NOT_FOUND,
          message: "That link isn't a public, embeddable YouTube video.",
        },
      });
    }
    return { success: true, data: { track } };
  }
}

function budgetFor(req: Record<string, unknown>): QuotaBudget {
  const tracker = throttleTracker(req);
  return { tracker, anonymous: !tracker.startsWith("user:") };
}
