import type { PlaybackState, Room } from "@soundwithme/types";
import { MusicService } from "../src/modules/music/music.service";
import { LobbyService } from "../src/modules/lobby/lobby.service";
import { RoomsService } from "../src/modules/rooms/rooms.service";
import { LOBBY_TOPICS, seededListeners } from "../src/modules/rooms/lobby.topics";
import { PlaybackService } from "../src/modules/playback/playback.service";
import { QueueService } from "../src/modules/queue/queue.service";
import { RealtimeHarness } from "./support/realtime-harness";

/** The six always-open themed rooms: listed to everyone, songs waiting, never ending. */
process.env.LOBBY_ROOMS = "1";
// Every topic search finds the whole mock catalog (YouTube is off in tests).
const CATALOG = ["track_1", "track_2", "track_3", "track_4"];
jest.spyOn(MusicService.prototype, "search").mockImplementation(async function (this: MusicService) {
  const tracks = await Promise.all(CATALOG.map((id) => this.getTrackWithArtist(id)));
  return tracks.filter((track) => track !== null);
});

const h = new RealtimeHarness();

beforeAll(async () => {
  await h.start();
  await h.get(LobbyService).ensureRooms();
});
afterAll(() => h.stop());

type RoomPage = { items: Room[]; nextCursor: string | null };
const listRooms = async (cookie?: string) => (await h.api<RoomPage>("/rooms", { cookie })).data.items;

describe("Lobby rooms", () => {
  it("lists the six topic rooms first, to signed-out visitors too, with songs and listeners", async () => {
    const guest = await h.createGuest("Someone");
    const own = await h.createRoom(guest.cookie);

    const rooms = await listRooms();
    expect(rooms.slice(0, 6).map((room) => room.topic?.slug)).toEqual(LOBBY_TOPICS.map((topic) => topic.slug));
    expect(rooms[6]?.id).toBe(own.id);
    for (const room of rooms.slice(0, 6)) {
      expect(room.upcomingCount).toBeGreaterThan(0);
      expect(room.listenerCount).toBeGreaterThanOrEqual(3);
      expect(room.currentTrackId).not.toBeNull(); // already playing before anyone comes
    }
    expect(rooms[6]).toMatchObject({ topic: null, listenerCount: 1 });
  });

  it("is still one room per topic after starting again", async () => {
    await h.get(LobbyService).ensureRooms();
    const rooms = await listRooms();
    expect(rooms.filter((room) => room.topic).length).toBe(6);
  });

  it("moves a finished song on and tops the queue up when someone comes in", async () => {
    const [room] = (await listRooms()).filter((r) => r.topic?.slug === "lofi");
    const queue = h.get(QueueService);
    const playback = h.get(PlaybackService);
    // The song ended long ago and the queue ran low while the room was empty.
    const before = (await playback.getPlaybackState(room!.id)) as PlaybackState;
    await playback.initOrUpdatePlaybackState(room!.id, { positionMs: 10 * 60_000 });
    const upcoming = await queue.listUpcoming(room!.id);
    for (const item of upcoming.slice(1)) await queue.remove(room!.id, room!.hostId, item.id);

    const guest = await h.createGuest("Walk-in");
    await h.joinRest(room!.id, guest.cookie);
    await waitFor(async () => (await playback.getPlaybackState(room!.id))!.version > before.version + 1);

    const after = (await playback.getPlaybackState(room!.id))!;
    expect(after.positionMs).toBe(0);
    expect(after.isPlaying).toBe(true);
    expect((await queue.listUpcoming(room!.id)).length).toBeGreaterThan(1);
  });

  it("ends the room of a topic taken off the list", async () => {
    const rooms = h.get(RoomsService);
    const host = await h.createGuest("Retired host");
    const retired = await rooms.ensureLobbyRoom(host.userId, { ...LOBBY_TOPICS[0]!, slug: "retired", name: "Retired" });
    await h.get(LobbyService).ensureRooms();
    expect((await listRooms()).some((room) => room.id === retired.id)).toBe(false);
    expect((await listRooms()).filter((room) => room.topic).length).toBe(6);
  });

  it("lets go of members who aren't connected instead of ending the room", async () => {
    const [room] = (await listRooms()).filter((r) => r.topic?.slug === "tiktok");
    const guest = await h.createGuest("Gone");
    await h.joinRest(room!.id, guest.cookie);
    const rooms = h.get(RoomsService);
    expect(await rooms.isActiveMember(room!.id, guest.userId)).toBe(true);

    // Just joined: their socket may still be on its way.
    expect(await rooms.pruneLobbyMembers(room!.id, new Set())).toBe(0);
    jest.useFakeTimers({ now: Date.now() + 3 * 60_000, doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval"] });
    try {
      expect(await rooms.pruneLobbyMembers(room!.id, new Set())).toBe(1);
    } finally {
      jest.useRealTimers();
    }
    expect(await rooms.isActiveMember(room!.id, guest.userId)).toBe(false);
    expect(await rooms.isActiveMember(room!.id, room!.hostId)).toBe(true);
    expect((await listRooms()).find((r) => r.id === room!.id)?.status).toBe("active");
  });
});

describe("seededListeners", () => {
  it("stays in range and changes smoothly", () => {
    let previous = seededListeners("room-a", 0);
    for (let minute = 1; minute < 24 * 60; minute++) {
      const now = seededListeners("room-a", minute * 60_000);
      expect(now).toBeGreaterThanOrEqual(3);
      expect(now).toBeLessThanOrEqual(22);
      expect(Math.abs(now - previous)).toBeLessThanOrEqual(2);
      previous = now;
    }
  });

  it("is the same for everyone at the same moment", () => {
    expect(seededListeners("room-b", 123_456_789)).toBe(seededListeners("room-b", 123_456_789));
  });
});

async function waitFor(check: () => Promise<boolean>, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the lobby room to refresh");
}
