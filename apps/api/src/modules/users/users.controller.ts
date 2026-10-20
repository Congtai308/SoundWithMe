import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  musicPreferencesSchema,
  updateProfileSchema,
  type MusicPreferencesInput,
  type UpdateProfileInput,
} from "@soundwithme/validation";
import { ERROR_CODES } from "@soundwithme/constants";
import type { AuthenticatedUser } from "@soundwithme/types";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get("me")
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: { user } };
  }

  @UseGuards(JwtAuthGuard)
  @Patch("me")
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    const updated = await this.usersService.updateProfile(user.id, body);
    if (!updated) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.USER_NOT_FOUND, message: "User not found" },
      });
    }
    return {
      success: true,
      data: { user: this.usersService.toAuthenticatedUser(updated) },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Put("me/music-preferences")
  async setMusicPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(musicPreferencesSchema)) body: MusicPreferencesInput,
  ) {
    const updated = await this.usersService.setMusicPreferences(user.id, body);
    if (!updated) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.USER_NOT_FOUND, message: "User not found" },
      });
    }
    return {
      success: true,
      data: { user: this.usersService.toAuthenticatedUser(updated) },
    };
  }

  // Public profile lookup — PRIVACY RULE (Master Prompt §58): only ever the
  // PublicUser projection here, never email/authMethods/full record.
  @Get(":username")
  async getPublicProfile(@Param("username") username: string) {
    const userDoc = await this.usersService.findByUsername(username);
    if (!userDoc) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.USER_NOT_FOUND, message: "User not found" },
      });
    }
    return { success: true, data: { user: this.usersService.toPublicUser(userDoc) } };
  }
}
