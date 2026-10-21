import { serverNow } from "./server-clock";

/**
 * How far this tab deliberately plays behind the room, in ms.
 *
 * Karaoke: a singer sings to the room's music, and their voice reaches each
 * listener ~100–250 ms later over WebRTC. Playing the music that much later
 * on the listener's side puts voice and music back together. Singers
 * themselves keep 0 — they sing to the live music. Set by the voice mesh.
 */
let delayMs = 0;

export function setListenDelay(ms: number): void {
  delayMs = Math.max(0, Math.round(ms));
}

export function getListenDelay(): number {
  return delayMs;
}

/** The room's clock as this tab should hear it: server time minus the listen delay. */
export function listenNow(): number {
  return serverNow() - delayMs;
}
