import type { Room } from "@soundwithme/types";

export interface RoomPermissions {
  isHost: boolean;
  /** Made DJ by the host: playback and the whole queue, like the host. */
  isDj: boolean;
  canControl: boolean;
  canAdd: boolean;
  /** Remove anyone's songs, close anyone's mic. */
  canManage: boolean;
  isMutedInChat: boolean;
}

/** What `userId` may do in `room` — mirrors the server's checks (which stay authoritative). */
export function roomPermissions(room: Room | undefined, userId: string | undefined): RoomPermissions {
  if (!room || !userId) {
    return { isHost: false, isDj: false, canControl: false, canAdd: false, canManage: false, isMutedInChat: false };
  }
  const isHost = room.hostId === userId;
  const isDj = !isHost && room.djIds.includes(userId);
  const canManage = isHost || isDj;
  return {
    isHost,
    isDj,
    canControl: canManage || room.settings.whoCanControlPlayback === "everyone",
    canAdd: canManage || room.settings.whoCanAddSongs !== "host",
    canManage,
    isMutedInChat: room.mutedUserIds.includes(userId),
  };
}
