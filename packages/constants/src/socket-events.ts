/**
 * Single source of truth for Socket.IO event names (Architecture Review §6).
 * Both apps/api gateways and apps/web socket client must import from here —
 * never hardcode an event name string anywhere else.
 */
export const SOCKET_EVENTS = {
  // Client -> Server
  ROOM_JOIN: "ROOM_JOIN",
  ROOM_LEAVE: "ROOM_LEAVE",
  PLAY: "PLAY",
  PAUSE: "PAUSE",
  SEEK: "SEEK",
  NEXT: "NEXT",
  PREVIOUS: "PREVIOUS",
  CHANGE_TRACK: "CHANGE_TRACK",
  QUEUE_ADD: "QUEUE_ADD",
  QUEUE_REMOVE: "QUEUE_REMOVE",
  QUEUE_REORDER: "QUEUE_REORDER",
  CHAT_MESSAGE: "CHAT_MESSAGE",
  REACTION_SEND: "REACTION_SEND",
  HOST_TRANSFER: "HOST_TRANSFER",
  USER_INVITE: "USER_INVITE",
  USER_KICK: "USER_KICK",
  SYNC_REQUEST: "SYNC_REQUEST", // client asks for current state on reconnect/join

  // Server -> Client
  PLAYBACK_STATE: "PLAYBACK_STATE",
  QUEUE_UPDATED: "QUEUE_UPDATED",
  HOST_CHANGED: "HOST_CHANGED",
  ERROR: "ERROR",
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
