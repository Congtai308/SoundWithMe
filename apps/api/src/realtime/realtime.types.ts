import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@soundwithme/realtime-contracts";

/** The identity attached to a socket at handshake — no email or other private fields. */
export interface SocketUser {
  id: string;
  displayName: string;
  isGuest: boolean;
}

/** The login behind a socket, checked again once its access token expires. */
export interface SocketSession {
  /** Refresh-token session id (`sid`); null for tokens issued before sessions existed. */
  id: string | null;
  /** Epoch ms. */
  tokenExpiresAt: number;
}

/** Room settings captured when the socket joined, for high-frequency checks (reactions). */
export interface JoinedRoomSnapshot {
  reactionsEnabled: boolean;
}

export interface SocketData {
  user: SocketUser;
  session: SocketSession;
  /** Recent event timestamps (ms) per rate-limit bucket; dies with the socket. */
  rateBuckets: Record<string, number[]>;
  joinedRooms: Record<string, JoinedRoomSnapshot>;
  /** Tail of this socket's queue operations, so they run in the order they were sent. */
  queueOps?: Promise<void>;
  /** Can decode Opus for the karaoke voice relay (said when joining one). */
  voiceOpus?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no server-to-server events yet
export interface InterServerEvents {}

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
