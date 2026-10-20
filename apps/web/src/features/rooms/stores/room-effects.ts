import { create } from "zustand";

const STORAGE_KEY = "swm.room-effects";

/** "auto" = full effects, except on phones / low-power devices / reduced motion. */
export type EffectsPreference = "auto" | "on" | "off";

function read(): EffectsPreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "on" || value === "off" ? value : "auto";
  } catch {
    // Storage unavailable: fall back to the device default.
    return "auto";
  }
}

function write(preference: EffectsPreference): void {
  try {
    if (preference === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // The choice just won't persist across visits.
  }
}

/**
 * Phones and weak GPUs struggle with the room's full-screen ambience (moving
 * glows, falling petals, a huge blur): it is drawn on top of the video, so
 * every frame recomposites the whole screen.
 */
function prefersLiteEffects(): boolean {
  const media = (query: string) => window.matchMedia(query).matches;
  return (
    media("(prefers-reduced-motion: reduce)") ||
    media("(pointer: coarse)") ||
    media("(max-width: 767px)") ||
    (navigator.hardwareConcurrency ?? 8) <= 4
  );
}

interface RoomEffectsStore {
  preference: EffectsPreference;
  /** Whether the full ambience runs on this device right now. */
  enabled: boolean;
  hydrated: boolean;
  hydrate: () => void;
  toggle: () => void;
}

/** Room ambience on/off (per-viewer convenience, localStorage). */
export const useRoomEffects = create<RoomEffectsStore>((set, get) => ({
  preference: "auto",
  // Server render and first paint: lite, so a weak device never starts heavy.
  enabled: false,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    const preference = read();
    set({ preference, enabled: preference === "on" || (preference === "auto" && !prefersLiteEffects()), hydrated: true });
  },
  toggle: () => {
    const enabled = !get().enabled;
    // Matching the device default goes back to "auto", so it follows the device again.
    const preference: EffectsPreference = enabled === !prefersLiteEffects() ? "auto" : enabled ? "on" : "off";
    write(preference);
    set({ preference, enabled });
  },
}));
