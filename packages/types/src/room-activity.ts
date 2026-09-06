export type QueueItemStatus = "queued" | "playing" | "played" | "removed";

export interface QueueItem {
  id: string;
  roomId: string;
  trackId: string;
  addedBy: string;
  /**
   * Fractional/lexicographic ordering key (e.g. "a0", "a1", "a0m"...).
   * Chosen so reordering never requires rewriting every sibling row.
   * See Architecture Review §4 (roomQueue) / §17 risk #2.
   */
  position: string;
  votes: string[]; // userIds, only relevant when settings.whoCanAddSongs === "vote"
  status: QueueItemStatus;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
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
  emoji: ReactionEmoji;
  sentAt: string;
}
