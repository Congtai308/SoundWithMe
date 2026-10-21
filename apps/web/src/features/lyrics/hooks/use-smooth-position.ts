import { useCallback, useEffect, useRef } from "react";
import { usePlayerStore } from "@/features/player/stores/player-store";
import { readLivePosition } from "@/features/player/services/live-position";

/** Further off than this (a seek, a track change) and the clock jumps instead of easing. */
const SNAP_THRESHOLD_MS = 400;
/** Share of a small error corrected per sample (fallback clock only). */
const EASE_FACTOR = 0.3;
/** A live reading this little behind the last one is jitter, not a seek — hold instead of stepping back. */
const BACKSTEP_TOLERANCE_MS = 80;

/**
 * Playback position for per-frame UI. Primary source: the engine itself
 * (readLivePosition), within ~1 ms of the video. Fallback, while no engine is
 * authoritative (joining, catching up): a local clock eased toward the player
 * store's 250 ms ticks. Returns a getter for rAF loops, so reading it never
 * re-renders.
 */
export function useSmoothPosition(): () => number {
  const clock = useRef({ positionMs: usePlayerStore.getState().currentPositionMs, at: 0, playing: false, rate: 1 });

  useEffect(() => {
    const sample = (positionMs: number, playing: boolean, rate: number) => {
      const now = performance.now();
      const c = clock.current;
      const predicted = c.playing && c.at ? c.positionMs + (now - c.at) * c.rate : c.positionMs;
      const error = positionMs - predicted;
      c.positionMs = !playing || !c.playing || Math.abs(error) > SNAP_THRESHOLD_MS ? positionMs : predicted + error * EASE_FACTOR;
      c.at = now;
      c.playing = playing;
      c.rate = rate;
    };

    const initial = usePlayerStore.getState();
    sample(initial.currentPositionMs, initial.isPlaying, initial.serverState?.speed ?? 1);
    return usePlayerStore.subscribe((state, previous) => {
      if (state.currentPositionMs !== previous.currentPositionMs || state.isPlaying !== previous.isPlaying) {
        sample(state.currentPositionMs, state.isPlaying, state.serverState?.speed ?? 1);
      }
    });
  }, []);

  const lastLive = useRef<number | null>(null);

  const getPosition = useCallback(() => {
    const live = readLivePosition();
    if (live) {
      const previous = lastLive.current;
      const held =
        live.playing && previous !== null && live.positionMs < previous && previous - live.positionMs < BACKSTEP_TOLERANCE_MS;
      if (!held) lastLive.current = live.positionMs;
      return lastLive.current ?? live.positionMs;
    }
    lastLive.current = null;
    const c = clock.current;
    return c.playing && c.at ? c.positionMs + (performance.now() - c.at) * c.rate : c.positionMs;
  }, []);

  // Dev-only probe for the lyrics sync benchmark.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __swmLyricsClock?: () => number }).__swmLyricsClock = getPosition;
  }, [getPosition]);

  return getPosition;
}
