import { ERROR_CODES, SOCKET_EVENTS } from "@soundwithme/constants";
import type { PlaybackState, Room } from "@soundwithme/types";
import { RealtimeHarness, expectError, nextEvent, receivesWithin } from "./support/realtime-harness";

/**
 * End-to-end: real AppModule, real Socket.IO server with the Redis adapter,
 * real socket.io-client connections authenticated by the same httpOnly
 * cookie the web app uses.
 */
const TRACK_ID = "track_1";
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterEach(() => h.disconnectAll());
afterAll(() => h.stop());

describe("PlaybackGateway (e2e)", () => {
  it("rejects a handshake without a valid session", async () => {
    const socket = h.connect();
    const error = await new Promise<Error>((resolve) => socket.once("connect_error", resolve));
    expect(error.message).toBe(ERROR_CODES.UNAUTHENTICATED);

    const forged = h.connect("swm_access_token=not-a-real-jwt");
    const forgedError = await new Promise<Error>((resolve) => forged.once("connect_error", resolve));
    expect(forgedError.message).toBe(ERROR_CODES.UNAUTHENTICATED);
  });

  it("lets members join, refuses outsiders, and syncs the full flow to every listener", async () => {
    const host = await h.createGuest("Host");
    const member = await h.createGuest("Member");
    const outsider = await h.createGuest("Outsider");
    const room = await h.createRoom(host.cookie);
    await h.api(`/rooms/${room.id}/join`, { method: "POST", cookie: member.cookie });

    const hostSocket = await h.joinedSocket(host.cookie, room.id);

    // Outsider (never joined over REST) cannot subscribe to the room.
    const outsiderSocket = await h.connected(h.connect(outsider.cookie));
    outsiderSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomId: room.id });
    await expectError(outsiderSocket, ERROR_CODES.NOT_ROOM_MEMBER);

    // Member joining is announced to the host.
    const memberJoinSeenByHost = nextEvent(hostSocket, SOCKET_EVENTS.ROOM_JOIN);
    const memberSocket = await h.joinedSocket(member.cookie, room.id);
    expect(await memberJoinSeenByHost).toEqual({ roomId: room.id, userId: member.userId });

    // CHANGE_TRACK reaches everyone with version 1 and a server timestamp.
    const before = Date.now();
    const hostSees = nextEvent(hostSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    const memberSees = nextEvent(memberSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    hostSocket.emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId: room.id, trackId: TRACK_ID });
    const started: PlaybackState = await memberSees;
    expect(await hostSees).toEqual(started);
    expect(started).toMatchObject({ roomId: room.id, trackId: TRACK_ID, isPlaying: true, positionMs: 0, version: 1 });
    expect(started.serverTimestamp).toBeGreaterThanOrEqual(before);

    // Track change is the one thing persisted to MongoDB.
    const { data: roomAfter } = await h.api<{ room: Room }>(`/rooms/${room.id}`, { cookie: host.cookie });
    expect(roomAfter.room.currentTrackId).toBe(TRACK_ID);

    // PAUSE → v2, SEEK → v3, PLAY → v4, each broadcast to the member.
    const paused = nextEvent(memberSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    hostSocket.emit(SOCKET_EVENTS.PAUSE, { roomId: room.id, positionMs: 42_000 });
    expect(await paused).toMatchObject({ isPlaying: false, positionMs: 42_000, version: 2 });

    const seeked = nextEvent(memberSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    hostSocket.emit(SOCKET_EVENTS.SEEK, { roomId: room.id, positionMs: 90_000 });
    expect(await seeked).toMatchObject({ isPlaying: false, positionMs: 90_000, version: 3 });

    const resumed = nextEvent(memberSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    hostSocket.emit(SOCKET_EVENTS.PLAY, { roomId: room.id, positionMs: 90_000 });
    expect(await resumed).toMatchObject({ isPlaying: true, positionMs: 90_000, version: 4 });

    // SYNC_REQUEST returns the latest state to the requester only.
    const synced = nextEvent(memberSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    const hostAlsoGot = receivesWithin(hostSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    memberSocket.emit(SOCKET_EVENTS.SYNC_REQUEST, { roomId: room.id });
    expect((await synced).version).toBe(4);
    expect(await hostAlsoGot).toBe(false);

    // A late joiner immediately receives the current state.
    const lateSocket = await h.connected(h.connect(member.cookie));
    const lateState = nextEvent(lateSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    lateSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomId: room.id });
    expect((await lateState).version).toBe(4);
  });

  it("enforces host-only control and never broadcasts a rejected action", async () => {
    const host = await h.createGuest("Host");
    const member = await h.createGuest("Member");
    const room = await h.createRoom(host.cookie, { whoCanControlPlayback: "host" });
    await h.api(`/rooms/${room.id}/join`, { method: "POST", cookie: member.cookie });

    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const memberSocket = await h.joinedSocket(member.cookie, room.id);

    const hostGotState = receivesWithin(hostSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    memberSocket.emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId: room.id, trackId: TRACK_ID });
    await expectError(memberSocket, ERROR_CODES.NOT_ROOM_HOST);
    expect(await hostGotState).toBe(false);
  });

  it("lets any member control playback when the room allows everyone", async () => {
    const host = await h.createGuest("Host");
    const member = await h.createGuest("Member");
    const room = await h.createRoom(host.cookie, { whoCanControlPlayback: "everyone" });
    await h.api(`/rooms/${room.id}/join`, { method: "POST", cookie: member.cookie });

    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const memberSocket = await h.joinedSocket(member.cookie, room.id);

    const hostSees = nextEvent(hostSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    memberSocket.emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId: room.id, trackId: TRACK_ID });
    expect(await hostSees).toMatchObject({ trackId: TRACK_ID, version: 1 });
  });

  it("reports validation, unknown-track, sync-without-join and rate-limit errors", async () => {
    const host = await h.createGuest("Host");
    const room = await h.createRoom(host.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);

    hostSocket.emit(SOCKET_EVENTS.SEEK, { roomId: room.id, positionMs: -10 });
    await expectError(hostSocket, ERROR_CODES.VALIDATION_ERROR);

    hostSocket.emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId: room.id, trackId: "track_does_not_exist" });
    await expectError(hostSocket, ERROR_CODES.TRACK_NOT_FOUND);

    const otherSocket = await h.connected(h.connect(host.cookie));
    otherSocket.emit(SOCKET_EVENTS.SYNC_REQUEST, { roomId: room.id });
    await expectError(otherSocket, ERROR_CODES.NOT_ROOM_MEMBER);

    hostSocket.emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId: room.id, trackId: TRACK_ID });
    await nextEvent(hostSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    const rateLimited = expectError(hostSocket, ERROR_CODES.RATE_LIMITED);
    for (let i = 0; i < 25; i++) {
      hostSocket.emit(SOCKET_EVENTS.SEEK, { roomId: room.id, positionMs: i * 1_000 });
    }
    await rateLimited;
  });

  it("announces ROOM_LEAVE only when a user's last socket in the room disconnects", async () => {
    const host = await h.createGuest("Host");
    const member = await h.createGuest("Member");
    const room = await h.createRoom(host.cookie);
    await h.api(`/rooms/${room.id}/join`, { method: "POST", cookie: member.cookie });

    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const memberTabA = await h.joinedSocket(member.cookie, room.id);
    const memberTabB = await h.joinedSocket(member.cookie, room.id);

    const prematureLeave = receivesWithin(hostSocket, SOCKET_EVENTS.ROOM_LEAVE, 600);
    memberTabA.disconnect();
    expect(await prematureLeave).toBe(false);

    const leave = nextEvent(hostSocket, SOCKET_EVENTS.ROOM_LEAVE);
    memberTabB.disconnect();
    expect(await leave).toEqual({ roomId: room.id, userId: member.userId });
  });
});
