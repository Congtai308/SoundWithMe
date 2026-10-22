"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SOCKET_EVENTS } from "@soundwithme/constants";
import type {
  ChatMessage,
  PlaybackState,
  QueueItem,
  ReactionEmoji,
  ReactionEvent,
  Room,
  RoomCloseReason,
  RoomListener,
  SkipVoteState,
} from "@soundwithme/types";
import { errorMessage } from "@/services/error-messages";
import type { ErrorPayload } from "@soundwithme/realtime-contracts";
import { getSocket } from "@/services/socket-client";
import { usePlayerStore } from "@/features/player/stores/player-store";
import { syncServerClock } from "@/features/player/services/server-clock";
import { appendLiveMessage } from "@/features/chat/hooks/use-room-messages";
import { useRoomLiveStore } from "../stores/room-live-store";

export interface RoomCommands {
  play: (positionMs: number) => void;
  pause: (positionMs: number) => void;
  seek: (positionMs: number) => void;
  changeTrack: (trackId: string) => void;
  /** `ended`: the song finished here (anyone may send it); otherwise a skip. */
  next: (fromVersion: number, ended?: boolean) => void;
  queueAdd: (trackId: string) => void;
  /** Several songs in this order (max MAX_QUEUE_ADD_MANY). */
  queueAddMany: (trackIds: string[]) => void;
  queueRemove: (queueItemId: string) => void;
  /** 1 = sooner, -1 = later, 0 = take the vote back. */
  queueVote: (queueItemId: string, value: 1 | 0 | -1) => void;
  skipVote: (vote: boolean) => void;
  sendChat: (content: string) => void;
  sendReaction: (emoji: ReactionEmoji) => void;
  // Host only (the server checks):
  setDj: (userId: string, dj: boolean) => void;
  muteUser: (userId: string, muted: boolean) => void;
  kickUser: (userId: string) => void;
  transferHost: (newHostId: string) => void;
  /** Invite a friend through their notifications. */
  inviteFriend: (userId: string) => void;
  /** Re-sends ROOM_JOIN, e.g. right after joining over REST. */
  rejoin: () => void;
}

/**
 * Owns the realtime connection for one room: joins on mount (and after every
 * reconnect), routes server events into the player store, the room live
 * store and the query cache, and exposes typed commands. The server decides
 * permissions; the UI only mirrors them.
 */
