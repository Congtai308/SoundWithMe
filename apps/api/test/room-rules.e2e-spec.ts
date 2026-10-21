import { ERROR_CODES, SOCKET_EVENTS } from "@soundwithme/constants";
import type { FriendsOverview, NotificationsPage, PlaylistWithItems, Room } from "@soundwithme/types";
import { RealtimeHarness, expectError, nextEvent, nextEventMatching } from "./support/realtime-harness";

/**
 * Room rules, roles and moderation, queue votes, the sing line, friends,
 * notifications and the library — end to end over real HTTP and sockets.
 */
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterEach(() => h.disconnectAll());
afterAll(() => h.stop());

interface CallResult<T> {
  status: number;
  data: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

/** Like h.api, but keeps the status and the error envelope. */
async function call<T>(path: string, cookie: string, method = "GET", body?: unknown): Promise<CallResult<T>> {
  const res = await fetch(`${h.baseUrl}/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { data: T; error?: CallResult<T>["error"] };
  return { status: res.status, data: json.data, error: json.error };
}

const createRoom = (cookie: string, body: Record<string, unknown>) => call<{ room: Room }>("/rooms", cookie, "POST", body);

describe("Room rules (e2e)", () => {
  it("allows one live room per host, again after it ends", async () => {
    const host = await h.createGuest("Host");
    const first = await createRoom(host.cookie, { name: "First", type: "public" });
    expect(first.status).toBe(201);

    const second = await createRoom(host.cookie, { name: "Second", type: "public" });
    expect(second.error?.code).toBe(ERROR_CODES.ROOM_LIMIT_REACHED);
    expect(second.error?.details?.roomId).toBe(first.data.room.id);

    await call(`/rooms/${first.data.room.id}/leave`, host.cookie, "POST");
    const third = await createRoom(host.cookie, { name: "Third", type: "duo", settings: { maxListeners: 80 } });
    expect(third.status).toBe(201);
    expect(third.data.room.settings.maxListeners).toBe(2);
    await call(`/rooms/${third.data.room.id}/leave`, host.cookie, "POST");
  });

  it("hides private rooms behind the invite link or passcode", async () => {
    const host = await h.createGuest("Host");
    const viaPasscode = await h.createGuest("Passcode");
    const viaInvite = await h.createGuest("Invite");
    const { data } = await createRoom(host.cookie, { name: "Secret", type: "private", passcode: "hunter22" });
    const room = data.room;
    expect(room.inviteCode).toEqual(expect.any(String));

    const peek = await call(`/rooms/${room.id}`, viaPasscode.cookie);
    expect(peek.error?.code).toBe(ERROR_CODES.ROOM_LOCKED);
    expect(peek.error?.details?.hasPasscode).toBe(true);

    const wrong = await call(`/rooms/${room.id}/join`, viaPasscode.cookie, "POST", { passcode: "nope1234" });
    expect(wrong.error?.code).toBe(ERROR_CODES.ROOM_PASSCODE_INVALID);
    expect((await call(`/rooms/${room.id}/join`, viaPasscode.cookie, "POST", { passcode: "hunter22" })).status).toBe(201);

    const seen = await call<{ room: Room }>(`/rooms/${room.id}?invite=${room.inviteCode}`, viaInvite.cookie);
    expect(seen.data.room.inviteCode).toBeNull();
    expect((await call(`/rooms/${room.id}/join`, viaInvite.cookie, "POST", { invite: room.inviteCode })).status).toBe(201);

    const listed = await call<{ items: Room[] }>("/rooms?limit=50", viaInvite.cookie);
    expect(listed.data.items.map((r) => r.id)).not.toContain(room.id);
  });

  it("lets only the host's friends into a friends-only room, and notifies them", async () => {
    const host = await h.createGuest("Host");
    const friend = await h.createGuest("Friend");
    const stranger = await h.createGuest("Stranger");
    const me = await call<{ user: { username: string } }>("/users/me", friend.cookie);
    expect((await call("/friends/requests", host.cookie, "POST", { username: me.data.user.username })).status).toBe(201);
    const pending = await call<FriendsOverview>("/friends", friend.cookie);
    await call(`/friends/requests/${pending.data.incoming[0]!.id}/accept`, friend.cookie, "POST");

    const { data } = await createRoom(host.cookie, { name: "Circle", type: "friends" });
    expect((await call(`/rooms/${data.room.id}/join`, friend.cookie, "POST")).status).toBe(201);
    expect((await call(`/rooms/${data.room.id}/join`, stranger.cookie, "POST")).error?.code).toBe(ERROR_CODES.ROOM_FRIENDS_ONLY);

    const bell = await call<NotificationsPage>("/notifications", friend.cookie);
    expect(bell.data.items.map((n) => n.type)).toEqual(expect.arrayContaining(["friend_request", "friend_room_started"]));
  });
});

describe("Roles & moderation (e2e)", () => {
  it("DJs control playback; muted people can't chat; removed people can't return", async () => {
    const host = await h.createGuest("Host");
    const dj = await h.createGuest("DJ");
    const guest = await h.createGuest("Guest");
    const room = await h.createRoom(host.cookie);
    await h.joinRest(room.id, dj.cookie);
    await h.joinRest(room.id, guest.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const djSocket = await h.joinedSocket(dj.cookie, room.id);
    const guestSocket = await h.joinedSocket(guest.cookie, room.id);

    djSocket.emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId: room.id, trackId: "track_1" });
    await expectError(djSocket, ERROR_CODES.NOT_ROOM_HOST);
    const promoted = nextEventMatching(djSocket, SOCKET_EVENTS.ROOM_UPDATED, ({ room: r }) => r.djIds.includes(dj.userId));
    hostSocket.emit(SOCKET_EVENTS.ROOM_SET_DJ, { roomId: room.id, userId: dj.userId, dj: true });
    await promoted;
    const playing = nextEventMatching(guestSocket, SOCKET_EVENTS.PLAYBACK_STATE, (s) => s.trackId === "track_1");
    djSocket.emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId: room.id, trackId: "track_1" });
    await playing;

    const muted = nextEventMatching(guestSocket, SOCKET_EVENTS.ROOM_UPDATED, ({ room: r }) => r.mutedUserIds.includes(guest.userId));
    hostSocket.emit(SOCKET_EVENTS.ROOM_MUTE_USER, { roomId: room.id, userId: guest.userId, muted: true });
    await muted;
    guestSocket.emit(SOCKET_EVENTS.CHAT_MESSAGE, { roomId: room.id, content: "hi" });
    await expectError(guestSocket, ERROR_CODES.CHAT_MUTED);

    const kicked = nextEvent(guestSocket, SOCKET_EVENTS.ROOM_KICKED);
    hostSocket.emit(SOCKET_EVENTS.USER_KICK, { roomId: room.id, userId: guest.userId });
    await kicked;
    expect((await call(`/rooms/${room.id}/join`, guest.cookie, "POST")).error?.code).toBe(ERROR_CODES.ROOM_BANNED);
  });

  it("hands the room over; the new host is bound by the one-room rule", async () => {
    const host = await h.createGuest("Host");
    const heir = await h.createGuest("Heir");
    const room = await h.createRoom(host.cookie);
    await h.joinRest(room.id, heir.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const heirSocket = await h.joinedSocket(heir.cookie, room.id);

    const changed = nextEvent(heirSocket, SOCKET_EVENTS.HOST_CHANGED);
    hostSocket.emit(SOCKET_EVENTS.HOST_TRANSFER, { roomId: room.id, newHostId: heir.userId });
    expect((await changed).newHostId).toBe(heir.userId);
    expect((await createRoom(heir.cookie, { name: "Another", type: "public" })).error?.code).toBe(ERROR_CODES.ROOM_LIMIT_REACHED);
    const fresh = await createRoom(host.cookie, { name: "Fresh start", type: "public" });
    expect(fresh.status).toBe(201);
    await call(`/rooms/${fresh.data.room.id}/leave`, host.cookie, "POST");
  });
});

describe("Votes (e2e)", () => {
  it("plays the most-wanted queued song first, and a half-room skip vote moves on", async () => {
    const host = await h.createGuest("Host");
    const a = await h.createGuest("A");
    const b = await h.createGuest("B");
    const room = await h.createRoom(host.cookie);
    await h.joinRest(room.id, a.cookie);
    await h.joinRest(room.id, b.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const aSocket = await h.joinedSocket(a.cookie, room.id);
    const bSocket = await h.joinedSocket(b.cookie, room.id);

    const started = nextEventMatching(hostSocket, SOCKET_EVENTS.PLAYBACK_STATE, (s) => s.trackId === "track_1");
    hostSocket.emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId: room.id, trackId: "track_1" });
    await started;
    const queued = nextEventMatching(aSocket, SOCKET_EVENTS.QUEUE_UPDATED, ({ queue }) => queue.length === 2);
    hostSocket.emit(SOCKET_EVENTS.QUEUE_ADD_MANY, { roomId: room.id, trackIds: ["track_2", "track_3"] });
    const { queue } = await queued;
    const later = queue[1]!;

    const reordered = nextEventMatching(bSocket, SOCKET_EVENTS.QUEUE_UPDATED, ({ queue: q }) => q[0]?.id === later.id);
    aSocket.emit(SOCKET_EVENTS.QUEUE_VOTE, { roomId: room.id, queueItemId: later.id, value: 1 });
    expect((await reordered).queue[0]!.score).toBe(1);

    const oneVote = nextEventMatching(hostSocket, SOCKET_EVENTS.SKIP_STATE, (s) => s.voterIds.length === 1);
    aSocket.emit(SOCKET_EVENTS.SKIP_VOTE, { roomId: room.id, vote: true });
    expect((await oneVote).needed).toBe(2);
    const skipped = nextEventMatching(hostSocket, SOCKET_EVENTS.PLAYBACK_STATE, (s) => s.trackId === later.trackId);
    bSocket.emit(SOCKET_EVENTS.SKIP_VOTE, { roomId: room.id, vote: true });
    await skipped;
  });
});

describe("Sing line (e2e)", () => {
  it("hands a freed mic to the front of the line with MIC_TURN", async () => {
    const host = await h.createGuest("Host");
    const waiter = await h.createGuest("Waiter");
    const room = await h.createRoom(host.cookie, { maxSingers: 1 });
    await h.joinRest(room.id, waiter.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const waiterSocket = await h.joinedSocket(waiter.cookie, room.id);

    const singing = nextEventMatching(hostSocket, SOCKET_EVENTS.MIC_STATE, ({ singers }) => singers.length === 1);
    hostSocket.emit(SOCKET_EVENTS.MIC_REQUEST, { roomId: room.id });
    await singing;
    waiterSocket.emit(SOCKET_EVENTS.MIC_REQUEST, { roomId: room.id });
    await expectError(waiterSocket, ERROR_CODES.MIC_FULL);

    const lined = nextEventMatching(hostSocket, SOCKET_EVENTS.MIC_STATE, ({ line }) => line.length === 1);
    waiterSocket.emit(SOCKET_EVENTS.MIC_LINE_JOIN, { roomId: room.id });
    expect((await lined).line[0]!.userId).toBe(waiter.userId);

    const turn = nextEvent(waiterSocket, SOCKET_EVENTS.MIC_TURN);
    const handed = nextEventMatching(hostSocket, SOCKET_EVENTS.MIC_STATE, ({ singers }) => singers[0]?.userId === waiter.userId);
    hostSocket.emit(SOCKET_EVENTS.MIC_RELEASE, { roomId: room.id });
    await turn;
    expect((await handed).line).toEqual([]);
  });
});

describe("Library (e2e)", () => {
  it("likes songs idempotently and keeps playlists private", async () => {
    const owner = await h.createGuest("Owner");
    const other = await h.createGuest("Other");
    await call("/library/favorites/track_1", owner.cookie, "PUT");
    await call("/library/favorites/track_1", owner.cookie, "PUT");
    const liked = await call<{ trackIds: string[] }>("/library/favorites/ids", owner.cookie);
    expect(liked.data.trackIds).toEqual(["track_1"]);

    const created = await call<{ playlist: { id: string } }>("/library/playlists", owner.cookie, "POST", { name: "Chill" });
    const id = created.data.playlist.id;
    await call(`/library/playlists/${id}/tracks`, owner.cookie, "POST", { trackId: "track_2" });
    const withTwo = await call<{ playlist: PlaylistWithItems }>(`/library/playlists/${id}/tracks`, owner.cookie, "POST", { trackId: "track_3" });
    expect(withTwo.data.playlist.trackCount).toBe(2);
    expect((await call(`/library/playlists/${id}`, other.cookie)).error?.code).toBe(ERROR_CODES.PLAYLIST_NOT_FOUND);
  });
});
