import { useQuery } from "@tanstack/react-query";
import { musicApi } from "../services/music-api";

export function useTrack(trackId: string | null | undefined) {
  return useQuery({
    queryKey: ["music", "track", trackId],
    queryFn: () => musicApi.getTrack(trackId ?? "").then((r) => r.track),
    enabled: Boolean(trackId),
    staleTime: Infinity,
  });
}
