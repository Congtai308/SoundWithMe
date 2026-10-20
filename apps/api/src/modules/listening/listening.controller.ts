import { Body, Controller, Get, HttpCode, NotFoundException, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { UserThrottlerGuard } from "../../common/guards/user-throttler.guard";
import { recordListenSchema, type RecordListenInput } from "@soundwithme/validation";
import { ERROR_CODES } from "@soundwithme/constants";
import type { AuthenticatedUser } from "@soundwithme/types";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ListeningService } from "./listening.service";

@Controller("users/me")
@UseGuards(JwtAuthGuard)
export class ListeningController {
  constructor(private readonly listeningService: ListeningService) {}

  /** Sent by the client after a track has played for ~30 s. */
  @Post("listens")
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async recordListen(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(recordListenSchema)) body: RecordListenInput,
  ) {
    const recorded = await this.listeningService.recordListen(user.id, body.trackId);
    if (!recorded) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.TRACK_NOT_FOUND, message: "Track not found" },
      });
    }
    return { success: true, data: { recorded: true } };
  }

  @Get("listening-profile")
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.listeningService.getProfile(user.id);
    return { success: true, data: { profile } };
  }
}
