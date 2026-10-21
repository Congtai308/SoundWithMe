import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlaylistWithItems } from "@soundwithme/types";
import type { PlaylistInput } from "@soundwithme/validation";
import { libraryApi } from "../services/library-api";

const FAVORITE_IDS = ["library", "favorite-ids"] as const;
const FAVORITES = ["library", "favorites"] as const;
const PLAYLISTS = ["library", "playlists"] as const;

/** Liked track ids, shared by every heart button. */
export function useFavoriteIds({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: FAVORITE_IDS,
    queryFn: () => libraryApi.favoriteIds().then((r) => new Set(r.trackIds)),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useFavorites() {
  return useQuery({ queryKey: FAVORITES, queryFn: () => libraryApi.favorites().then((r) => r.items) });
}

/** Optimistic: the heart fills at once and rolls back if the server says no. */
export function useToggleLike() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ trackId, liked }: { trackId: string; liked: boolean }) =>
      liked ? libraryApi.like(trackId) : libraryApi.unlike(trackId),
    onMutate: async ({ trackId, liked }) => {
      await queryClient.cancelQueries({ queryKey: FAVORITE_IDS });
      const previous = queryClient.getQueryData<Set<string>>(FAVORITE_IDS);
      const next = new Set(previous ?? []);
      if (liked) next.add(trackId);
      else next.delete(trackId);
      queryClient.setQueryData(FAVORITE_IDS, next);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(FAVORITE_IDS, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: FAVORITES });
    },
  });
}

export function usePlaylists({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: PLAYLISTS, queryFn: () => libraryApi.playlists().then((r) => r.items), enabled });
}

export function usePlaylist(id: string | null) {
  return useQuery({
    queryKey: ["library", "playlist", id],
    queryFn: () => libraryApi.playlist(id!).then((r) => r.playlist),
    enabled: Boolean(id),
  });
}

function useStorePlaylist() {
  const queryClient = useQueryClient();
  return (playlist: PlaylistWithItems) => {
    queryClient.setQueryData(["library", "playlist", playlist.id], playlist);
    void queryClient.invalidateQueries({ queryKey: PLAYLISTS });
  };
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaylistInput) => libraryApi.createPlaylist(input).then((r) => r.playlist),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAYLISTS }),
  });
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: libraryApi.deletePlaylist,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAYLISTS }),
  });
}

export function useAddToPlaylist() {
  const store = useStorePlaylist();
  return useMutation({
    mutationFn: ({ playlistId, trackId }: { playlistId: string; trackId: string }) =>
      libraryApi.addToPlaylist(playlistId, trackId).then((r) => r.playlist),
    onSuccess: store,
  });
}

export function useRemoveFromPlaylist() {
  const store = useStorePlaylist();
  return useMutation({
    mutationFn: ({ playlistId, itemId }: { playlistId: string; itemId: string }) =>
      libraryApi.removeFromPlaylist(playlistId, itemId).then((r) => r.playlist),
    onSuccess: store,
  });
}
