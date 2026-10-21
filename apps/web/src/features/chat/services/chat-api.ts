import type { ChatMessage } from "@soundwithme/types";
import { apiClient } from "@/services/api-client";

export interface ChatPage {
  items: ChatMessage[];
  nextCursor: string | null;
}

export const chatApi = {
  /** Newest-first page of a room's history. */
  history: (roomId: string, cursor?: string) => {
    const params = new URLSearchParams({ limit: "50" });
    if (cursor) params.set("cursor", cursor);
    return apiClient.get<ChatPage>(`/rooms/${encodeURIComponent(roomId)}/messages?${params.toString()}`);
  },
};
