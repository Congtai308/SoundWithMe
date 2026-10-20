import type {
  AppNotification,
  PlaybackState,
  QueueItem,
  ChatMessage,
  ReactionEvent,
  Room,
  RoomCloseReason,
  RoomListener,
  SkipVoteState,
} from "@soundwithme/types";
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

/**
 * Advance to the next queued track. `fromVersion` is the playback version the
 * sender saw: if the room has moved on since (another client already
 * advanced), the server ignores it — safe for every client to send on "ended".
 */
export interface NextPayload {
  roomId: string;
  fromVersion: number;
  /** The song finished on this tab (anyone may send it); otherwise a skip (host/DJ only). */
  ended?: boolean;
}

export interface ChangeTrackPayload {
  roomId: string;
  trackId: string;
}

export interface QueueAddPayload {
  roomId: string;
  trackId: string;
}

/** Adds the tracks in this order; one rate-limit hit and one QUEUE_UPDATED. */
export interface QueueAddManyPayload {
  roomId: string;
  trackIds: string[];
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

/** Host-only actions on one member of the room. */
export interface RoomUserPayload {
  roomId: string;
  userId: string;
}

export interface SetDjPayload extends RoomUserPayload {
  dj: boolean;
}

export interface MuteUserPayload extends RoomUserPayload {
  muted: boolean;
}

export interface QueueVotePayload {
  roomId: string;
  queueItemId: string;
  value: 1 | 0 | -1;
}

export interface SkipVotePayload {
  roomId: string;
  vote: boolean;
}

/** Maps every client->server event name to its payload type. */
export interface ClientToServerEvents {
  [SOCKET_EVENTS.ROOM_JOIN]: (payload: RoomJoinPayload) => void;
  [SOCKET_EVENTS.ROOM_LEAVE]: (payload: RoomLeavePayload) => void;
  [SOCKET_EVENTS.PLAY]: (payload: PlayPayload) => void;
  [SOCKET_EVENTS.PAUSE]: (payload: PausePayload) => void;
  [SOCKET_EVENTS.SEEK]: (payload: SeekPayload) => void;
  [SOCKET_EVENTS.NEXT]: (payload: NextPayload) => void;
  [SOCKET_EVENTS.PREVIOUS]: (payload: { roomId: string }) => void;
  [SOCKET_EVENTS.CHANGE_TRACK]: (payload: ChangeTrackPayload) => void;
  [SOCKET_EVENTS.QUEUE_ADD]: (payload: QueueAddPayload) => void;
  [SOCKET_EVENTS.QUEUE_ADD_MANY]: (payload: QueueAddManyPayload) => void;
  [SOCKET_EVENTS.QUEUE_REMOVE]: (payload: QueueRemovePayload) => void;
  [SOCKET_EVENTS.CHAT_MESSAGE]: (payload: ChatMessagePayload) => void;
  [SOCKET_EVENTS.REACTION_SEND]: (payload: ReactionSendPayload) => void;
  [SOCKET_EVENTS.HOST_TRANSFER]: (payload: HostTransferPayload) => void;
  [SOCKET_EVENTS.ROOM_SET_DJ]: (payload: SetDjPayload) => void;
  [SOCKET_EVENTS.ROOM_MUTE_USER]: (payload: MuteUserPayload) => void;
  [SOCKET_EVENTS.USER_KICK]: (payload: RoomUserPayload) => void;
  [SOCKET_EVENTS.USER_INVITE]: (payload: RoomUserPayload) => void;
  [SOCKET_EVENTS.QUEUE_VOTE]: (payload: QueueVotePayload) => void;
  [SOCKET_EVENTS.SKIP_VOTE]: (payload: SkipVotePayload) => void;
  [SOCKET_EVENTS.SYNC_REQUEST]: (payload: SyncRequestPayload) => void;
  [SOCKET_EVENTS.MIC_REQUEST]: (payload: { roomId: string }) => void;
  [SOCKET_EVENTS.MIC_RELEASE]: (payload: MicReleasePayload) => void;
  [SOCKET_EVENTS.MIC_SYNC]: (payload: { roomId: string }) => void;
  [SOCKET_EVENTS.MIC_LINE_JOIN]: (payload: { roomId: string }) => void;
  [SOCKET_EVENTS.MIC_LINE_LEAVE]: (payload: { roomId: string }) => void;
  [SOCKET_EVENTS.RTC_SIGNAL]: (payload: RtcSignalPayload) => void;
  [SOCKET_EVENTS.VOICE_RELAY_JOIN]: (payload: VoiceRelayPayload) => void;
  [SOCKET_EVENTS.VOICE_RELAY_LEAVE]: (payload: VoiceRelayPayload) => void;
  [SOCKET_EVENTS.VOICE_CHUNK]: (payload: VoiceChunkPayload) => void;
}

// ---- Karaoke voice ----

/** One open mic. Voice is per tab, so singers are identified by socket. */
export interface MicSinger {
  socketId: string;
  userId: string;
  displayName: string;
}

export interface MicStatePayload {
  roomId: string;
  singers: MicSinger[];
  maxSingers: number;
  /** Waiting for a mic, first in line first. */
  line: MicSinger[];
}

/** Server -> the next singer's tab: a mic was kept for you — open your mic within `holdMs`. */
export interface MicTurnPayload {
  roomId: string;
  holdMs: number;
}

/** Without `socketId`: your own mic. With it: the host closing someone's. */
export interface MicReleasePayload {
  roomId: string;
  socketId?: string;
}

/**
 * WebRTC negotiation. Listeners offer (receive-only) to each singer, singers
 * answer with their mic, so offers never collide. `channel` is the sender's
 * side of that pair: "listen" from the listener, "sing" from the singer.
 */
export type RtcSignal =
  | {
      type: "offer" | "answer";
      sdp: string;
      /** Answer only: the singer's mic input + speaker output latency, ms — they sing that late to the music. */
      latencyMs?: number;
    }
  | { type: "candidate"; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };

export interface RtcSignalPayload {
  roomId: string;
  to: string;
  channel: "listen" | "sing";
  signal: RtcSignal;
}

export interface RtcSignalEvent {
  roomId: string;
  from: string;
  fromUserId: string;
  channel: "listen" | "sing";
  signal: RtcSignal;
}

/** Listener ↔ server: relay one singer's voice through the server (or stop). */
export interface VoiceRelayPayload {
  roomId: string;
  singer: string;
  /** Join only: this browser can decode Opus (WebCodecs). */
  opus?: boolean;
}

/** Server -> singer: listeners currently taking this singer's voice through the server. */
export interface VoiceRelayDemandPayload {
  roomId: string;
  listeners: number;
  /** Of those, how many can't decode Opus — the singer then sends PCM. */
  pcmOnly: number;
}

export type VoiceCodec = "opus" | "pcm";

/**
 * One slice of a singer's voice, mono: an Opus packet, or 16-bit
 * little-endian PCM at `sampleRate`. `t` is the music time it belongs to, on
 * the server clock — when it was sung, minus the singer's own mic and speaker
 * latency — so listeners can line it up with the music exactly.
 */
export interface VoiceChunkPayload {
  roomId: string;
  seq: number;
  t: number;
  codec: VoiceCodec;
  sampleRate: number;
  data: ArrayBuffer;
}

export interface VoiceChunkEvent extends VoiceChunkPayload {
  from: string;
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
  [SOCKET_EVENTS.ROOM_PRESENCE]: (payload: { roomId: string; listeners: RoomListener[] }) => void;
  [SOCKET_EVENTS.MIC_STATE]: (payload: MicStatePayload) => void;
  [SOCKET_EVENTS.MIC_TURN]: (payload: MicTurnPayload) => void;
  [SOCKET_EVENTS.ROOM_UPDATED]: (payload: { room: Room }) => void;
  [SOCKET_EVENTS.ROOM_CLOSED]: (payload: { roomId: string; reason: RoomCloseReason }) => void;
  [SOCKET_EVENTS.ROOM_KICKED]: (payload: { roomId: string }) => void;
  [SOCKET_EVENTS.SKIP_STATE]: (payload: SkipVoteState) => void;
  [SOCKET_EVENTS.NOTIFICATION]: (payload: AppNotification) => void;
  [SOCKET_EVENTS.FRIENDS_CHANGED]: (payload: Record<string, never>) => void;
  [SOCKET_EVENTS.RTC_SIGNAL]: (payload: RtcSignalEvent) => void;
  [SOCKET_EVENTS.VOICE_RELAY_DEMAND]: (payload: VoiceRelayDemandPayload) => void;
  [SOCKET_EVENTS.VOICE_CHUNK]: (payload: VoiceChunkEvent) => void;
  [SOCKET_EVENTS.ERROR]: (payload: ErrorPayload) => void;
}
