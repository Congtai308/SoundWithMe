export type RoomType = "public" | "friends" | "private" | "duo" | "community";
export type RoomStatus = "active" | "closed";
export type RoomMemberRole = "host" | "member";

export interface RoomSettings {
  whoCanControlPlayback: "host" | "everyone";
  /** "vote" is kept for older rooms and behaves like "everyone": every queue is ordered by votes. */
  whoCanAddSongs: "host" | "everyone" | "vote";
  chatEnabled: boolean;
  reactionsEnabled: boolean;
  songRequestsEnabled: boolean;
  maxListeners: number;
  /** Karaoke mics open at once (1–4); everyone else waits in the singing line. */
  maxSingers: number;
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
  memberCount: number;
  /** Members the host made DJs: they control playback and the queue like the host. */
  djIds: string[];
  /** Members the host muted in chat. */
  mutedUserIds: string[];
  /** Private rooms: a passcode lets people in without the invite link. */
  hasPasscode: boolean;
  /** Private rooms, host only: the secret in the invite link (null for everyone else). */
  inviteCode: string | null;
  createdAt: string;
  closedAt: string | null;
}

/** Why a room ended — shown to everyone still in it. */
export type RoomCloseReason = "host-ended" | "inactive" | "host-left";

/** What a private room you can't see yet tells you: only that it exists and how to get in. */
export interface LockedRoomInfo {
  roomId: string;
  hasPasscode: boolean;
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
 * room:{roomId}:playback, owned by PlaybackService (apps/api). `version` and
 * `serverTimestamp` are always assigned by the server, never by a client.
 */
export interface PlaybackState {
  roomId: string;
  trackId: string;
  isPlaying: boolean;
  /** Position at the moment the server recorded this state. */
  positionMs: number;
  /** Server epoch ms (Date.now()) when this state was written. */
  serverTimestamp: number;
  /** Monotonically increasing per room: 1 -> 2 -> 3. */
  version: number;
  speed: number;
}

/** The subset of PlaybackState a caller is allowed to change. */
export type PlaybackStateUpdate = Partial<
  Pick<PlaybackState, "trackId" | "isPlaying" | "positionMs" | "speed">
>;
