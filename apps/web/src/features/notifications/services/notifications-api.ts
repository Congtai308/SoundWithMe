import type { NotificationsPage } from "@soundwithme/types";
import { apiClient } from "@/services/api-client";

export const notificationsApi = {
  list: () => apiClient.get<NotificationsPage>("/notifications"),
  readAll: () => apiClient.post<{ status: string }>("/notifications/read-all"),
  read: (id: string) => apiClient.post<{ status: string }>(`/notifications/${id}/read`),
};
