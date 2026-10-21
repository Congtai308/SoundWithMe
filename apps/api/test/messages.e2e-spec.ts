import { ERROR_CODES, SOCKET_EVENTS } from "@soundwithme/constants";
import type { Conversation, DirectMessage, DirectMessagesPage, Room } from "@soundwithme/types";
import { RealtimeHarness, nextEvent, receivesWithin } from "./support/realtime-harness";

/** Direct messages: friends only, text / song / room invite, live delivery and read receipts. */
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterEach(() => h.disconnectAll());
afterAll(() => h.stop());

async function call<T>(path: string, cookie: string, method = "GET", body?: unknown) {
  const res = await fetch(`${h.baseUrl}/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { data: T; error?: { code: string } };
  return { status: res.status, data: json.data, error: json.error };
}

async function befriend(a: { cookie: string }, b: { cookie: string }) {
  const me = await call<{ user: { username: string } }>("/users/me", b.cookie);
  await call("/friends/requests", a.cookie, "POST", { username: me.data.user.username });
  const pending = await call<{ incoming: { id: string }[] }>("/friends", b.cookie);
  await call(`/friends/requests/${pending.data.incoming[0]!.id}/accept`, b.cookie, "POST");
}

const send = (from: { cookie: string }, toId: string, body: unknown) =>
  call<{ message: DirectMessage }>(`/messages/with/${toId}`, from.cookie, "POST", body);

describe("Direct messages", () => {
  it("only lets friends message each other", async () => {
    const alice = await h.createGuest("Alice");
    const stranger = await h.createGuest("Stranger");
    const res = await send(stranger, alice.userId, { kind: "text", content: "hi" });
    expect(res.error?.code).toBe(ERROR_CODES.NOT_FRIENDS);
    // Nor yourself.
    expect((await send(alice, alice.userId, { kind: "text", content: "me" })).error?.code).toBe(ERROR_CODES.NOT_FRIENDS);
  });

  it("delivers live to both sides, lists the inbox with unread counts, and marks read", async () => {
    const alice = await h.createGuest("Alice");
    const bob = await h.createGuest("Bob");
    await befriend(alice, bob);
    const aliceSocket = await h.connected(h.connect(alice.cookie));
    const bobSocket = await h.connected(h.connect(bob.cookie));

    const bobGets = nextEvent(bobSocket, SOCKET_EVENTS.DM_MESSAGE);
    const aliceEcho = nextEvent(aliceSocket, SOCKET_EVENTS.DM_MESSAGE);
    const sent = await send(alice, bob.userId, { kind: "text", content: "  hello <b>bob</b>\u0007 " });
    expect(sent.status).toBe(201);
    expect(sent.data.message.content).toBe("hello <b>bob</b>"); // stored as text, control characters stripped
    expect((await bobGets).id).toBe(sent.data.message.id);
    expect((await aliceEcho).id).toBe(sent.data.message.id);

    await send(alice, bob.userId, { kind: "track", trackId: "track_1", content: "listen to this" });
    const inbox = await call<{ conversations: Conversation[]; unread: number }>("/messages/conversations", bob.cookie);
    expect(inbox.data.unread).toBe(2);
    expect(inbox.data.conversations).toHaveLength(1);
    expect(inbox.data.conversations[0]!.user.id).toBe(alice.userId);
    expect(inbox.data.conversations[0]!.unread).toBe(2);
    expect(inbox.data.conversations[0]!.lastMessage.track?.id).toBe("track_1");

    const receipt = nextEvent(aliceSocket, SOCKET_EVENTS.DM_READ);
    await call(`/messages/with/${alice.userId}/read`, bob.cookie, "POST");
    expect((await receipt).readerId).toBe(bob.userId);
    const after = await call<{ unread: number }>("/messages/conversations", bob.cookie);
    expect(after.data.unread).toBe(0);

    const history = await call<DirectMessagesPage>(`/messages/with/${bob.userId}?limit=1`, alice.cookie);
    expect(history.data.items).toHaveLength(1);
    expect(history.data.items[0]!.kind).toBe("track");
    const older = await call<DirectMessagesPage>(`/messages/with/${bob.userId}?cursor=${history.data.nextCursor}`, alice.cookie);
    expect(older.data.items.map((m) => m.kind)).toEqual(["text"]);
  });

  it("never shows a conversation to anyone else", async () => {
    const alice = await h.createGuest("Alice");
    const bob = await h.createGuest("Bob");
    const eve = await h.createGuest("Eve");
    await befriend(alice, bob);
    await send(alice, bob.userId, { kind: "text", content: "secret" });
    const eveSocket = await h.connected(h.connect(eve.cookie));
    const leaked = receivesWithin(eveSocket, SOCKET_EVENTS.DM_MESSAGE, 400);
    await send(bob, alice.userId, { kind: "text", content: "also secret" });
    expect(await leaked).toBe(false);
    // Eve's own view of "a conversation with Alice" is hers, and empty.
    const view = await call<DirectMessagesPage>(`/messages/with/${alice.userId}`, eve.cookie);
    expect(view.data.items).toHaveLength(0);
  });

  it("shares rooms with the same rules as invites", async () => {
    const host = await h.createGuest("Host");
    const friend = await h.createGuest("Friend");
    const member = await h.createGuest("Member");
    await befriend(host, friend);
    await befriend(member, friend);
    const created = await call<{ room: Room }>("/rooms", host.cookie, "POST", { name: "Secret", type: "private" });
    const room = created.data.room;

    const shared = await send(host, friend.userId, { kind: "room", roomId: room.id });
    expect(shared.data.message.room).toEqual({ id: room.id, name: "Secret", link: `/room/${room.id}?invite=${room.inviteCode}` });
    // Not in the room: can't share it.
    expect((await send(member, friend.userId, { kind: "room", roomId: room.id })).status).toBe(403);
    // The friend uses the link.
    expect((await call(`/rooms/${room.id}/join`, friend.cookie, "POST", { invite: room.inviteCode })).status).toBe(201);
  });

  it("refuses songs that don't exist", async () => {
    const alice = await h.createGuest("Alice");
    const bob = await h.createGuest("Bob");
    await befriend(alice, bob);
    expect((await send(alice, bob.userId, { kind: "track", trackId: "no_such_track" })).error?.code).toBe(
      ERROR_CODES.TRACK_NOT_FOUND,
    );
  });
});
