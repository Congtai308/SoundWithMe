import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  playlistAddTrackSchema,
  playlistInputSchema,
  updatePlaylistSchema,
  type PlaylistAddTrackInput,
  type PlaylistInput,
  type UpdatePlaylistInput,
} from "@soundwithme/validation";
import type { AuthenticatedUser } from "@soundwithme/types";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserThrottlerGuard } from "../../common/guards/user-throttler.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { LibraryService } from "./library.service";

/** Saving a song looks the track up in the catalog, so writes are rate limited per user. */
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller("library")
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get("favorites")
  async favorites(@CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: { items: await this.libraryService.listFavorites(user.id) } };
  }

  @Get("favorites/ids")
  async favoriteIds(@CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: { trackIds: await this.libraryService.favoriteIds(user.id) } };
  }

  @Put("favorites/:trackId")
  async like(@CurrentUser() user: AuthenticatedUser, @Param("trackId") trackId: string) {
    await this.libraryService.addFavorite(user.id, trackId);
    return { success: true, data: { trackId, liked: true } };
  }

  @Delete("favorites/:trackId")
  async unlike(@CurrentUser() user: AuthenticatedUser, @Param("trackId") trackId: string) {
    await this.libraryService.removeFavorite(user.id, trackId);
    return { success: true, data: { trackId, liked: false } };
  }

  @Get("playlists")
  async playlists(@CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: { items: await this.libraryService.listPlaylists(user.id) } };
  }

  @Post("playlists")
  async createPlaylist(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(playlistInputSchema)) body: PlaylistInput,
  ) {
    return { success: true, data: { playlist: await this.libraryService.createPlaylist(user.id, body) } };
  }

  @Get("playlists/:id")
  async playlist(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: { playlist: await this.libraryService.getPlaylist(user.id, id) } };
  }

  @Patch("playlists/:id")
  async updatePlaylist(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePlaylistSchema)) body: UpdatePlaylistInput,
  ) {
    return { success: true, data: { playlist: await this.libraryService.updatePlaylist(user.id, id, body) } };
  }

  @Delete("playlists/:id")
  async deletePlaylist(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    await this.libraryService.deletePlaylist(user.id, id);
    return { success: true, data: { status: "ok" } };
  }

  @Post("playlists/:id/tracks")
  async addTrack(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(playlistAddTrackSchema)) body: PlaylistAddTrackInput,
  ) {
    return { success: true, data: { playlist: await this.libraryService.addToPlaylist(user.id, id, body.trackId) } };
  }

  @Delete("playlists/:id/tracks/:itemId")
  async removeTrack(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("itemId") itemId: string) {
    return { success: true, data: { playlist: await this.libraryService.removeFromPlaylist(user.id, id, itemId) } };
  }
}
