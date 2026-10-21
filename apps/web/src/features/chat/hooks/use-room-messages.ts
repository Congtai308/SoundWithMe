import { useInfiniteQuery, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { ChatMessage } from "@soundwithme/types";
import { chatApi, type ChatPage } from "../services/chat-api";

export const roomMessagesKey = (roomId: string) => ["rooms", roomId, "messages"] as const;

/** Chat history (server state). Pages are newest-first; live messages are merged in by appendLiveMessage. */
export function useRoomMessages(roomId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: roomMessagesKey(roomId),
    queryFn: ({ pageParam }) => chatApi.history(roomId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: Infinity, // kept fresh by socket pushes, not refetching
  });
}

/** Puts a socket-delivered message at the top of the cached history (deduplicated by id). */
export function appendLiveMessage(queryClient: QueryClient, message: ChatMessage): void {
  queryClient.setQueryData<InfiniteData<ChatPage, string | undefined>>(roomMessagesKey(message.roomId), (data) => {
    if (!data) return data;
    if (data.pages.some((page) => page.items.some((m) => m.id === message.id))) return data;
    const [first, ...rest] = data.pages;
    const firstPage: ChatPage = first
      ? { ...first, items: [message, ...first.items] }
      : { items: [message], nextCursor: null };
    return { ...data, pages: [firstPage, ...rest] };
  });
}
