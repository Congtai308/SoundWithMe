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
  QUEUE_ADD_MANY: "QUEUE_ADD_MANY", // several songs at once, kept in order
  QUEUE_REMOVE: "QUEUE_REMOVE",
  QUEUE_REORDER: "QUEUE_REORDER",
  CHAT_MESSAGE: "CHAT_MESSAGE",
  REACTION_SEND: "REACTION_SEND",
  HOST_TRANSFER: "HOST_TRANSFER",
  USER_INVITE: "USER_INVITE", // invite a friend into this room
  USER_KICK: "USER_KICK", // host: remove someone (they can't come back)
  ROOM_SET_DJ: "ROOM_SET_DJ", // host: give / take playback control
  ROOM_MUTE_USER: "ROOM_MUTE_USER", // host: mute / unmute someone in chat
  QUEUE_VOTE: "QUEUE_VOTE", // play a queued song sooner / later
  SKIP_VOTE: "SKIP_VOTE", // vote to skip the song playing now
  SYNC_REQUEST: "SYNC_REQUEST", // client asks for current state on reconnect/join

  // Karaoke voice (both directions where noted)
  MIC_REQUEST: "MIC_REQUEST", // take one of the room's mics
  MIC_RELEASE: "MIC_RELEASE", // drop your mic (host: anyone's)
  MIC_SYNC: "MIC_SYNC", // ask for the current MIC_STATE
  MIC_LINE_JOIN: "MIC_LINE_JOIN", // wait in line for the next free mic
  MIC_LINE_LEAVE: "MIC_LINE_LEAVE",
  MIC_TURN: "MIC_TURN", // server -> client: a mic is now yours — open it
  MIC_STATE: "MIC_STATE", // server -> client: who is singing
  RTC_SIGNAL: "RTC_SIGNAL", // both ways: WebRTC offer/answer/ICE, relayed socket to socket
  // Server relay, for networks where peers can't connect directly:
  VOICE_RELAY_JOIN: "VOICE_RELAY_JOIN", // listener: send me this singer's voice through the server
  VOICE_RELAY_LEAVE: "VOICE_RELAY_LEAVE", // listener: stop relaying this singer
  VOICE_RELAY_DEMAND: "VOICE_RELAY_DEMAND", // server -> singer: how many listen through the server
  VOICE_CHUNK: "VOICE_CHUNK", // singer -> server -> relay listeners: 20 ms of PCM

  // Server -> Client
  PLAYBACK_STATE: "PLAYBACK_STATE",
  QUEUE_UPDATED: "QUEUE_UPDATED",
  HOST_CHANGED: "HOST_CHANGED",
  ROOM_PRESENCE: "ROOM_PRESENCE", // full list of listeners currently connected to a room
  ROOM_UPDATED: "ROOM_UPDATED", // settings, DJs, mutes or host changed: here is the room
  ROOM_CLOSED: "ROOM_CLOSED", // the room ended (host or inactivity)
  ROOM_KICKED: "ROOM_KICKED", // to the removed user's sockets
  SKIP_STATE: "SKIP_STATE", // skip votes for the current song
  NOTIFICATION: "NOTIFICATION", // to one user: something new for the bell
  FRIENDS_CHANGED: "FRIENDS_CHANGED", // to one user: refresh the friends list / presence
  DM_MESSAGE: "DM_MESSAGE", // to both people: a new direct message
  DM_READ: "DM_READ", // to both people: one side read the conversation
  ERROR: "ERROR",
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
