import { create } from "zustand";

/** "stage" = the room's cinema stage, "mini" = the floating mini player. */
export type VideoSlotKind = "stage" | "mini";

export interface VideoSlot {
  element: HTMLElement;
  kind: VideoSlotKind;
}

/**
 * The YouTube iframe reloads if it is moved in the DOM, so it is mounted once
 * (PlayerHost) and positioned over whichever slot is on screen. The stage
 * wins over the mini player when both are mounted.
 */
interface VideoSlotStore {
  slots: VideoSlot[];
  register: (slot: VideoSlot) => () => void;
}

export const useVideoSlotStore = create<VideoSlotStore>((set, get) => ({
  slots: [],
  register: (slot) => {
    set({ slots: [...get().slots, slot] });
    return () => set({ slots: get().slots.filter((s) => s !== slot) });
  },
}));

export function activeSlot(slots: VideoSlot[]): VideoSlot | null {
  return slots.find((s) => s.kind === "stage") ?? slots[slots.length - 1] ?? null;
}
