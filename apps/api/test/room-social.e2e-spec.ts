import { ERROR_CODES, SOCKET_EVENTS } from "@soundwithme/constants";
import type { ChatMessage, PlaybackState, QueueItem } from "@soundwithme/types";
import {
  RealtimeHarness,
  expectError,
  nextEvent,
  nextEventMatching,
  receivesWithin,
} from "./support/realtime-harness";

/** Queue, skip/auto-advance, chat, reactions and presence — end to end over real sockets. */
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterEach(() => h.disconnectAll());
afterAll(() => h.stop());

describe("Queue + NEXT (e2e)", () => {
  it("sends the current queue on join and broadcasts additions to everyone", async () => {
    const host = await h.createGuest("Host");
    const member = await h.createGuest("Member");
    const room = await h.createRoom(host.cookie, { whoCanAddSongs: "everyone" });
    await h.joinRest(room.id, member.cookie);

    const hostSocket = await h.connected(h.connect(host.cookie));
    const initialQueue = nextEvent(hostSocket, SOCKET_EVENTS.QUEUE_UPDATED);
    hostSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomId: room.id });
    expect((await initialQueue).queue).toEqual([]);

    const memberSocket = await h.joinedSocket(member.cookie, room.id);
    const hostSees = nextEvent(hostSocket, SOCKET_EVENTS.QUEUE_UPDATED);
    memberSocket.emit(SOCKET_EVENTS.QUEUE_ADD, { roomId: room.id, trackId: "track_2" });
    const { queue } = await hostSees;

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject<Partial<QueueItem>>({
      trackId: "track_2",
      addedBy: member.userId,
      addedByName: "Member",
      status: "queued",
    });
    expect(queue[0]!.track).toMatchObject({ title: "Late Night Drive", artistName: "The Night Owls" });
  });

  it("enforces whoCanAddSongs and lets only the host or the adder remove an item", async () => {
    const host = await h.createGuest("Host");
    const adder = await h.createGuest("Adder");
    const other = await h.createGuest("Other");
    // One live room per host: the host-only room gets its own host.
    const otherHost = await h.createGuest("Other host");
    const hostOnly = await h.createRoom(otherHost.cookie, { whoCanAddSongs: "host" });
    await h.joinRest(hostOnly.id, adder.cookie);
    const adderInHostOnly = await h.joinedSocket(adder.cookie, hostOnly.id);
    adderInHostOnly.emit(SOCKET_EVENTS.QUEUE_ADD, { roomId: hostOnly.id, trackId: "track_1" });
    await expectError(adderInHostOnly, ERROR_CODES.NOT_ROOM_HOST);

    const open = await h.createRoom(host.cookie, { whoCanAddSongs: "everyone" });
    await h.joinRest(open.id, adder.cookie);
    await h.joinRest(open.id, other.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, open.id);
    const adderSocket = await h.joinedSocket(adder.cookie, open.id);
    const otherSocket = await h.joinedSocket(other.cookie, open.id);

    const added = nextEvent(adderSocket, SOCKET_EVENTS.QUEUE_UPDATED);
    adderSocket.emit(SOCKET_EVENTS.QUEUE_ADD, { roomId: open.id, trackId: "track_3" });
    const itemId = (await added).queue[0]!.id;

    otherSocket.emit(SOCKET_EVENTS.QUEUE_REMOVE, { roomId: open.id, queueItemId: itemId });
    await expectError(otherSocket, ERROR_CODES.FORBIDDEN);

    const removed = nextEvent(hostSocket, SOCKET_EVENTS.QUEUE_UPDATED);
    hostSocket.emit(SOCKET_EVENTS.QUEUE_REMOVE, { roomId: open.id, queueItemId: itemId });
    expect((await removed).queue).toEqual([]);

    hostSocket.emit(SOCKET_EVENTS.QUEUE_ADD, { roomId: open.id, trackId: "track_missing" });
    await expectError(hostSocket, ERROR_CODES.TRACK_NOT_FOUND);
  });

  it("adds several songs at once, in order, skipping unknown tracks", async () => {
    const host = await h.createGuest("Host");
    const room = await h.createRoom(host.cookie, {});
    const hostSocket = await h.joinedSocket(host.cookie, room.id);

    const added = nextEventMatching(hostSocket, SOCKET_EVENTS.QUEUE_UPDATED, ({ queue }) => queue.length > 0);
    hostSocket.emit(SOCKET_EVENTS.QUEUE_ADD_MANY, {
      roomId: room.id,
      trackIds: ["track_3", "track_missing", "track_1", "track_2"],
    });
    expect((await added).queue.map((item) => item.trackId)).toEqual(["track_3", "track_1", "track_2"]);

    // One batch is one rate-limit hit (10 per 10 s): 8 more batches of 2 = 16 songs go through.
    const many = nextEventMatching(hostSocket, SOCKET_EVENTS.QUEUE_UPDATED, ({ queue }) => queue.length === 3 + 8 * 2);
    for (let i = 0; i < 8; i++) {
      hostSocket.emit(SOCKET_EVENTS.QUEUE_ADD_MANY, { roomId: room.id, trackIds: ["track_1", "track_2"] });
    }
    expect((await many).queue).toHaveLength(19);

    hostSocket.emit(SOCKET_EVENTS.QUEUE_ADD_MANY, { roomId: room.id, trackIds: ["track_missing"] });
    await expectError(hostSocket, ERROR_CODES.TRACK_NOT_FOUND);
  });

  it("advances exactly once when several clients report the same track ending", async () => {
    const host = await h.createGuest("Host");
    const member = await h.createGuest("Member");
    const room = await h.createRoom(host.cookie, { whoCanControlPlayback: "everyone" });
    await h.joinRest(room.id, member.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const memberSocket = await h.joinedSocket(member.cookie, room.id);

    const started = nextEvent(memberSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    hostSocket.emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId: room.id, trackId: "track_1" });
    const v1: PlaybackState = await started;

    // Wait until the member has seen both additions, so no add broadcast is in flight.
    const bothQueued = nextEventMatching(memberSocket, SOCKET_EVENTS.QUEUE_UPDATED, ({ queue }) => queue.length === 2);
    hostSocket.emit(SOCKET_EVENTS.QUEUE_ADD, { roomId: room.id, trackId: "track_2" });
    hostSocket.emit(SOCKET_EVENTS.QUEUE_ADD, { roomId: room.id, trackId: "track_3" });
    expect((await bothQueued).queue.map((item) => item.trackId)).toEqual(["track_2", "track_3"]);

    // Both clients hit "ended" for v1 at the same moment.
    const advanced = nextEvent(memberSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    const queueAfter = nextEventMatching(memberSocket, SOCKET_EVENTS.QUEUE_UPDATED, ({ queue }) => queue.length < 2);
    hostSocket.emit(SOCKET_EVENTS.NEXT, { roomId: room.id, fromVersion: v1.version });
    memberSocket.emit(SOCKET_EVENTS.NEXT, { roomId: room.id, fromVersion: v1.version });

    expect(await advanced).toMatchObject({ trackId: "track_2", version: v1.version + 1, positionMs: 0 });
    expect((await queueAfter).queue.map((item) => item.trackId)).toEqual(["track_3"]);
    // The second, stale NEXT must not skip track_3.
    expect(await receivesWithin(memberSocket, SOCKET_EVENTS.PLAYBACK_STATE, 600)).toBe(false);
  });

  it("starts the queue in a fresh room with fromVersion 0, but only once", async () => {
    const host = await h.createGuest("Host");
    const room = await h.createRoom(host.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const queued = nextEventMatching(hostSocket, SOCKET_EVENTS.QUEUE_UPDATED, ({ queue }) => queue.length === 2);
    hostSocket.emit(SOCKET_EVENTS.QUEUE_ADD, { roomId: room.id, trackId: "track_1" });
    hostSocket.emit(SOCKET_EVENTS.QUEUE_ADD, { roomId: room.id, trackId: "track_2" });
    await queued;

    const started = nextEvent(hostSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    hostSocket.emit(SOCKET_EVENTS.NEXT, { roomId: room.id, fromVersion: 0 });
    hostSocket.emit(SOCKET_EVENTS.NEXT, { roomId: room.id, fromVersion: 0 });
    expect(await started).toMatchObject({ trackId: "track_1", version: 1, isPlaying: true });
    expect(await receivesWithin(hostSocket, SOCKET_EVENTS.PLAYBACK_STATE, 600)).toBe(false);
  });

  it("reports QUEUE_EMPTY when there is nothing to skip to", async () => {
    const host = await h.createGuest("Host");
    const room = await h.createRoom(host.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const started = nextEvent(hostSocket, SOCKET_EVENTS.PLAYBACK_STATE);
    hostSocket.emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId: room.id, trackId: "track_1" });
    const state = await started;

    hostSocket.emit(SOCKET_EVENTS.NEXT, { roomId: room.id, fromVersion: state.version });
    await expectError(hostSocket, ERROR_CODES.QUEUE_EMPTY);
  });
});

