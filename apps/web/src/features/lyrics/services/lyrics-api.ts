import type { Lyrics, SharedLyricsOffset } from "@soundwithme/types";
import { apiClient } from "@/services/api-client";

export interface LyricsResponse {
  lyrics: Lyrics | null;
  /** The timing other listeners settled on for this video, if any did. */
  sharedOffset: SharedLyricsOffset | null;
}

export const lyricsApi = {
  /** Matched and cached by the API (LRCLIB); `lyrics` is null when none are known. */
  get: (trackId: string) => apiClient.get<LyricsResponse>(`/tracks/${encodeURIComponent(trackId)}/lyrics`),

  /** This listener's sync for the song; it counts toward everyone's default. */
  recordOffset: (trackId: string, offsetMs: number) =>
    apiClient.post<{ sharedOffset: SharedLyricsOffset | null }>(`/tracks/${encodeURIComponent(trackId)}/lyrics/offset`, {
      offsetMs,
    }),
};
