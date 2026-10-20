import type { AuthenticatedUser, ListeningProfile, TrackWithArtist } from "@soundwithme/types";
import { apiClient } from "@/services/api-client";

export const musicApi = {
  search: (query: string, limit = 20) => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return apiClient.get<{ tracks: TrackWithArtist[] }>(
      `/music/search?${params.toString()}`,
    );
  },

  getTrack: (trackId: string) =>
    apiClient.get<{ track: TrackWithArtist }>(`/tracks/${encodeURIComponent(trackId)}`),

  /** Turns a pasted YouTube link into a catalog track (server-side oEmbed lookup). */
  resolve: (url: string) => apiClient.post<{ track: TrackWithArtist }>("/music/resolve", { url }),

  /** Saves onboarding answers on the signed-in account. */
  savePreferences: (preferences: { genres: string[]; artists: string[] }) =>
    apiClient.put<{ user: AuthenticatedUser }>("/users/me/music-preferences", preferences),

  /** Counts a listen toward the user's taste profile (call after ~30 s of play). */
  recordListen: (trackId: string) => apiClient.post<{ recorded: boolean }>("/users/me/listens", { trackId }),

  listeningProfile: () => apiClient.get<{ profile: ListeningProfile }>("/users/me/listening-profile"),

  /** name → channel avatar URL; names without one are left out. */
  artistImages: (names: string[]) => {
    const params = new URLSearchParams({ names: names.join(",") });
    return apiClient.get<{ images: Record<string, string> }>(`/music/artist-images?${params.toString()}`);
  },
};
