import { ConflictException } from "@nestjs/common";
import { ERROR_CODES, SOCKET_EVENTS } from "@soundwithme/constants";
import type { Room } from "@soundwithme/types";
import type { Request, Response } from "express";
import { AuthService } from "../src/modules/auth/auth.service";
import { OAuthStateCookieStore } from "../src/modules/auth/strategies/oauth-state.store";
import { LyricsService } from "../src/modules/music/lyrics/lyrics.service";
import { wantsSecureCookies } from "../src/common/utils/auth-cookies";
import { RealtimeHarness, nextEvent, nextEventMatching, receivesWithin, type ClientSocket } from "./support/realtime-harness";

/**
 * Fixes for the Claude Security scan of 2026-10-18 (F1–F12): account
 * claiming through Google, OAuth state, login and passcode guessing,
 * sockets outliving a kick, a leave or a logout, and the unguarded track
 * routes.
 */
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterEach(() => h.disconnectAll());
afterAll(() => h.stop());

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function call<T>(path: string, cookie: string, method = "GET", body?: unknown, ip?: string) {
  const res = await fetch(`${h.baseUrl}/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json", cookie, ...(ip ? { "x-forwarded-for": ip } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { data: T; error?: { code: string } };
  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { status: res.status, data: json.data, error: json.error, cookies };
}

const login = (email: string, ip: string, password = "wrong-password") =>
  call<{ user: { id: string } }>("/auth/login", "", "POST", { email, password }, ip);

async function register(ip: string) {
  const email = `user${stamp()}@example.com`;
  const res = await h.registerUser({ displayName: "Member", email, password: "right-password-1" }, ip);
  return { email, userId: res.user.id };
}

function disconnectedByServer(socket: ClientSocket, ms = 1_500): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    socket.once("disconnect", (reason) => {
      clearTimeout(timer);
      resolve(reason === "io server disconnect");
    });
  });
}

describe("Password sign-in limits (F3, F7)", () => {
  it("keeps the owner's sign-in open while many addresses guess at the account", async () => {
    const { email } = await register("198.51.100.1");
    await h.redis().set(`auth:login-failures:${email}`, "100", "EX", 900);

    // An address that has been guessing is stopped early...
    for (let n = 0; n < 3; n++) expect((await login(email, "198.51.100.2")).status).toBe(401);
    expect((await login(email, "198.51.100.2")).error?.code).toBe(ERROR_CODES.RATE_LIMITED);
    // ...while the owner, from their own address, gets in.
    expect((await login(email, "198.51.100.3", "right-password-1")).status).toBe(200);
  });

  it("counts guesses sent in parallel", async () => {
    const { email } = await register("198.51.100.10");
    const results = await Promise.all(Array.from({ length: 14 }, () => login(email, "198.51.100.11")));
    expect(results.filter((r) => r.status === 401)).toHaveLength(10);
    expect(results.filter((r) => r.status === 429)).toHaveLength(4);
  }, 30_000);
});

describe("Google sign-in and an existing password account (F1)", () => {
  it("adds Google to an account made through the mailed sign-up link, and never moves it between Google accounts", async () => {
    const { email, userId } = await register("198.51.100.20");
    const auth = h.get(AuthService);
    const profile = { googleId: `g-${stamp()}`, email, displayName: "Owner", avatarUrl: null };

    const { user } = await auth.loginOrRegisterWithGoogle(profile);
    expect(user.id).toBe(userId);
    // Whoever chose the password also opened the mailed link: it keeps working.
    expect((await login(email, "198.51.100.21", "right-password-1")).status).toBe(200);
    expect((await auth.loginOrRegisterWithGoogle(profile)).user.id).toBe(userId);
    await expect(auth.loginOrRegisterWithGoogle({ ...profile, googleId: `g-${stamp()}` })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("OAuth state cookie (F2)", () => {
  function fakeExchange(cookies: Record<string, string> = {}) {
    const set: Record<string, string> = {};
    const res = {
      cookie: (name: string, value: string) => (set[name] = value),
      clearCookie: (name: string) => delete set[name],
    } as unknown as Response;
    const req = { cookies, res, headers: { host: "localhost:3000" }, protocol: "http", socket: {} } as unknown as Request;
    return { req, set };
  }

  it("only accepts the callback in the browser that started signing in", async () => {
    const store = new OAuthStateCookieStore();
    const start = fakeExchange();
    const state = await new Promise<string>((resolve) =>
      store.store(start.req, "the-verifier", undefined, {}, (_e, s) => resolve(s!)),
    );
    const cookie = start.set.swm_oauth_state!;

    const verify = (cookies: Record<string, string>, provided: string) =>
      new Promise<string | false>((resolve) => store.verify(fakeExchange(cookies).req, provided, {}, (_e, v) => resolve(v)));

    expect(await verify({ swm_oauth_state: cookie }, state)).toBe("the-verifier");
    expect(await verify({}, state)).toBe(false); // a victim's browser has no cookie
    expect(await verify({ swm_oauth_state: cookie }, "forged-state")).toBe(false);
  });
});

describe("Secure auth cookies (F8)", () => {
  const req = (host: string, forwardedHost?: string, remote = "127.0.0.1") =>
    ({
      headers: { host, ...(forwardedHost ? { "x-forwarded-host": forwardedHost } : {}) },
      protocol: "http",
      socket: { remoteAddress: remote },
    }) as unknown as Request;

  it("is Secure everywhere but this machine and the LAN", () => {
    expect(wantsSecureCookies(req("localhost:4000", "abc.trycloudflare.com"))).toBe(true);
    expect(wantsSecureCookies(req("localhost:4000", "localhost:3000"))).toBe(false);
    expect(wantsSecureCookies(req("localhost:4000", "192.168.1.20:3000"))).toBe(false);
    // A forwarded host is only trusted from the local proxies.
    expect(wantsSecureCookies(req("api.example.com", "localhost", "203.0.113.9"))).toBe(true);
  });
});

describe("Private room passcode guessing (F5)", () => {
  it("locks the passcode after 10 wrong tries from anyone, but not the invite link", async () => {
    const host = await h.createGuest("Host");
    const created = await call<{ room: Room }>("/rooms", host.cookie, "POST", {
      name: "Locked",
      type: "private",
      passcode: "hunter22",
    });
    const room = created.data.room;

    // Free guest accounts: each one only tries a couple of times.
    for (let n = 0; n < 5; n++) {
      const guest = await h.createGuest(`Guesser ${n}`);
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await call(`/rooms/${room.id}/join`, guest.cookie, "POST", { passcode: `wrong${n}${attempt}` });
        expect(res.error?.code).toBe(ERROR_CODES.ROOM_PASSCODE_INVALID);
      }
    }
    const late = await h.createGuest("Late");
    expect((await call(`/rooms/${room.id}/join`, late.cookie, "POST", { passcode: "hunter22" })).status).toBe(429);
    expect((await call(`/rooms/${room.id}/join`, late.cookie, "POST", { invite: room.inviteCode })).status).toBe(201);
  });
});

describe("Track routes (F6)", () => {
  it("are rate limited for signed-out callers", async () => {
    const statuses: number[] = [];
    for (let n = 0; n < 61; n++) statuses.push((await call(`/tracks/yt_bad${n}`, "", "GET", undefined, "198.51.100.30")).status);
    expect(statuses.slice(0, 60).every((s) => s === 404)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});

describe("Lyrics from LRCLIB (F12)", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("drops oversized records before matching them", async () => {
    global.fetch = jest.fn(async () =>
      Response.json([
        {
          trackName: `Song${" ".repeat(50_000)}x`,
          artistName: "Artist",
          duration: 200,
          instrumental: false,
          plainLyrics: "la la",
          syncedLyrics: null,
        },
      ]),
    ) as typeof fetch;
    const started = Date.now();
    const lyrics = await h.get(LyricsService).getLyrics({
      id: `yt_lyrics${stamp()}`,
      title: "Artist - Song",
      artistName: "Artist",
      durationMs: 200_000,
    } as Parameters<LyricsService["getLyrics"]>[0]);
    expect(lyrics).toBeNull();
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe("Sockets after losing room access (F4, F10)", () => {
  it("a kicked listener stops getting the singer's relayed voice", async () => {
    const host = await h.createGuest("Singer");
    const listener = await h.createGuest("Listener");
    const room = await h.createRoom(host.cookie);
    await h.joinRest(room.id, listener.cookie);
    const singerSocket = await h.joinedSocket(host.cookie, room.id);
    const listenerSocket = await h.joinedSocket(listener.cookie, room.id);

    const granted = nextEventMatching(singerSocket, SOCKET_EVENTS.MIC_STATE, ({ singers }) => singers.length === 1);
    singerSocket.emit(SOCKET_EVENTS.MIC_REQUEST, { roomId: room.id });
    await granted;
    const joined = nextEventMatching(singerSocket, SOCKET_EVENTS.VOICE_RELAY_DEMAND, (d) => d.listeners === 1);
    listenerSocket.emit(SOCKET_EVENTS.VOICE_RELAY_JOIN, { roomId: room.id, singer: singerSocket.id!, opus: true });
    await joined;

    // The listener's client ignores ROOM_KICKED and never leaves the relay itself.
    const dropped = nextEventMatching(singerSocket, SOCKET_EVENTS.VOICE_RELAY_DEMAND, (d) => d.listeners === 0);
    singerSocket.emit(SOCKET_EVENTS.USER_KICK, { roomId: room.id, userId: listener.userId });
    await dropped;

    const heard = receivesWithin(listenerSocket, SOCKET_EVENTS.VOICE_CHUNK, 500);
    singerSocket.emit(SOCKET_EVENTS.VOICE_CHUNK, {
      roomId: room.id,
      seq: 0,
      t: 0,
      codec: "pcm",
      sampleRate: 24_000,
      data: Buffer.alloc(960) as unknown as ArrayBuffer,
    });
    expect(await heard).toBe(false);
  });

  it("leaving through the REST API takes the socket out of the room", async () => {
    const host = await h.createGuest("Host");
    const member = await h.createGuest("Member");
    const room = await h.createRoom(host.cookie);
    await h.joinRest(room.id, member.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const memberSocket = await h.joinedSocket(member.cookie, room.id);

    const announced = nextEventMatching(hostSocket, SOCKET_EVENTS.ROOM_LEAVE, (e) => e.userId === member.userId);
    expect((await call(`/rooms/${room.id}/leave`, member.cookie, "POST")).status).toBeLessThan(300);
    await announced;

    const refused = nextEvent(memberSocket, SOCKET_EVENTS.ERROR);
    memberSocket.emit(SOCKET_EVENTS.SYNC_REQUEST, { roomId: room.id });
    expect((await refused).code).toBe(ERROR_CODES.NOT_ROOM_MEMBER);
  });

  it("refuses the socket's own reserved rooms as room ids", async () => {
    const host = await h.createGuest("Host");
    const socket = await h.connected(h.connect(host.cookie));
    // The socket really is in its user room; that must not pass for membership.
    const refused = nextEvent(socket, SOCKET_EVENTS.ERROR);
    socket.emit(SOCKET_EVENTS.MIC_SYNC, { roomId: `user:${host.userId}` });
    expect((await refused).code).toBe(ERROR_CODES.NOT_ROOM_MEMBER);
  });
});

describe("Sockets after signing out (F11)", () => {
  it("logging out closes that session's sockets only; everywhere closes all", async () => {
    const { email } = await register("198.51.100.40");
    const laptop = await login(email, "198.51.100.41", "right-password-1");
    const phone = await login(email, "198.51.100.42", "right-password-1");
    const laptopSocket = await h.connected(h.connect(laptop.cookies));
    const phoneSocket = await h.connected(h.connect(phone.cookies));

    const laptopGone = disconnectedByServer(laptopSocket);
    const phoneGone = disconnectedByServer(phoneSocket, 800);
    await call("/auth/logout", laptop.cookies, "POST");
    expect(await laptopGone).toBe(true);
    expect(await phoneGone).toBe(false);

    // The laptop's access token hasn't expired, but its session has: no new socket, no REST.
    await expect(h.connected(h.connect(laptop.cookies))).rejects.toThrow();
    expect((await call("/auth/me", laptop.cookies)).status).toBe(401);
    expect((await call("/auth/me", phone.cookies)).status).toBe(200);

    const phoneGoneNow = disconnectedByServer(phoneSocket);
    await call("/auth/logout-everywhere", phone.cookies, "POST");
    expect(await phoneGoneNow).toBe(true);
    expect((await call("/auth/me", phone.cookies)).status).toBe(401);
  });
});

describe("Error responses", () => {
  it("never echo framework internals: unknown routes, unreadable JSON", async () => {
    const unknown = await fetch(`${h.baseUrl}/api/v1/nope`);
    expect(await unknown.json()).toEqual({ success: false, error: { code: ERROR_CODES.NOT_FOUND, message: "Not found." } });

    const malformed = await fetch(`${h.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad json",
    });
    expect(malformed.status).toBe(400);
    const body = (await malformed.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(body.error.message).not.toMatch(/JSON|position|property/);
  });
});
