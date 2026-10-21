import { useQuery } from "@tanstack/react-query";
import { lyricsApi } from "../services/lyrics-api";

/** Lyrics never change for a track, so they are fetched once per session. */
export function useLyrics(trackId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["lyrics", trackId],
    queryFn: () => lyricsApi.get(trackId!).then((r) => r.lyrics),
    enabled: enabled && Boolean(trackId),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    retryDelay: 5_000,
    refetchOnWindowFocus: false,
  });
}
