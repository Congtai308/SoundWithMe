import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Room } from "@soundwithme/types";
import type { JoinRoomInput, UpdateRoomInput } from "@soundwithme/validation";
import { ApiClientError } from "@/services/api-client";
import { roomsApi } from "../services/rooms-api";
import { inviteFor } from "../stores/room-invites";

/** First page of live public rooms — for previews (Home, sidebar badge). */
export function useRoomsList({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["rooms", "list", "first-page"],
    queryFn: () => roomsApi.list(),
    select: (data) => data.items,
    enabled,
  });
}

/** All live public rooms, cursor-paginated — for the Live Rooms page. */
export function useInfiniteRooms({ enabled = true }: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: ["rooms", "list", "infinite"],
    queryFn: ({ pageParam }) => roomsApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
}

/** The live room you host (you can host one at a time). */
export function useMyActiveRoom({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["rooms", "mine"],
    queryFn: () => roomsApi.mine().then((r) => r.room),
    enabled,
  });
}

/** A locked private room isn't an error to retry: it needs the invite link or the passcode. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiClientError && ["ROOM_LOCKED", "ROOM_NOT_FOUND"].includes(error.code)) return false;
  return failureCount < 2;
}

export function useRoom(roomId: string) {
  return useQuery({
    queryKey: ["rooms", roomId],
    queryFn: () => roomsApi.getById(roomId, inviteFor(roomId)).then((r) => r.room),
    enabled: roomId.length > 0,
    retry: shouldRetry,
  });
}

function useInvalidateRooms() {
  const queryClient = useQueryClient();
  return (roomId?: string) => {
    if (roomId) void queryClient.invalidateQueries({ queryKey: ["rooms", roomId] });
    void queryClient.invalidateQueries({ queryKey: ["rooms", "list"] });
    void queryClient.invalidateQueries({ queryKey: ["rooms", "mine"] });
  };
}

export function useCreateRoom() {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: roomsApi.create,
    onSuccess: () => invalidate(),
  });
}

/** Joins with the invite code from the link (if any) and an optional passcode. */
export function useJoinRoom(roomId: string) {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: (input: JoinRoomInput = {}) => roomsApi.join(roomId, { invite: inviteFor(roomId), ...input }),
    onSuccess: () => invalidate(roomId),
  });
}

export function useLeaveRoom(roomId: string) {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: () => roomsApi.leave(roomId),
    onSuccess: () => invalidate(roomId),
  });
}

/** Host only: settings, name, passcode. The new room reaches everyone over the socket too. */
export function useUpdateRoom(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRoomInput) => roomsApi.update(roomId, input).then((r) => r.room),
    onSuccess: (room) => queryClient.setQueryData<Room>(["rooms", roomId], room),
  });
}

export function useRegenerateInvite(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => roomsApi.regenerateInvite(roomId).then((r) => r.room),
    onSuccess: (room) => queryClient.setQueryData<Room>(["rooms", roomId], room),
  });
}
