import type { PlaybackState, QueueItem, ChatMessage, ReactionEvent } from "@soundwithme/types";
import { SOCKET_EVENTS, type ErrorCode } from "@soundwithme/constants";

// ---- Client -> Server payloads ----

export interface RoomJoinPayload {
  roomId: string;
}

export interface RoomLeavePayload {
  roomId: string;
}

export interface PlayPayload {
  roomId: string;
  positionMs: number;
}

export interface PausePayload {
  roomId: string;
  positionMs: number;
}

export interface SeekPayload {
  roomId: string;
  positionMs: number;
}

export interface ChangeTrackPayload {
  roomId: string;
  trackId: string;
}

export interface QueueAddPayload {
  roomId: string;
  trackId: string;
}

export interface QueueRemovePayload {
  roomId: string;
  queueItemId: string;
}

export interface ChatMessagePayload {
  roomId: string;
  content: string;
}

export interface ReactionSendPayload {
  roomId: string;
  emoji: string;
}

export interface HostTransferPayload {
  roomId: string;
  newHostId: string;
}

export interface SyncRequestPayload {
  roomId: string;
}

/** Maps every client->server event name to its payload type. */
export interface ClientToServerEvents {
  [SOCKET_EVENTS.ROOM_JOIN]: (payload: RoomJoinPayload) => void;
  [SOCKET_EVENTS.ROOM_LEAVE]: (payload: RoomLeavePayload) => void;
  [SOCKET_EVENTS.PLAY]: (payload: PlayPayload) => void;
  [SOCKET_EVENTS.PAUSE]: (payload: PausePayload) => void;
  [SOCKET_EVENTS.SEEK]: (payload: SeekPayload) => void;
  [SOCKET_EVENTS.NEXT]: (payload: { roomId: string }) => void;
  [SOCKET_EVENTS.PREVIOUS]: (payload: { roomId: string }) => void;
  [SOCKET_EVENTS.CHANGE_TRACK]: (payload: ChangeTrackPayload) => void;
  [SOCKET_EVENTS.QUEUE_ADD]: (payload: QueueAddPayload) => void;
  [SOCKET_EVENTS.QUEUE_REMOVE]: (payload: QueueRemovePayload) => void;
  [SOCKET_EVENTS.CHAT_MESSAGE]: (payload: ChatMessagePayload) => void;
  [SOCKET_EVENTS.REACTION_SEND]: (payload: ReactionSendPayload) => void;
  [SOCKET_EVENTS.HOST_TRANSFER]: (payload: HostTransferPayload) => void;
  [SOCKET_EVENTS.SYNC_REQUEST]: (payload: SyncRequestPayload) => void;
}

// ---- Server -> Client payloads ----

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

/** Maps every server->client event name to its payload type. */
export interface ServerToClientEvents {
  [SOCKET_EVENTS.PLAYBACK_STATE]: (payload: PlaybackState) => void;
  [SOCKET_EVENTS.QUEUE_UPDATED]: (payload: { roomId: string; queue: QueueItem[] }) => void;
  [SOCKET_EVENTS.CHAT_MESSAGE]: (payload: ChatMessage) => void;
  [SOCKET_EVENTS.REACTION_SEND]: (payload: ReactionEvent) => void;
  [SOCKET_EVENTS.ROOM_JOIN]: (payload: { roomId: string; userId: string }) => void;
  [SOCKET_EVENTS.ROOM_LEAVE]: (payload: { roomId: string; userId: string }) => void;
  [SOCKET_EVENTS.HOST_CHANGED]: (payload: { roomId: string; newHostId: string }) => void;
  [SOCKET_EVENTS.ERROR]: (payload: ErrorPayload) => void;
}
