import { z } from "zod";

/** Friends per account — bounds every presence and notification fan-out. */
export const MAX_FRIENDS = 500;

export const friendRequestSchema = z.object({
  username: z.string().trim().min(1).max(40),
});
export type FriendRequestInput = z.infer<typeof friendRequestSchema>;

export const userSearchQuerySchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(40),
});
export type UserSearchQuery = z.infer<typeof userSearchQuerySchema>;

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

// ---- Library ----

export const MAX_FAVORITES = 1_000;
export const MAX_PLAYLISTS = 50;
export const MAX_PLAYLIST_TRACKS = 200;

export const playlistInputSchema = z.object({
  name: z.string().trim().min(1, "Name the playlist").max(60),
  description: z.string().trim().max(200).nullable().optional(),
});
export type PlaylistInput = z.infer<typeof playlistInputSchema>;

export const updatePlaylistSchema = playlistInputSchema.partial();
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistSchema>;

export const playlistAddTrackSchema = z.object({
  trackId: z.string().trim().min(1).max(64),
});
export type PlaylistAddTrackInput = z.infer<typeof playlistAddTrackSchema>;
