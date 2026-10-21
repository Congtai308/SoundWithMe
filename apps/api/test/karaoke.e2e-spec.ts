import { ERROR_CODES, SOCKET_EVENTS } from "@soundwithme/constants";
import { DEFAULT_ROOM_SINGERS, MAX_SINGERS } from "@soundwithme/validation";
import { RealtimeHarness, expectError, nextEvent, nextEventMatching, receivesWithin } from "./support/realtime-harness";

/** Karaoke mics and WebRTC signal relay — end to end over real sockets. */
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterEach(() => h.disconnectAll());
afterAll(() => h.stop());

describe("Karaoke mics (e2e)", () => {
  it("hands out mics, shows them to the room, and frees them on release or tab close", async () => {
    const host = await h.createGuest("Host");
    const singer = await h.createGuest("Singer");
    const room = await h.createRoom(host.cookie);
    await h.joinRest(room.id, singer.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const singerSocket = await h.joinedSocket(singer.cookie, room.id);

    const empty = nextEvent(hostSocket, SOCKET_EVENTS.MIC_STATE);
    hostSocket.emit(SOCKET_EVENTS.MIC_SYNC, { roomId: room.id });
    expect(await empty).toEqual({ roomId: room.id, singers: [], line: [], maxSingers: DEFAULT_ROOM_SINGERS });

    const granted = nextEventMatching(hostSocket, SOCKET_EVENTS.MIC_STATE, ({ singers }) => singers.length === 1);
    singerSocket.emit(SOCKET_EVENTS.MIC_REQUEST, { roomId: room.id });
    expect((await granted).singers).toEqual([{ socketId: singerSocket.id, userId: singer.userId, displayName: "Singer" }]);

    const released = nextEventMatching(hostSocket, SOCKET_EVENTS.MIC_STATE, ({ singers }) => singers.length === 0);
    singerSocket.emit(SOCKET_EVENTS.MIC_RELEASE, { roomId: room.id });
    await released;

    const again = nextEventMatching(hostSocket, SOCKET_EVENTS.MIC_STATE, ({ singers }) => singers.length === 1);
    singerSocket.emit(SOCKET_EVENTS.MIC_REQUEST, { roomId: room.id });
    await again;
    const closed = nextEventMatching(hostSocket, SOCKET_EVENTS.MIC_STATE, ({ singers }) => singers.length === 0);
    singerSocket.disconnect();
    await closed;
  });

  it(`caps the room at its mic setting (${MAX_SINGERS}) and lets only the host close someone else's`, async () => {
    const host = await h.createGuest("Host");
    const room = await h.createRoom(host.cookie, { maxSingers: MAX_SINGERS });
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const sockets = [];
    for (let i = 0; i < MAX_SINGERS + 1; i++) {
      const guest = await h.createGuest(`Singer ${i}`);
      await h.joinRest(room.id, guest.cookie);
      sockets.push(await h.joinedSocket(guest.cookie, room.id));
    }

    const full = nextEventMatching(hostSocket, SOCKET_EVENTS.MIC_STATE, ({ singers }) => singers.length === MAX_SINGERS);
    for (const socket of sockets.slice(0, MAX_SINGERS)) socket.emit(SOCKET_EVENTS.MIC_REQUEST, { roomId: room.id });
    const { singers } = await full;

    const late = sockets[MAX_SINGERS]!;
    late.emit(SOCKET_EVENTS.MIC_REQUEST, { roomId: room.id });
    await expectError(late, ERROR_CODES.MIC_FULL);

    late.emit(SOCKET_EVENTS.MIC_RELEASE, { roomId: room.id, socketId: singers[0]!.socketId });
    await expectError(late, ERROR_CODES.NOT_ROOM_HOST);

    const kicked = nextEventMatching(hostSocket, SOCKET_EVENTS.MIC_STATE, ({ singers: now }) => now.length === MAX_SINGERS - 1);
    hostSocket.emit(SOCKET_EVENTS.MIC_RELEASE, { roomId: room.id, socketId: singers[0]!.socketId });
    expect((await kicked).singers.map((s) => s.socketId)).not.toContain(singers[0]!.socketId);
  });

  it("relays WebRTC signals to a tab in the same room only", async () => {
    const host = await h.createGuest("Host");
    const listener = await h.createGuest("Listener");
    const outsider = await h.createGuest("Outsider");
    const room = await h.createRoom(host.cookie);
    const otherRoom = await h.createRoom(outsider.cookie);
    await h.joinRest(room.id, listener.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const listenerSocket = await h.joinedSocket(listener.cookie, room.id);
    const outsiderSocket = await h.joinedSocket(outsider.cookie, otherRoom.id);

    const signal = { type: "offer" as const, sdp: "v=0 fake" };
    const relayed = nextEvent(hostSocket, SOCKET_EVENTS.RTC_SIGNAL);
    listenerSocket.emit(SOCKET_EVENTS.RTC_SIGNAL, { roomId: room.id, to: hostSocket.id!, channel: "listen", signal });
    expect(await relayed).toEqual({
      roomId: room.id,
      from: listenerSocket.id,
      fromUserId: listener.userId,
      channel: "listen",
      signal,
    });

    // Not a member of `room`: rejected. Aimed across rooms: silently dropped.
    outsiderSocket.emit(SOCKET_EVENTS.RTC_SIGNAL, { roomId: room.id, to: hostSocket.id!, channel: "listen", signal });
    await expectError(outsiderSocket, ERROR_CODES.NOT_ROOM_MEMBER);
    hostSocket.emit(SOCKET_EVENTS.RTC_SIGNAL, { roomId: room.id, to: outsiderSocket.id!, channel: "sing", signal });
    expect(await receivesWithin(outsiderSocket, SOCKET_EVENTS.RTC_SIGNAL, 500)).toBe(false);
  });

  it("relays a singer's voice through the server to listeners who ask for it", async () => {
    const host = await h.createGuest("Singer");
    const listener = await h.createGuest("Listener");
    const bystander = await h.createGuest("Bystander");
    const room = await h.createRoom(host.cookie);
    await h.joinRest(room.id, listener.cookie);
    await h.joinRest(room.id, bystander.cookie);
    const singerSocket = await h.joinedSocket(host.cookie, room.id);
    const listenerSocket = await h.joinedSocket(listener.cookie, room.id);
    const bystanderSocket = await h.joinedSocket(bystander.cookie, room.id);

    const granted = nextEventMatching(singerSocket, SOCKET_EVENTS.MIC_STATE, ({ singers }) => singers.length === 1);
    singerSocket.emit(SOCKET_EVENTS.MIC_REQUEST, { roomId: room.id });
    await granted;

    // Joining the relay tells the singer someone needs the voice through the server.
    const demand = nextEvent(singerSocket, SOCKET_EVENTS.VOICE_RELAY_DEMAND);
    listenerSocket.emit(SOCKET_EVENTS.VOICE_RELAY_JOIN, { roomId: room.id, singer: singerSocket.id!, opus: true });
    expect(await demand).toEqual({ roomId: room.id, listeners: 1, pcmOnly: 0 });

    // A Buffer, as a Node client sends binary (browsers send an ArrayBuffer).
    const pcm = Buffer.from(new Int16Array(480).map((_, i) => i).buffer);
    const chunk = nextEvent(listenerSocket, SOCKET_EVENTS.VOICE_CHUNK);
    singerSocket.emit(SOCKET_EVENTS.VOICE_CHUNK, {
      roomId: room.id,
      seq: 0,
      t: 1234.5,
      codec: "pcm",
      sampleRate: 24_000,
      data: pcm as unknown as ArrayBuffer,
    });
    const received = await chunk;
    expect(received).toMatchObject({ roomId: room.id, from: singerSocket.id, seq: 0, t: 1234.5, codec: "pcm", sampleRate: 24_000 });
    expect(Buffer.from(received.data).equals(pcm)).toBe(true);
    // Only relay listeners get it.
    expect(await receivesWithin(bystanderSocket, SOCKET_EVENTS.VOICE_CHUNK, 300)).toBe(false);

    // Someone without a mic can't push audio into the relay.
    const notForwarded = receivesWithin(listenerSocket, SOCKET_EVENTS.VOICE_CHUNK, 400);
    bystanderSocket.emit(SOCKET_EVENTS.VOICE_CHUNK, {
      roomId: room.id,
      seq: 0,
      t: 1,
      codec: "pcm",
      sampleRate: 24_000,
      data: pcm as unknown as ArrayBuffer,
    });
    expect(await notForwarded).toBe(false);

    // The listener leaving (here: closing the tab) drops the demand back to 0.
    // A listener that can't decode Opus makes the singer fall back to PCM.
    const pcmNeeded = nextEventMatching(singerSocket, SOCKET_EVENTS.VOICE_RELAY_DEMAND, ({ listeners }) => listeners === 2);
    bystanderSocket.emit(SOCKET_EVENTS.VOICE_RELAY_JOIN, { roomId: room.id, singer: singerSocket.id!, opus: false });
    expect(await pcmNeeded).toEqual({ roomId: room.id, listeners: 2, pcmOnly: 1 });

    const none = nextEventMatching(singerSocket, SOCKET_EVENTS.VOICE_RELAY_DEMAND, ({ listeners }) => listeners === 0);
    listenerSocket.disconnect();
    bystanderSocket.emit(SOCKET_EVENTS.VOICE_RELAY_LEAVE, { roomId: room.id, singer: singerSocket.id! });
    expect(await none).toEqual({ roomId: room.id, listeners: 0, pcmOnly: 0 });
  });
});