describe("Chat (e2e)", () => {
  it("broadcasts messages, stores them as plain text and serves paginated history", async () => {
    const host = await h.createGuest("Host");
    const member = await h.createGuest("Member");
    const outsider = await h.createGuest("Outsider");
    const room = await h.createRoom(host.cookie);
    await h.joinRest(room.id, member.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const memberSocket = await h.joinedSocket(member.cookie, room.id);

    const received = nextEvent(hostSocket, SOCKET_EVENTS.CHAT_MESSAGE);
    memberSocket.emit(SOCKET_EVENTS.CHAT_MESSAGE, { roomId: room.id, content: "  <b>hi</b>\u0007 everyone  " });
    const message: ChatMessage = await received;
    expect(message).toMatchObject({ userId: member.userId, authorName: "Member", content: "<b>hi</b> everyone" });

    for (let i = 0; i < 3; i++) {
      const echo = nextEvent(hostSocket, SOCKET_EVENTS.CHAT_MESSAGE);
      hostSocket.emit(SOCKET_EVENTS.CHAT_MESSAGE, { roomId: room.id, content: `message ${i}` });
      await echo;
    }

    const firstPage = await h.api<{ items: ChatMessage[]; nextCursor: string | null }>(
      `/rooms/${room.id}/messages?limit=2`,
      { cookie: member.cookie },
    );
    expect(firstPage.data.items.map((m) => m.content)).toEqual(["message 2", "message 1"]);
    expect(firstPage.data.nextCursor).not.toBeNull();

    const secondPage = await h.api<{ items: ChatMessage[]; nextCursor: string | null }>(
      `/rooms/${room.id}/messages?limit=2&cursor=${firstPage.data.nextCursor}`,
      { cookie: member.cookie },
    );
    expect(secondPage.data.items.map((m) => m.content)).toEqual(["message 0", "<b>hi</b> everyone"]);
    expect(secondPage.data.nextCursor).toBeNull();

    const forbidden = await h.api(`/rooms/${room.id}/messages`, { cookie: outsider.cookie });
    expect(forbidden.res.status).toBe(403);
  });

  it("refuses messages when chat is disabled and rate limits floods", async () => {
    const host = await h.createGuest("Host");
    const quietHost = await h.createGuest("Quiet host");
    const quiet = await h.createRoom(quietHost.cookie, { chatEnabled: false });
    const quietSocket = await h.joinedSocket(quietHost.cookie, quiet.id);
    quietSocket.emit(SOCKET_EVENTS.CHAT_MESSAGE, { roomId: quiet.id, content: "hello?" });
    await expectError(quietSocket, ERROR_CODES.CHAT_DISABLED);

    const loud = await h.createRoom(host.cookie);
    const loudSocket = await h.joinedSocket(host.cookie, loud.id);
    const limited = expectError(loudSocket, ERROR_CODES.RATE_LIMITED);
    for (let i = 0; i < 8; i++) {
      loudSocket.emit(SOCKET_EVENTS.CHAT_MESSAGE, { roomId: loud.id, content: `spam ${i}` });
    }
    await limited;
  });
});

describe("Reactions + presence (e2e)", () => {
  it("broadcasts reactions with the sender's name and rejects unknown emoji", async () => {
    const host = await h.createGuest("Host");
    const member = await h.createGuest("Member");
    const room = await h.createRoom(host.cookie);
    await h.joinRest(room.id, member.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const memberSocket = await h.joinedSocket(member.cookie, room.id);

    const seen = nextEvent(hostSocket, SOCKET_EVENTS.REACTION_SEND);
    memberSocket.emit(SOCKET_EVENTS.REACTION_SEND, { roomId: room.id, emoji: "🔥" });
    expect(await seen).toMatchObject({ roomId: room.id, userId: member.userId, displayName: "Member", emoji: "🔥" });

    memberSocket.emit(SOCKET_EVENTS.REACTION_SEND, { roomId: room.id, emoji: "💩" });
    await expectError(memberSocket, ERROR_CODES.VALIDATION_ERROR);
  });

  it("refuses reactions in rooms that turned them off", async () => {
    const host = await h.createGuest("Host");
    const room = await h.createRoom(host.cookie, { reactionsEnabled: false });
    const socket = await h.joinedSocket(host.cookie, room.id);
    socket.emit(SOCKET_EVENTS.REACTION_SEND, { roomId: room.id, emoji: "❤️" });
    await expectError(socket, ERROR_CODES.REACTIONS_DISABLED);
  });

  it("keeps a de-duplicated live listener list as people join and leave", async () => {
    const host = await h.createGuest("Host");
    const member = await h.createGuest("Member");
    const room = await h.createRoom(host.cookie);
    await h.joinRest(room.id, member.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);

    const hasMember = (listeners: { id: string }[]) => listeners.some((l) => l.id === member.userId);

    const withMember = nextEventMatching(hostSocket, SOCKET_EVENTS.ROOM_PRESENCE, (p) => hasMember(p.listeners));
    const memberTabA = await h.joinedSocket(member.cookie, room.id);
    const names = (await withMember).listeners.map((l) => l.displayName).sort();
    expect(names).toEqual(["Host", "Member"]);

    // A second tab of the same user is not a second listener.
    const memberTabB = await h.joinedSocket(member.cookie, room.id);
    const afterOneTabCloses = nextEvent(hostSocket, SOCKET_EVENTS.ROOM_PRESENCE);
    memberTabA.disconnect();
    expect((await afterOneTabCloses).listeners.map((l) => l.displayName).sort()).toEqual(["Host", "Member"]);

    const afterLastTabCloses = nextEventMatching(hostSocket, SOCKET_EVENTS.ROOM_PRESENCE, (p) => !hasMember(p.listeners));
    memberTabB.disconnect();
    expect((await afterLastTabCloses).listeners.map((l) => l.displayName)).toEqual(["Host"]);
  });
});

describe("Server clock", () => {
  it("exposes the server time for client clock-offset estimation", async () => {
    const before = Date.now();
    const { data } = await h.api<{ now: number }>("/time");
    expect(data.now).toBeGreaterThanOrEqual(before);
    expect(data.now).toBeLessThanOrEqual(Date.now());
  });
});
