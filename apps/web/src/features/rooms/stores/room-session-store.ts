import { create } from "zustand";

/**
 * Which room this tab is listening to. The session (socket + synced player)
 * lives in the app layout, so music keeps playing while the user browses
 * other pages; the room page only enters it, and leaving/closing exits it.
 */
interface RoomSessionStore {
  activeRoomId: string | null;
  enter: (roomId: string) => void;
  exit: () => void;
}

export const useRoomSessionStore = create<RoomSessionStore>((set, get) => ({
  activeRoomId: null,
  enter: (roomId) => {
    if (get().activeRoomId !== roomId) set({ activeRoomId: roomId });
  },
  exit: () => set({ activeRoomId: null }),
}));
