import { ERROR_CODES, SOCKET_EVENTS } from "@soundwithme/constants";
import type { PlaybackState, Room } from "@soundwithme/types";
import { RealtimeHarness, nextEvent, nextEventMatching, receivesWithin } from "./support/realtime-harness";

/**
 * Races and gaps found in code review: parallel joins, parallel mic
 * requests, cleanup after a kick, listeners ending a song while the host is
 * away, auth rate limits, and parallel sign-ups racing for one username.
 */
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterEach(() => h.disconnectAll());
afterAll(() => h.stop());

async function call<T>(path: string, cookie: string, method = "GET", body?: unknown, ip?: string) {
  const res = await fetch(`${h.baseUrl}/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json", cookie, ...(ip ? { "x-forwarded-for": ip } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { data: T; error?: { code: string } };
  return { status: res.status, data: json.data, error: json.error };
}

const createRoom = async (cookie: string, settings: Partial<Room["settings"]> = {}) =>
  (await call<{ room: Room }>("/rooms", cookie, "POST", { name: "Review room", type: "public", settings })).data.room;

describe("Joining a room at the same time", () => {
  it("never overfills the room", async () => {
    const host = await h.createGuest("Host");
    const room = await createRoom(host.cookie, { maxListeners: 3 });
    const guests = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => h.createGuest(`Guest ${n}`)));

    const results = await Promise.all(guests.map((g) => call(`/rooms/${room.id}/join`, g.cookie, "POST", {})));
    expect(results.filter((r) => r.status < 300)).toHaveLength(2); // host + 2 = 3
    expect(results.filter((r) => r.error?.code === ERROR_CODES.ROOM_FULL)).toHaveLength(4);

    const after = await call<{ room: Room }>(`/rooms/${room.id}`, host.cookie);
    expect(after.data.room.memberCount).toBe(3);
  });

  it("counts a double submit once, and one leave ends the membership", async () => {
    const host = await h.createGuest("Host");
    const room = await createRoom(host.cookie);
    const guest = await h.createGuest("Double");

    const results = await Promise.all([1, 2, 3, 4].map(() => call(`/rooms/${room.id}/join`, guest.cookie, "POST", {})));
    expect(results.every((r) => r.status < 300)).toBe(true);
    expect((await call<{ room: Room }>(`/rooms/${room.id}`, host.cookie)).data.room.memberCount).toBe(2);

    expect((await call(`/rooms/${room.id}/leave`, guest.cookie, "POST")).status).toBeLessThan(300);
    expect((await call(`/rooms/${room.id}/leave`, guest.cookie, "POST")).error?.code).toBe(ERROR_CODES.NOT_ROOM_MEMBER);
    expect((await call<{ room: Room }>(`/rooms/${room.id}`, host.cookie)).data.room.memberCount).toBe(1);
  });
});

describe("Asking for the last mic at the same time", () => {
  it("gives it to exactly one person", async () => {
    const host = await h.createGuest("Host");
    const room = await createRoom(host.cookie, { maxSingers: 1 });
    const others = await Promise.all([1, 2, 3].map((n) => h.createGuest(`Singer ${n}`)));
    for (const o of others) await h.joinRest(room.id, o.cookie);
    const sockets = await Promise.all([host, ...others].map((u) => h.joinedSocket(u.cookie, room.id)));

    for (const socket of sockets) socket.emit(SOCKET_EVENTS.MIC_REQUEST, { roomId: room.id });
    await new Promise((resolve) => setTimeout(resolve, 600));

    const synced = nextEvent(sockets[0]!, SOCKET_EVENTS.MIC_STATE);
    sockets[0]!.emit(SOCKET_EVENTS.MIC_SYNC, { roomId: room.id });
    expect((await synced).singers).toHaveLength(1);
  });
});

describe("Removing someone from a room", () => {
  it("updates everyone's listener list right away", async () => {
    const host = await h.createGuest("Host");
    const room = await createRoom(host.cookie);
    const guest = await h.createGuest("Kicked");
    await h.joinRest(room.id, guest.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const guestSocket = await h.joinedSocket(guest.cookie, room.id);

    const presence = nextEventMatching(hostSocket, SOCKET_EVENTS.ROOM_PRESENCE, (p) => p.listeners.length === 1);
    const kicked = nextEvent(guestSocket, SOCKET_EVENTS.ROOM_KICKED);
    hostSocket.emit(SOCKET_EVENTS.USER_KICK, { roomId: room.id, userId: guest.userId });

    await kicked;
    expect((await presence).listeners.map((l) => l.id)).toEqual([host.userId]);
  });
});

describe("A song ending while the host is away", () => {
  it("lets listeners move on only once the song is really over", async () => {
    const host = await h.createGuest("Host");
    const room = await createRoom(host.cookie); // host-only playback control
    const listener = await h.createGuest("Listener");
    await h.joinRest(room.id, listener.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const listenerSocket = await h.joinedSocket(listener.cookie, room.id);

    const started = nextEventMatching(listenerSocket, SOCKET_EVENTS.PLAYBACK_STATE, (s) => s.trackId === "track_1");
    hostSocket.emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId: room.id, trackId: "track_1" });
    const state = await started;
    hostSocket.emit(SOCKET_EVENTS.QUEUE_ADD, { roomId: room.id, trackId: "track_2" });
    await nextEventMatching(listenerSocket, SOCKET_EVENTS.QUEUE_UPDATED, (q) => q.queue.length === 1);
    hostSocket.disconnect(); // the host's tab is asleep

    // Too early: a listener can't skip by claiming the song ended.
    listenerSocket.emit(SOCKET_EVENTS.NEXT, { roomId: room.id, fromVersion: state.version, ended: true });
    expect(await receivesWithin(listenerSocket, SOCKET_EVENTS.PLAYBACK_STATE, 500)).toBe(false);

    // A plain skip still needs control.
    const refused = nextEvent(listenerSocket, SOCKET_EVENTS.ERROR);
    listenerSocket.emit(SOCKET_EVENTS.NEXT, { roomId: room.id, fromVersion: state.version });
    expect((await refused).code).toBe(ERROR_CODES.NOT_ROOM_HOST);

    // Wind the server's clock past the end of the 3:34 song.
    const key = `room:${room.id}:playback`;
    const stored = JSON.parse((await h.redis().get(key))!) as PlaybackState;
    await h.redis().set(key, JSON.stringify({ ...stored, serverTimestamp: stored.serverTimestamp - 214_000 }));

    const advanced = nextEventMatching(listenerSocket, SOCKET_EVENTS.PLAYBACK_STATE, (s) => s.trackId === "track_2");
    listenerSocket.emit(SOCKET_EVENTS.NEXT, { roomId: room.id, fromVersion: state.version, ended: true });
    expect((await advanced).version).toBe(state.version + 1);
  });
});

describe("Auth rate limits", () => {
  const login = (email: string, ip: string, password = "wrong-password") =>
    call("/auth/login", "", "POST", { email, password }, ip);

  it("stops guessing from one address after 10 wrong passwords, without locking the owner out", async () => {
    const email = `target${Date.now().toString(36)}@example.com`;
    await h.registerUser({ displayName: "Target", email, password: "right-password-1" }, "192.0.2.1");

    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await login(email, "192.0.2.10")).status).toBe(401);
    }
    expect((await login(email, "192.0.2.10")).error?.code).toBe(ERROR_CODES.RATE_LIMITED);
    // Even the right password waits out the lock from that address...
    expect((await login(email, "192.0.2.10", "right-password-1")).status).toBe(429);
    // ...but the owner, somewhere else, still signs in.
    expect((await login(email, "192.0.2.11", "right-password-1")).status).toBe(200);
  });

  it("lets many people on one wifi sign in, but caps scripted floods", async () => {
    const statuses: number[] = [];
    for (let n = 0; n < 31; n++) statuses.push((await login(`person${n}-${Date.now().toString(36)}@example.com`, "203.0.113.7")).status);
    expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(statuses[30]).toBe(429);
  }, 30_000);

  it("a successful sign-in clears earlier wrong guesses", async () => {
    const email = `forgetful${Date.now().toString(36)}@example.com`;
    await h.registerUser({ displayName: "Forgetful", email, password: "right-password-1" }, "198.18.0.1");
    for (let n = 0; n < 9; n++) await login(email, "198.18.0.2");
    expect((await login(email, "198.18.0.3", "right-password-1")).status).toBe(200);
    expect((await login(email, "198.18.0.4")).status).toBe(401); // counter restarted, not locked
  });
});

describe("Sign-ups racing for one username", () => {
  it("gives both accounts a handle instead of failing one", async () => {
    const stamp = Date.now().toString(36);
    const emails = ["gmail.com", "yahoo.com", "outlook.com"].map((domain) => `racer${stamp}@${domain}`);
    const results = await Promise.all(
      emails.map((email, index) =>
        h.registerUser({ displayName: "Racer", email, password: "a-long-password-1" }, `198.51.100.${index + 1}`),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    const usernames = results.map((r) => r.user.username);
    expect(new Set(usernames).size).toBe(3);
    expect(usernames).toContain(`racer${stamp}`);
  });
});
