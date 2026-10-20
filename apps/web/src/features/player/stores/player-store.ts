import { create } from "zustand";
import type { PlaybackState } from "@soundwithme/types";

const VOLUME_STORAGE_KEY = "swm.player.volume";

function readStoredVolume(): number {
  try {
    const stored = Number(window.localStorage.getItem(VOLUME_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= 0 && stored <= 100 && stored !== 0 ? stored : 80;
  } catch {
    // Storage unavailable (private mode, SSR): fall back to the default volume.
    return 80;
  }
}

function storeVolume(volume: number): void {
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  } catch {
    // Volume simply won't persist across visits; nothing else depends on it.
  }
}

/**
 * Client-side player state (TASK-03). Realtime/UI state only: the track's
 * catalog details are server state and come from React Query via
 * `useTrack(currentTrackId)` — never copied in here (coding-standards §4).
 */
interface PlayerStore {
  roomId: string | null;
  /** Latest authoritative snapshot from the server (version-checked). */
  serverState: PlaybackState | null;
  currentTrackId: string | null;
  isPlaying: boolean;
  currentPositionMs: number;
  durationMs: number;
  volume: number;
  /** Multiplies `volume` while karaoke voices play over the music (1 = no ducking). */
  duckScale: number;
  isMuted: boolean;
  isBuffering: boolean;
  stateVersion: number;
  isSyncedWithServer: boolean;
  /** Last measured |local − target| in ms, for the sync badge. */
  driftMs: number | null;
  /** The browser blocked audio until the user interacts with the page. */
  needsUserGesture: boolean;
  /**
   * Safari only lets a cross-origin player make sound after a tap on the
   * player itself, so the room's own "tap to listen" can't unlock it. The
   * video then waits paused for a tap that goes straight through to it.
   */
  tapVideoToStart: boolean;
  engineError: string | null;

  reset: (roomId: string | null) => void;
  /** Applies a server snapshot unless it is older than (or equal to) the one we have. */
  applyServerState: (state: PlaybackState) => boolean;
  setTrack: (trackId: string | null) => void;
  play: () => void;
  pause: () => void;
  seek: (positionMs: number) => void;
  setDuration: (durationMs: number) => void;
  setBuffering: (buffering: boolean) => void;
  setSync: (synced: boolean, driftMs: number | null) => void;
  setNeedsUserGesture: (needed: boolean) => void;
  setTapVideoToStart: (tapVideoToStart: boolean) => void;
  setEngineError: (message: string | null) => void;
  setVolume: (volume: number) => void;
  setDuckScale: (scale: number) => void;
  toggleMute: () => void;
}

const initialPlayback = {
  serverState: null,
  currentTrackId: null,
  isPlaying: false,
  currentPositionMs: 0,
  durationMs: 0,
  isBuffering: false,
  stateVersion: 0,
  isSyncedWithServer: false,
  driftMs: null,
  needsUserGesture: false,
  tapVideoToStart: false,
  engineError: null,
} as const;

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  roomId: null,
  ...initialPlayback,
  volume: typeof window === "undefined" ? 80 : readStoredVolume(),
  duckScale: 1,
  isMuted: false,

  reset: (roomId) => set({ roomId, ...initialPlayback }),

  applyServerState: (state) => {
    const { roomId, stateVersion } = get();
    // architecture.md §3.2: late packets never overwrite a newer state.
    if (state.roomId !== roomId || state.version <= stateVersion) return false;
    set({
      serverState: state,
      stateVersion: state.version,
      isPlaying: state.isPlaying,
      ...(state.trackId !== get().currentTrackId
        ? { currentTrackId: state.trackId, durationMs: 0, engineError: null }
        : {}),
    });
    return true;
  },

  setTrack: (currentTrackId) => set({ currentTrackId, durationMs: 0, engineError: null }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  seek: (currentPositionMs) => set({ currentPositionMs }),
  setDuration: (durationMs) => set({ durationMs }),
  setBuffering: (isBuffering) => set({ isBuffering }),
  setSync: (isSyncedWithServer, driftMs) => set({ isSyncedWithServer, driftMs }),
  setNeedsUserGesture: (needsUserGesture) => set(needsUserGesture ? { needsUserGesture } : { needsUserGesture, tapVideoToStart: false }),
  setTapVideoToStart: (tapVideoToStart) => set({ tapVideoToStart }),
  setEngineError: (engineError) => set({ engineError }),
  setVolume: (volume) => {
    const clamped = Math.min(100, Math.max(0, Math.round(volume)));
    storeVolume(clamped);
    // Dragging the volume up un-mutes; dragging it to 0 mutes.
    set({ volume: clamped, isMuted: clamped === 0 });
  },
  setDuckScale: (duckScale) => {
    if (duckScale !== get().duckScale) set({ duckScale });
  },
  toggleMute: () => set({ isMuted: !get().isMuted }),
}));
