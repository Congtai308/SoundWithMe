import type { FavoriteTrack, Playlist, PlaylistWithItems } from "@soundwithme/types";
import type { PlaylistInput, UpdatePlaylistInput } from "@soundwithme/validation";
import { apiClient } from "@/services/api-client";

export const libraryApi = {
  favorites: () => apiClient.get<{ items: FavoriteTrack[] }>("/library/favorites"),
  favoriteIds: () => apiClient.get<{ trackIds: string[] }>("/library/favorites/ids"),
  like: (trackId: string) => apiClient.put<{ trackId: string; liked: boolean }>(`/library/favorites/${encodeURIComponent(trackId)}`),
  unlike: (trackId: string) => apiClient.delete<{ trackId: string; liked: boolean }>(`/library/favorites/${encodeURIComponent(trackId)}`),

  playlists: () => apiClient.get<{ items: Playlist[] }>("/library/playlists"),
  playlist: (id: string) => apiClient.get<{ playlist: PlaylistWithItems }>(`/library/playlists/${id}`),
  createPlaylist: (input: PlaylistInput) => apiClient.post<{ playlist: Playlist }>("/library/playlists", input),
  updatePlaylist: (id: string, input: UpdatePlaylistInput) => apiClient.patch<{ playlist: Playlist }>(`/library/playlists/${id}`, input),
  deletePlaylist: (id: string) => apiClient.delete<{ status: string }>(`/library/playlists/${id}`),
  addToPlaylist: (id: string, trackId: string) =>
    apiClient.post<{ playlist: PlaylistWithItems }>(`/library/playlists/${id}/tracks`, { trackId }),
  removeFromPlaylist: (id: string, itemId: string) =>
    apiClient.delete<{ playlist: PlaylistWithItems }>(`/library/playlists/${id}/tracks/${itemId}`),
};
