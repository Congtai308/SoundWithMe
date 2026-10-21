import type { Lyrics } from "@soundwithme/types";
import { apiClient } from "@/services/api-client";

export const lyricsApi = {
  /** Matched and cached by the API (LRCLIB); `lyrics` is null when none are known. */
  get: (trackId: string) => apiClient.get<{ lyrics: Lyrics | null }>(`/tracks/${encodeURIComponent(trackId)}/lyrics`),
};
