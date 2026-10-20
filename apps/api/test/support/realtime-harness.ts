import type { AddressInfo } from "net";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getConnectionToken } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import type { Redis } from "ioredis";
import cookieParser from "cookie-parser";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS, type ErrorCode } from "@soundwithme/constants";
import type { ClientToServerEvents, ErrorPayload, ServerToClientEvents } from "@soundwithme/realtime-contracts";
import type { Room } from "@soundwithme/types";
import { AppModule } from "../../src/app.module";
import { RedisIoAdapter } from "../../src/realtime/adapters/redis-io.adapter";
import { REDIS_CLIENT } from "../../src/database/redis/redis.constants";

/**
 * Boots the real AppModule with the Socket.IO Redis adapter on a random port
 * and offers helpers to drive it like the web client does (httpOnly cookie
 * auth, typed socket events). Needs docker-compose Redis + MongoDB; MongoDB
 * uses the throwaway database from test/setup-env.ts, dropped on stop().
 */
export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const EVENT_TIMEOUT_MS = 3_000;

export class RealtimeHarness {
  private app!: INestApplication;
  baseUrl = "";
  private readonly sockets: ClientSocket[] = [];
  private readonly roomIds: string[] = [];
  /** Signed-out calls (sign-ups) look like different visitors, as they would in real use; see clientIp(). */
  private visitor = 0;

  async start(): Promise<void> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    this.app = moduleRef.createNestApplication({ logger: false });
    this.app.setGlobalPrefix("api/v1");
    this.app.use(cookieParser());
    const adapter = new RedisIoAdapter(this.app);
    await adapter.connectToRedis();
    this.app.useWebSocketAdapter(adapter);
    // The database is fresh each run: build unique indexes before any test races against them.
    const connection = this.app.get<Connection>(getConnectionToken());
    await Promise.all(Object.values(connection.models).map((model) => model.init()));
    await this.app.listen(0);
    const { port } = this.app.getHttpServer().address() as AddressInfo;
    this.baseUrl = `http://localhost:${port}`;
  }

  /** One of the app's providers, for tests that drive a service directly. */
  get<T>(token: abstract new (...args: never[]) => T): T {
    return this.app.get(token);
  }

  /** The app's own Redis client, for tests that need to set up server-side state. */
  redis(): Redis {
    return this.app.get<Redis>(REDIS_CLIENT);
  }

  disconnectAll(): void {
    for (const socket of this.sockets.splice(0)) socket.disconnect();
  }

  async stop(): Promise<void> {
    this.disconnectAll();
    const redis = this.app.get<Redis>(REDIS_CLIENT);
    if (this.roomIds.length > 0) {
      await redis.del(...this.roomIds.map((id) => `room:${id}:playback`));
    }
    await this.app.get<Connection>(getConnectionToken()).dropDatabase();
    await this.app.close();
  }

  async api<T>(path: string, init: { method?: string; cookie?: string; body?: unknown } = {}) {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method: init.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(init.cookie ? { cookie: init.cookie } : { "x-forwarded-for": `10.9.${Math.floor(this.visitor / 250)}.${(this.visitor++ % 250) + 1}` }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    // Response shape is the API's own { success, data } envelope.
    const json = (await res.json()) as { success: boolean; data: T };
    return { res, data: json.data };
  }

  async createGuest(displayName: string): Promise<{ cookie: string; userId: string }> {
    const { res, data } = await this.api<{ user: { id: string } }>("/auth/guest", {
      method: "POST",
      body: { displayName },
    });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    return { cookie, userId: data.user.id };
  }

  async createRoom(cookie: string, settings: Partial<Room["settings"]> = {}): Promise<Room> {
    const { data } = await this.api<{ room: Room }>("/rooms", {
      method: "POST",
      cookie,
      body: { name: "Realtime test room", type: "public", settings },
    });
    this.roomIds.push(data.room.id);
    return data.room;
  }

  async joinRest(roomId: string, cookie: string): Promise<void> {
    await this.api(`/rooms/${roomId}/join`, { method: "POST", cookie });
  }

  connect(cookie?: string): ClientSocket {
    const socket: ClientSocket = io(this.baseUrl, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: cookie ? { cookie } : {},
    });
    this.sockets.push(socket);
    return socket;
  }

  async connected(socket: ClientSocket): Promise<ClientSocket> {
    if (socket.connected) return socket;
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", reject);
    });
    return socket;
  }

  /** Connects and completes ROOM_JOIN (resolves once the server echoes the join). */
  async joinedSocket(cookie: string, roomId: string): Promise<ClientSocket> {
    const socket = await this.connected(this.connect(cookie));
    const joined = nextEvent(socket, SOCKET_EVENTS.ROOM_JOIN);
    socket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomId });
    await joined;
    return socket;
  }
}

type EventPayload<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>[0];

export function nextEvent<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
): Promise<EventPayload<E>> {
  return nextEventMatching(socket, event, () => true);
}

/**
 * First `event` whose payload satisfies `predicate`. Use when earlier
 * broadcasts of the same event may still be in flight (presence, queue).
 */
export function nextEventMatching<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  predicate: (payload: EventPayload<E>) => boolean,
): Promise<EventPayload<E>> {
  return new Promise((resolve, reject) => {
    const handler = ((payload: EventPayload<E>) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }) as never;
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${String(event)}`));
    }, EVENT_TIMEOUT_MS);
    socket.on(event, handler);
  });
}

/** Resolves true if `event` arrives within `ms`, false otherwise. */
export function receivesWithin(socket: ClientSocket, event: keyof ServerToClientEvents, ms = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const handler = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(false);
    }, ms);
    socket.once(event, handler);
  });
}

export async function expectError(socket: ClientSocket, code: ErrorCode): Promise<ErrorPayload> {
  const error = await nextEvent(socket, SOCKET_EVENTS.ERROR);
  expect(error.code).toBe(code);
  return error;
}