export function useRoomSocket(roomId: string, currentUserId: string | undefined): RoomCommands {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!currentUserId) return;
    const socket = getSocket();
    const live = useRoomLiveStore.getState();
    live.reset(roomId);
    live.setConnection("connecting");
    usePlayerStore.getState().reset(roomId);

    const join = () => socket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomId });

    const onConnect = () => {
      useRoomLiveStore.getState().setConnection("connected");
      void syncServerClock(true);
      join();
    };
    const onDisconnect = () => useRoomLiveStore.getState().setConnection("reconnecting");
    const onConnectError = () => useRoomLiveStore.getState().setConnection("error");

    const onJoin = ({ roomId: joinedRoom, userId }: { roomId: string; userId: string }) => {
      if (joinedRoom === roomId && userId === currentUserId) {
        useRoomLiveStore.getState().setMembership("member");
        useRoomLiveStore.getState().setError(null);
      }
    };
    const onState = (state: PlaybackState) => usePlayerStore.getState().applyServerState(state);
    // The server sends the queue to every socket it lets into the room, so it
    // doubles as an early "join accepted" signal (it arrives before the ROOM_JOIN echo).
    const onQueue = ({ roomId: queueRoom, queue }: { roomId: string; queue: QueueItem[] }) => {
      const store = useRoomLiveStore.getState();
      store.setQueue(queueRoom, queue);
      if (queueRoom === roomId) store.setMembership("member");
    };
    const onPresence = ({ roomId: presenceRoom, listeners }: { roomId: string; listeners: RoomListener[] }) =>
      useRoomLiveStore.getState().setListeners(presenceRoom, listeners);
    const onReaction = (reaction: ReactionEvent) => useRoomLiveStore.getState().addReaction(reaction);
    const onChat = (message: ChatMessage) => {
      if (message.roomId === roomId) appendLiveMessage(queryClient, message);
    };
    const onSkip = (skip: SkipVoteState) => useRoomLiveStore.getState().setSkip(skip);
    // Settings, DJs, mutes, host: the broadcast never carries the invite
    // code, so the host keeps the one they already have.
    const onRoomUpdated = ({ room }: { room: Room }) => {
      if (room.id !== roomId) return;
      queryClient.setQueryData<Room>(["rooms", roomId], (previous) => ({
        ...room,
        inviteCode: room.hostId === currentUserId ? (previous?.inviteCode ?? null) : null,
      }));
      if (room.hostId === currentUserId && room.type === "private") {
        void queryClient.invalidateQueries({ queryKey: ["rooms", roomId] }); // the new host fetches the invite code
      }
    };
    const onHostChanged = ({ roomId: changedRoom }: { roomId: string; newHostId: string }) => {
      if (changedRoom !== roomId) return;
      void queryClient.invalidateQueries({ queryKey: ["rooms", roomId] });
      void queryClient.invalidateQueries({ queryKey: ["rooms", "mine"] });
    };
    const onClosed = ({ roomId: closedRoom, reason }: { roomId: string; reason: RoomCloseReason }) => {
      if (closedRoom !== roomId) return;
      useRoomLiveStore.getState().setClosed(roomId, reason);
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
    };
    const onKicked = ({ roomId: kickedRoom }: { roomId: string }) => {
      if (kickedRoom !== roomId) return;
      useRoomLiveStore.getState().setKicked(roomId);
      void queryClient.invalidateQueries({ queryKey: ["rooms", roomId] });
    };
    const onError = (error: ErrorPayload) => {
      const store = useRoomLiveStore.getState();
      if (error.code === "NOT_ROOM_MEMBER" && store.membership !== "member") {
        store.setMembership("not-member");
        return;
      }
      store.setError({ ...error, message: errorMessage(error.code, error.message) });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on(SOCKET_EVENTS.ROOM_JOIN, onJoin);
    socket.on(SOCKET_EVENTS.PLAYBACK_STATE, onState);
    socket.on(SOCKET_EVENTS.QUEUE_UPDATED, onQueue);
    socket.on(SOCKET_EVENTS.ROOM_PRESENCE, onPresence);
    socket.on(SOCKET_EVENTS.REACTION_SEND, onReaction);
    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, onChat);
    socket.on(SOCKET_EVENTS.SKIP_STATE, onSkip);
    socket.on(SOCKET_EVENTS.ROOM_UPDATED, onRoomUpdated);
    socket.on(SOCKET_EVENTS.HOST_CHANGED, onHostChanged);
    socket.on(SOCKET_EVENTS.ROOM_CLOSED, onClosed);
    socket.on(SOCKET_EVENTS.ROOM_KICKED, onKicked);
    socket.on(SOCKET_EVENTS.ERROR, onError);

    if (socket.connected) onConnect();
    else socket.connect();

    return () => {
      socket.emit(SOCKET_EVENTS.ROOM_LEAVE, { roomId });
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off(SOCKET_EVENTS.ROOM_JOIN, onJoin);
      socket.off(SOCKET_EVENTS.PLAYBACK_STATE, onState);
      socket.off(SOCKET_EVENTS.QUEUE_UPDATED, onQueue);
      socket.off(SOCKET_EVENTS.ROOM_PRESENCE, onPresence);
      socket.off(SOCKET_EVENTS.REACTION_SEND, onReaction);
      socket.off(SOCKET_EVENTS.CHAT_MESSAGE, onChat);
      socket.off(SOCKET_EVENTS.SKIP_STATE, onSkip);
      socket.off(SOCKET_EVENTS.ROOM_UPDATED, onRoomUpdated);
      socket.off(SOCKET_EVENTS.HOST_CHANGED, onHostChanged);
      socket.off(SOCKET_EVENTS.ROOM_CLOSED, onClosed);
      socket.off(SOCKET_EVENTS.ROOM_KICKED, onKicked);
      socket.off(SOCKET_EVENTS.ERROR, onError);
      useRoomLiveStore.getState().reset(null);
      usePlayerStore.getState().reset(null);
    };
  }, [roomId, currentUserId, queryClient]);

  const emitFor = useCallback(() => getSocket(), []);

  return useMemo<RoomCommands>(
    () => ({
      play: (positionMs) => emitFor().emit(SOCKET_EVENTS.PLAY, { roomId, positionMs: Math.max(0, Math.round(positionMs)) }),
      pause: (positionMs) => emitFor().emit(SOCKET_EVENTS.PAUSE, { roomId, positionMs: Math.max(0, Math.round(positionMs)) }),
      seek: (positionMs) => emitFor().emit(SOCKET_EVENTS.SEEK, { roomId, positionMs: Math.max(0, Math.round(positionMs)) }),
      changeTrack: (trackId) => emitFor().emit(SOCKET_EVENTS.CHANGE_TRACK, { roomId, trackId }),
      next: (fromVersion, ended) => emitFor().emit(SOCKET_EVENTS.NEXT, { roomId, fromVersion, ...(ended ? { ended: true } : {}) }),
      queueAdd: (trackId) => emitFor().emit(SOCKET_EVENTS.QUEUE_ADD, { roomId, trackId }),
      queueAddMany: (trackIds) => emitFor().emit(SOCKET_EVENTS.QUEUE_ADD_MANY, { roomId, trackIds }),
      queueRemove: (queueItemId) => emitFor().emit(SOCKET_EVENTS.QUEUE_REMOVE, { roomId, queueItemId }),
      queueVote: (queueItemId, value) => emitFor().emit(SOCKET_EVENTS.QUEUE_VOTE, { roomId, queueItemId, value }),
      skipVote: (vote) => emitFor().emit(SOCKET_EVENTS.SKIP_VOTE, { roomId, vote }),
      sendChat: (content) => emitFor().emit(SOCKET_EVENTS.CHAT_MESSAGE, { roomId, content }),
      sendReaction: (emoji) => emitFor().emit(SOCKET_EVENTS.REACTION_SEND, { roomId, emoji }),
      setDj: (userId, dj) => emitFor().emit(SOCKET_EVENTS.ROOM_SET_DJ, { roomId, userId, dj }),
      muteUser: (userId, muted) => emitFor().emit(SOCKET_EVENTS.ROOM_MUTE_USER, { roomId, userId, muted }),
      kickUser: (userId) => emitFor().emit(SOCKET_EVENTS.USER_KICK, { roomId, userId }),
      transferHost: (newHostId) => emitFor().emit(SOCKET_EVENTS.HOST_TRANSFER, { roomId, newHostId }),
      inviteFriend: (userId) => emitFor().emit(SOCKET_EVENTS.USER_INVITE, { roomId, userId }),
      rejoin: () => emitFor().emit(SOCKET_EVENTS.ROOM_JOIN, { roomId }),
    }),
    [roomId, emitFor],
  );
}
