import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@soundwithme/realtime-contracts";
import { API_ROOT_URL, refreshAccessToken } from "./api-client";

const SOCKET_URL = API_ROOT_URL;

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

/** At most one silent re-login per this long, so a dead session can't loop. */
const REAUTH_INTERVAL_MS = 30_000;
let lastReauthAt = 0;

/**
 * The server checks the login when the socket connects, and drops sockets
 * whose session has ended. Socket.IO doesn't retry either case by itself:
 * refresh the access token (cookie) and connect again if that works.
 */
function reauthenticate(target: Socket<ServerToClientEvents, ClientToServerEvents>): void {
  const now = Date.now();
  if (now - lastReauthAt < REAUTH_INTERVAL_MS) return;
  lastReauthAt = now;
  void refreshAccessToken().then((ok) => {
    if (ok && !target.connected) target.connect();
  });
}

/**
 * Lazily creates a single shared socket connection. Components should go
 * through the `useRoomSocket` hook (added alongside the rooms feature),
 * never import this directly, so reconnect/backoff behavior stays
 * centralized (Architecture Review §11).
 */
export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    const created = socket;
    created.on("connect_error", (error) => {
      if (error.message === "UNAUTHENTICATED") reauthenticate(created);
    });
    created.on("disconnect", (reason) => {
      if (reason === "io server disconnect") reauthenticate(created);
    });
  }
  return socket;
}
