import type { PublicUser } from "./user";

/** A song as it was when shared, so the message still shows it if the catalog changes. */
export interface SharedTrack {
  id: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  durationMs: number;
}

/** A room invite inside a message. `link` carries the invite code for private rooms. */
export interface SharedRoom {
  id: string;
  name: string;
  link: string;
}

export type DirectMessageKind = "text" | "track" | "room";

export interface DirectMessage {
  id: string;
  /** The other person, seen from either side: `${smallerUserId}:${largerUserId}`. */
  conversationId: string;
  senderId: string;
  recipientId: string;
  kind: DirectMessageKind;
  /** The text, or an optional note with a shared song or room. */
  content: string;
  track: SharedTrack | null;
  room: SharedRoom | null;
  readAt: string | null;
  createdAt: string;
}

/** One row of the inbox: the friend, the newest message, and how many are unread. */
export interface Conversation {
  user: PublicUser;
  lastMessage: DirectMessage;
  unread: number;
}

export interface DirectMessagesPage {
  items: DirectMessage[];
  nextCursor: string | null;
}
