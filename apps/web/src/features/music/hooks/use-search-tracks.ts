import { useQuery } from "@tanstack/react-query";
import { musicApi } from "../services/music-api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export function useSearchTracks(query: string) {
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  return useQuery({
    queryKey: ["music", "search", debouncedQuery],
    queryFn: () => musicApi.search(debouncedQuery),
    enabled: debouncedQuery.length > 0,
    select: (data) => data.tracks,
  });
}
