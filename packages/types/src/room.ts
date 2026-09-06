export type RoomType = "public" | "friends" | "private" | "duo" | "community";
export type RoomStatus = "active" | "closed";
export type RoomMemberRole = "host" | "member";

export interface RoomSettings {
  whoCanControlPlayback: "host" | "everyone";
  whoCanAddSongs: "host" | "everyone" | "vote";
  chatEnabled: boolean;
  reactionsEnabled: boolean;
  songRequestsEnabled: boolean;
  maxListeners: number;
}

export interface Room {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  hostId: string;
  type: RoomType;
  status: RoomStatus;
  settings: RoomSettings;
  currentTrackId: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  role: RoomMemberRole;
  joinedAt: string;
  leftAt: string | null;
}

/**
 * The ONLY authoritative shape for playback state. Lives in Redis at
 * room:{roomId}:state — see Architecture Review §5/§7. `version` is required
 * for clients to discard stale/out-of-order broadcasts.
 */
export interface PlaybackState {
  roomId: string;
  trackId: string | null;
  isPlaying: boolean;
  positionMs: number;
  serverTimestamp: number; // epoch ms, set by server, never trust client clock
  version: number;
  updatedBy: string; // userId
}
