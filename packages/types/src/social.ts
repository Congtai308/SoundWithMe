import type { PublicUser } from "./user";
import type { RoomType } from "./room";
import type { QueueTrackSnapshot } from "./room-activity";

/** What a friend is doing right now, as far as you're allowed to see. */
export interface FriendActivity {
  roomId: string;
  /** null for a private room: you see that they're in one, not which. */
  roomName: string | null;
  roomType: RoomType;
  /** Whether you could open that room (public, friends-only, duo — not private). */
  canJoin: boolean;
  trackTitle: string | null;
  trackArtist: string | null;
}

export interface Friend {
  user: PublicUser;
  online: boolean;
  activity: FriendActivity | null;
  friendsSince: string;
}

export interface FriendRequest {
  id: string;
  user: PublicUser;
  /** incoming: they asked you; outgoing: you asked them. */
  direction: "incoming" | "outgoing";
  createdAt: string;
}

export interface FriendsOverview {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

/** A user search result, with how they relate to you. */
export interface UserSearchResult {
  user: PublicUser;
  relation: "self" | "friend" | "incoming" | "outgoing" | "none";
}

export type NotificationType =
  | "friend_request"
  | "friend_accepted"
  | "friend_room_started"
  | "room_invite"
  | "sing_turn";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app path to open, e.g. /room/abc or /friends. */
  link: string | null;
  /** Who it's about (the friend, the inviter), when there is one. */
  actor: PublicUser | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsPage {
  items: AppNotification[];
  unread: number;
}

/** A liked song in the listener's library. */
export interface FavoriteTrack {
  trackId: string;
  track: QueueTrackSnapshot;
  createdAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  /** Artwork of the first song, for the cover. */
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistItem {
  id: string;
  trackId: string;
  track: QueueTrackSnapshot;
  addedAt: string;
}

export interface PlaylistWithItems extends Playlist {
  items: PlaylistItem[];
}
