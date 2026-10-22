import { SOCKET_EVENTS } from "@soundwithme/constants";
import type { PlaybackState } from "@soundwithme/types";
import { PLAYBACK_ENDS_KEY } from "../src/modules/playback/playback.service";
import { RealtimeHarness, nextEventMatching, receivesWithin } from "./support/realtime-harness";

/** A room moves to its next song when the song ends by the server's clock, whatever the tabs do. */
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterAll(() => h.stop());

async function roomPlayingTrack1WithTrack2Next() {
  const host = await h.createGuest("Host");
  const room = await h.createRoom(host.cookie);
  const listener = await h.createGuest("Listener");
  await h.joinRest(room.id, listener.cookie);
  const hostSocket = await h.joinedSocket(host.cookie, room.id);
  const listenerSocket = await h.joinedSocket(listener.cookie, room.id);

  const started = nextEventMatching(listenerSocket, SOCKET_EVENTS.PLAYBACK_STATE, (s) => s.trackId === "track_1");
  hostSocket.emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId: room.id, trackId: "track_1" });
  const state = await started;
  hostSocket.emit(SOCKET_EVENTS.QUEUE_ADD, { roomId: room.id, trackId: "track_2" });
  await nextEventMatching(listenerSocket, SOCKET_EVENTS.QUEUE_UPDATED, (q) => q.queue.length === 1);
  return { room, hostSocket, listenerSocket, state };
}

/** Winds the server's clock past the end of the 3:34 song, as if it played out. */
async function playOut(roomId: string) {
  const key = `room:${roomId}:playback`;
  const stored = JSON.parse((await h.redis().get(key))!) as PlaybackState;
  await h.redis().set(key, JSON.stringify({ ...stored, serverTimestamp: stored.serverTimestamp - 214_000 }));
  await h.redis().zadd(PLAYBACK_ENDS_KEY, Date.now() - 214_000, roomId);
}

describe("Songs end on time", () => {
  it("starts the next song with no tab reporting the end", async () => {
    const { room, listenerSocket, state } = await roomPlayingTrack1WithTrack2Next();
    expect(Number(await h.redis().zscore(PLAYBACK_ENDS_KEY, room.id))).toBeGreaterThan(Date.now());

    const advanced = nextEventMatching(listenerSocket, SOCKET_EVENTS.PLAYBACK_STATE, (s) => s.trackId === "track_2");
    await playOut(room.id);
    const next = await advanced;
    expect(next.version).toBe(state.version + 1);
    expect(next.positionMs).toBe(0);
    // track_2 is playing now, with its own end scheduled.
    expect(Number(await h.redis().zscore(PLAYBACK_ENDS_KEY, room.id))).toBeGreaterThan(Date.now());
  });

  it("leaves a paused song alone", async () => {
    const { room, hostSocket, listenerSocket } = await roomPlayingTrack1WithTrack2Next();
    const paused = nextEventMatching(listenerSocket, SOCKET_EVENTS.PLAYBACK_STATE, (s) => !s.isPlaying);
    hostSocket.emit(SOCKET_EVENTS.PAUSE, { roomId: room.id, positionMs: 60_000 });
    await paused;
    expect(await h.redis().zscore(PLAYBACK_ENDS_KEY, room.id)).toBeNull();
    expect(await receivesWithin(listenerSocket, SOCKET_EVENTS.PLAYBACK_STATE, 2_500)).toBe(false);
  });

  it("stops looking once the queue is empty", async () => {
    const { room, hostSocket, listenerSocket } = await roomPlayingTrack1WithTrack2Next();
    const advanced = nextEventMatching(listenerSocket, SOCKET_EVENTS.PLAYBACK_STATE, (s) => s.trackId === "track_2");
    await playOut(room.id);
    await advanced;
    await playOut(room.id); // track_2 is over too, and nothing is queued
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(await h.redis().zscore(PLAYBACK_ENDS_KEY, room.id)).toBeNull();
    hostSocket.disconnect();
  });
});
