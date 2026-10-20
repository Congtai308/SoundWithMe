import type { Room, RoomMember } from "@soundwithme/types";
import type { CreateRoomInput, JoinRoomInput, UpdateRoomInput } from "@soundwithme/validation";
import { apiClient } from "@/services/api-client";

export interface RoomsPage {
  items: Room[];
  nextCursor: string | null;
}

export const roomsApi = {
  create: (input: CreateRoomInput) => apiClient.post<{ room: Room }>("/rooms", input),

  list: (cursor?: string) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    const query = params.toString();
    return apiClient.get<RoomsPage>(query ? `/rooms?${query}` : "/rooms");
  },

  /** The live room you host, or null (one at a time). */
  mine: () => apiClient.get<{ room: Room | null }>("/rooms/mine/active"),

  /** `invite`: the code from a private room's invite link. */
  getById: (id: string, invite?: string) =>
    apiClient.get<{ room: Room }>(invite ? `/rooms/${id}?invite=${encodeURIComponent(invite)}` : `/rooms/${id}`),

  join: (id: string, input: JoinRoomInput = {}) => apiClient.post<{ member: RoomMember }>(`/rooms/${id}/join`, input),

  leave: (id: string) => apiClient.post<{ status: string }>(`/rooms/${id}/leave`),

  update: (id: string, input: UpdateRoomInput) => apiClient.patch<{ room: Room }>(`/rooms/${id}`, input),

  /** New invite link for a private room; the old one stops working. */
  regenerateInvite: (id: string) => apiClient.post<{ room: Room }>(`/rooms/${id}/invite`),
};
