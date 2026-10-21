import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendsApi } from "../services/friends-api";

export const FRIENDS_KEY = ["friends"] as const;
/** Presence also refreshes live (FRIENDS_CHANGED); this is the safety net. */
const PRESENCE_REFRESH_MS = 30_000;

export function useFriends({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: FRIENDS_KEY,
    queryFn: friendsApi.overview,
    enabled,
    refetchInterval: PRESENCE_REFRESH_MS,
  });
}

export function useUserSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["friends", "search", q],
    queryFn: () => friendsApi.search(q).then((r) => r.results),
    enabled: q.length >= 2,
    staleTime: 15_000,
  });
}

function useFriendsMutation<TArg, TResult>(fn: (arg: TArg) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FRIENDS_KEY }),
  });
}

export const useSendFriendRequest = () => useFriendsMutation(friendsApi.request);
export const useAcceptFriendRequest = () => useFriendsMutation(friendsApi.accept);
export const useDismissFriendRequest = () => useFriendsMutation(friendsApi.dismiss);
export const useUnfriend = () => useFriendsMutation(friendsApi.unfriend);
