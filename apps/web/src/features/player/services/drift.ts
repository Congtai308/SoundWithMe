import type { PlaybackState } from "@soundwithme/types";

/** Closer than this to the room counts as in sync: play at 1.0. */
export const IN_SYNC_MS = 60;
/** Still reported as "synced" in the UI badge. */
export const SOFT_CORRECTION_MS = 250;
/** Longest a rate nudge is held before the next sync pass re-evaluates it. */
const MAX_NUDGE_MS = 10_000;
const MIN_NUDGE_MS = 300;

/** Where the room is right now, per architecture.md §3.3 (on the server's clock). */
export function targetPositionMs(state: PlaybackState, serverNowMs: number): number {
  if (!state.isPlaying) return state.positionMs;
  return Math.max(0, state.positionMs + (serverNowMs - state.serverTimestamp) * state.speed);
}

export type DriftCorrection =
  /** Play at `rate` for `forMs`, which closes the gap exactly, then return to 1.0. */
  | { kind: "rate"; rate: number; forMs: number }
  | { kind: "seek"; toMs: number };

/**
 * Bigger gaps get a stronger (still pitch-preserved, barely audible) nudge.
 * Steps of 0.05: YouTube rounds other rates (1.02 plays at 1.0×, measured).
 */
function nudgeFor(distanceMs: number): number {
  return distanceMs <= 700 ? 0.05 : 0.1;
}

/**
 * Decides how to close the gap between the local player and the room.
 * Seeking is audible (and on YouTube costs a re-buffer), so anything under
 * the engine's `seekThresholdMs` is closed by briefly speeding up or slowing
 * down instead; only larger gaps seek.
 */
export function decideCorrection(localMs: number, targetMs: number, seekThresholdMs: number): DriftCorrection {
  const delta = targetMs - localMs; // > 0: we are behind
  const distance = Math.abs(delta);
  if (distance <= IN_SYNC_MS) return { kind: "rate", rate: 1, forMs: 0 };
  if (distance > seekThresholdMs) return { kind: "seek", toMs: targetMs };

  const nudge = nudgeFor(distance);
  const forMs = Math.min(MAX_NUDGE_MS, Math.max(MIN_NUDGE_MS, distance / nudge));
  return { kind: "rate", rate: delta > 0 ? 1 + nudge : 1 - nudge, forMs };
}
