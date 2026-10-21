import { useQuery } from "@tanstack/react-query";
import { lyricsApi } from "../services/lyrics-api";

const lyricsQuery = (trackId: string | undefined, enabled: boolean) => ({
  queryKey: ["lyrics", trackId],
  queryFn: () => lyricsApi.get(trackId!),
  enabled: enabled && Boolean(trackId),
  staleTime: Infinity,
  gcTime: Infinity,
  retry: 1,
  retryDelay: 5_000,
  refetchOnWindowFocus: false,
});

/** Lyrics never change for a track, so they are fetched once per session. */
export function useLyrics(trackId: string | undefined, enabled: boolean) {
  return useQuery({ ...lyricsQuery(trackId, enabled), select: (r) => r.lyrics });
}

/** The timing listeners settled on for the track (same request as the lyrics). */
export function useSharedLyricsOffset(trackId: string | undefined, enabled: boolean) {
  return useQuery({ ...lyricsQuery(trackId, enabled), select: (r) => r.sharedOffset }).data ?? null;
}
