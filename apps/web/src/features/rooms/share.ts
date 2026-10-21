import type { Room } from "@soundwithme/types";

/** The link to send people: private rooms carry the invite code (only the host has it). */
export function roomSharePath(room: Room): string {
  return room.type === "private" && room.inviteCode
    ? `/room/${room.id}?invite=${encodeURIComponent(room.inviteCode)}`
    : `/room/${room.id}`;
}

export function roomShareUrl(room: Room): string {
  return `${window.location.origin}${roomSharePath(room)}`;
}
