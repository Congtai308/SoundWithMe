import { create } from "zustand";
import type { QueueItem, ReactionEvent, RoomCloseReason, RoomListener, SkipVoteState } from "@soundwithme/types";
import type { ErrorPayload } from "@soundwithme/realtime-contracts";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";
/** Whether the server accepted our ROOM_JOIN (membership itself is granted over REST). */
export type Membership = "checking" | "member" | "not-member";

export interface FloatingReaction extends ReactionEvent {
  key: number;
}

const REACTION_LIFETIME_MS = 2_400;
const MAX_FLOATING_REACTIONS = 24;

interface RoomLiveStore {
  roomId: string | null;
  connection: ConnectionStatus;
  membership: Membership;
  queue: QueueItem[];
  listeners: RoomListener[];
  reactions: FloatingReaction[];
  lastError: ErrorPayload | null;
  /** Votes to skip the song playing now. */
  skip: SkipVoteState | null;
  /** The room ended while we were in it. */
  closedReason: RoomCloseReason | null;
  /** The host removed us from this room. */
  kicked: boolean;

  reset: (roomId: string | null) => void;
  setConnection: (status: ConnectionStatus) => void;
  setMembership: (membership: Membership) => void;
  setQueue: (roomId: string, queue: QueueItem[]) => void;
  setListeners: (roomId: string, listeners: RoomListener[]) => void;
  addReaction: (reaction: ReactionEvent) => void;
  setError: (error: ErrorPayload | null) => void;
  setSkip: (skip: SkipVoteState) => void;
  setClosed: (roomId: string, reason: RoomCloseReason) => void;
  setKicked: (roomId: string) => void;
}

let nextReactionKey = 1;

/**
 * Socket-pushed room state (queue, who's here, floating reactions). Chat
 * history is server state and lives in React Query instead.
 */
export const useRoomLiveStore = create<RoomLiveStore>((set, get) => ({
  roomId: null,
  connection: "idle",
  membership: "checking",
  queue: [],
  listeners: [],
  reactions: [],
  lastError: null,
  skip: null,
  closedReason: null,
  kicked: false,

  reset: (roomId) =>
    set({
      roomId,
      connection: "idle",
      membership: "checking",
      queue: [],
      listeners: [],
      reactions: [],
      lastError: null,
      skip: null,
      closedReason: null,
      kicked: false,
    }),
  setConnection: (connection) => set({ connection }),
  setMembership: (membership) => set({ membership }),
  setQueue: (roomId, queue) => {
    if (roomId === get().roomId) set({ queue });
  },
  setListeners: (roomId, listeners) => {
    if (roomId === get().roomId) set({ listeners });
  },
  addReaction: (reaction) => {
    if (reaction.roomId !== get().roomId) return;
    const key = nextReactionKey++;
    set({ reactions: [...get().reactions, { ...reaction, key }].slice(-MAX_FLOATING_REACTIONS) });
    window.setTimeout(() => {
      set({ reactions: get().reactions.filter((r) => r.key !== key) });
    }, REACTION_LIFETIME_MS);
  },
  setError: (lastError) => set({ lastError }),
  setSkip: (skip) => {
    if (skip.roomId === get().roomId) set({ skip });
  },
  setClosed: (roomId, closedReason) => {
    if (roomId === get().roomId) set({ closedReason });
  },
  setKicked: (roomId) => {
    if (roomId === get().roomId) set({ kicked: true });
  },
}));
