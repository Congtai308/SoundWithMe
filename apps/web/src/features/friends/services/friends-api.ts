import type { FriendsOverview, UserSearchResult } from "@soundwithme/types";
import { apiClient } from "@/services/api-client";

export const friendsApi = {
  overview: () => apiClient.get<FriendsOverview>("/friends"),
  search: (q: string) => apiClient.get<{ results: UserSearchResult[] }>(`/friends/search?q=${encodeURIComponent(q)}`),
  request: (username: string) => apiClient.post<{ status: "requested" | "accepted" }>("/friends/requests", { username }),
  accept: (requestId: string) => apiClient.post<{ status: string }>(`/friends/requests/${requestId}/accept`),
  /** Decline a request to you, or cancel one you sent. */
  dismiss: (requestId: string) => apiClient.delete<{ status: string }>(`/friends/requests/${requestId}`),
  unfriend: (userId: string) => apiClient.delete<{ status: string }>(`/friends/${userId}`),
};
