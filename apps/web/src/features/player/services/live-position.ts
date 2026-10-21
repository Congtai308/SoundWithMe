/**
 * Frame-accurate playback position for UI that must track the music closely
 * (synced lyrics). The player store only ticks every 250 ms; this reads the
 * engine directly. Measured against the <video> element inside the YouTube
 * iframe, getCurrentTime() is within ~1 ms, and reading it is cheap (the
 * IFrame API serves a cached, extrapolated value — no postMessage round trip).
 *
 * use-audio-sync registers the reader while a session's engine is alive.
 */
type PositionReader = () => { positionMs: number; playing: boolean } | null;

let reader: PositionReader | null = null;

export function setLivePositionReader(next: PositionReader | null): void {
  reader = next;
}

/** The engine's position right now, or null when no engine is playing this track. */
export function readLivePosition(): { positionMs: number; playing: boolean } | null {
  return reader?.() ?? null;
}
