export type QueueItemStatus = "queued" | "playing" | "played" | "removed";

/** Track details copied onto a queue item when it is added, so listing the queue needs no catalog lookups. */
export interface QueueTrackSnapshot {
  title: string;
  artistName: string;
  artworkUrl: string | null;
  durationMs: number;
}

export interface QueueItem {
  id: string;
  roomId: string;
  trackId: string;
  track: QueueTrackSnapshot;
  addedBy: string;
  addedByName: string;
  /** Stable tiebreak key (time-ordered id): among equal scores, the earlier song plays first. */
  position: string;
  /** userIds who want this song sooner / later. The queue plays the highest score first. */
  upvotes: string[];
  downvotes: string[];
  /** upvotes − downvotes */
  score: number;
  status: QueueItemStatus;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  /** Display name at send time (denormalized: chat history never needs a user join). */
  authorName: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export const REACTION_EMOJIS = [
  "❤️",
  "🔥",
  "😂",
  "😭",
  "😍",
  "💜",
  "👏",
  "🎵",
] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface ReactionEvent {
  roomId: string;
  userId: string;
  displayName: string;
  emoji: ReactionEmoji;
  sentAt: string;
}

/** Someone currently connected to a room (live sockets, not REST membership). */
export interface RoomListener {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

/** Votes to skip the song that's playing now. */
export interface SkipVoteState {
  roomId: string;
  trackId: string;
  voterIds: string[];
  /** Votes needed: half the listeners connected right now, rounded up. */
  needed: number;
}
