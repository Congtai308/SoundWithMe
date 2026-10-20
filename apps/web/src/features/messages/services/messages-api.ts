import type { Conversation, DirectMessage, DirectMessagesPage } from "@soundwithme/types";
import type { SendDirectMessageInput } from "@soundwithme/validation";
import { apiClient } from "@/services/api-client";

export const messagesApi = {
  conversations: () => apiClient.get<{ conversations: Conversation[]; unread: number }>("/messages/conversations"),

  history: (userId: string, cursor?: string) =>
    apiClient.get<DirectMessagesPage>(
      `/messages/with/${encodeURIComponent(userId)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),

  send: (userId: string, input: SendDirectMessageInput) =>
    apiClient.post<{ message: DirectMessage }>(`/messages/with/${encodeURIComponent(userId)}`, input),

  markRead: (userId: string) => apiClient.post<{ status: string }>(`/messages/with/${encodeURIComponent(userId)}/read`),
};
