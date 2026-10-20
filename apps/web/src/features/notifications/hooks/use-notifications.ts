import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { AppNotification, NotificationsPage } from "@soundwithme/types";
import { notificationsApi } from "../services/notifications-api";

const KEY = ["notifications"] as const;
const MAX_KEPT = 30;

export function useNotifications({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: KEY, queryFn: notificationsApi.list, enabled, staleTime: 60_000 });
}

/** A notification pushed over the socket: on top of the list, one more unread. */
export function addLiveNotification(queryClient: QueryClient, notification: AppNotification): void {
  queryClient.setQueryData<NotificationsPage>(KEY, (page) =>
    page
      ? {
          items: [notification, ...page.items.filter((n) => n.id !== notification.id)].slice(0, MAX_KEPT),
          unread: page.unread + 1,
        }
      : page,
  );
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.readAll,
    onMutate: () => {
      const now = new Date().toISOString();
      queryClient.setQueryData<NotificationsPage>(KEY, (page) =>
        page ? { items: page.items.map((n) => ({ ...n, readAt: n.readAt ?? now })), unread: 0 } : page,
      );
    },
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.read,
    onMutate: (id: string) => {
      queryClient.setQueryData<NotificationsPage>(KEY, (page) => {
        if (!page) return page;
        const target = page.items.find((n) => n.id === id);
        if (!target || target.readAt) return page;
        return {
          items: page.items.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
          unread: Math.max(0, page.unread - 1),
        };
      });
    },
  });
}
