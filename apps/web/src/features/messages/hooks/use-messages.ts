import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { DirectMessage, DirectMessagesPage } from "@soundwithme/types";
import type { SendDirectMessageInput } from "@soundwithme/validation";
import { messagesApi } from "../services/messages-api";

export const CONVERSATIONS_KEY = ["messages", "conversations"] as const;
const threadKey = (userId: string) => ["messages", "thread", userId] as const;

/** The inbox plus the total unread count (the nav badge). Live updates come over the socket. */
export function useConversations({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: CONVERSATIONS_KEY, queryFn: messagesApi.conversations, enabled });
}

/** One conversation, newest page first; `fetchNextPage` loads older messages. */
export function useThread(userId: string | null) {
  return useInfiniteQuery({
    queryKey: threadKey(userId ?? ""),
    queryFn: ({ pageParam }) => messagesApi.history(userId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(userId),
  });
}

export function useSendMessage(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendDirectMessageInput) => messagesApi.send(userId, input),
    // The socket echo usually lands first; adding is idempotent either way.
    onSuccess: ({ message }) => addMessageToThread(queryClient, message, userId),
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: messagesApi.markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
  });
}

/** Puts a message at the newest end of a cached thread, once. */
function addMessageToThread(queryClient: QueryClient, message: DirectMessage, otherId: string): void {
  queryClient.setQueryData<InfiniteData<DirectMessagesPage, string | undefined>>(threadKey(otherId), (data) => {
    if (!data) return data;
    if (data.pages.some((page) => page.items.some((m) => m.id === message.id))) return data;
    const [first, ...rest] = data.pages;
    return { ...data, pages: [{ ...first!, items: [message, ...first!.items] }, ...rest] };
  });
}

/** A DM_MESSAGE from the socket (sent by either side). */
export function applyLiveMessage(queryClient: QueryClient, message: DirectMessage, myId: string): void {
  const otherId = message.senderId === myId ? message.recipientId : message.senderId;
  addMessageToThread(queryClient, message, otherId);
  void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
}

/** A DM_READ: the other side read our messages (ticks), or we did on another tab (badge). */
export function applyLiveRead(queryClient: QueryClient, payload: { conversationId: string; readerId: string; readAt: string }, myId: string): void {
  const otherId = payload.conversationId.split(":").find((id) => id !== myId);
  if (otherId) {
    queryClient.setQueryData<InfiniteData<DirectMessagesPage, string | undefined>>(threadKey(otherId), (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((m) => (m.recipientId === payload.readerId && !m.readAt ? { ...m, readAt: payload.readAt } : m)),
        })),
      },
    );
  }
  void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
}
