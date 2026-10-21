/**
 * "Start a room with this song": the song travels from the Music / create
 * room flow to the room page through this tab's sessionStorage, written by
 * the click that enters the room. Never through the URL: a link from
 * anywhere else could otherwise make a host's or DJ's tab change what a
 * room plays, with their rights and no click of theirs.
 */
const KEY = "swm.pending-play";
/** A handoff not picked up by then is stale (the tab went elsewhere). */
const MAX_AGE_MS = 60_000;

export function setPendingPlay(roomId: string, trackId: string): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ roomId, trackId, at: Date.now() }));
  } catch {
    // Storage unavailable: the room just opens without the song.
  }
}

/** The song to start in `roomId`, once: reading clears it. */
export function takePendingPlay(roomId: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as { roomId?: unknown; trackId?: unknown; at?: unknown };
    if (pending.roomId !== roomId) return null;
    window.sessionStorage.removeItem(KEY);
    if (typeof pending.trackId !== "string" || typeof pending.at !== "number") return null;
    return Date.now() - pending.at <= MAX_AGE_MS ? pending.trackId : null;
  } catch {
    return null;
  }
}
