"use client";

import { useEffect } from "react";
import { ERROR_CODES, SOCKET_EVENTS } from "@soundwithme/constants";
import type {
  ErrorPayload,
  MicStatePayload,
  MicTurnPayload,
  RtcSignalEvent,
  VoiceChunkEvent,
  VoiceRelayDemandPayload,
} from "@soundwithme/realtime-contracts";
import { getSocket } from "@/services/socket-client";
import { showToast } from "@/components/ui/Toaster";
import type { VoiceEffect } from "../services/voice-fx";
import { loadIceServers } from "../services/ice-servers";
import { VoiceMesh } from "../services/voice-mesh";
import { isSinging, useKaraokeStore } from "../stores/karaoke-store";

/** Singing-friendly capture: keep echo cancellation, but let the voice through untouched otherwise. */
const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: false,
  autoGainControl: true,
  channelCount: 1,
};

let mesh: VoiceMesh | null = null;
let activeRoomId: string | null = null;

/** Imperative controls for the karaoke UI (one room session per tab). */
export const karaoke = {
  /**
   * Asks for the mic permission first, then for one of the room's mics.
   * `turn`: the line just handed us a mic — if the mic can't open, hand it on.
   */
  async requestMic(turn = false): Promise<void> {
    const store = useKaraokeStore.getState();
    if (!mesh || !activeRoomId || store.micStatus !== "off") return;
    mesh.openingMicrophone(true);
    store.setMicStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
      if (!mesh || useKaraokeStore.getState().micStatus !== "starting") {
        stream.getTracks().forEach((track) => track.stop());
        mesh?.openingMicrophone(false);
        return;
      }
      mesh.setMic(stream);
      getSocket().emit(SOCKET_EVENTS.MIC_REQUEST, { roomId: activeRoomId });
    } catch (error: unknown) {
      mesh?.openingMicrophone(false);
      if (turn && activeRoomId) getSocket().emit(SOCKET_EVENTS.MIC_RELEASE, { roomId: activeRoomId });
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      store.setMicStatus("off", denied ? "Microphone access was blocked — allow it in the browser's address bar." : "No microphone found.");
    }
  },

  /** Your own mic, or (host) someone else's by socket id. */
  releaseMic(socketId?: string): void {
    if (!activeRoomId) return;
    getSocket().emit(SOCKET_EVENTS.MIC_RELEASE, { roomId: activeRoomId, ...(socketId ? { socketId } : {}) });
    if (!socketId) stopLocalMic();
  },

  /** Wait for the next free mic: it opens by itself when your turn comes. */
  joinLine(): void {
    if (activeRoomId) getSocket().emit(SOCKET_EVENTS.MIC_LINE_JOIN, { roomId: activeRoomId });
  },

  leaveLine(): void {
    if (activeRoomId) getSocket().emit(SOCKET_EVENTS.MIC_LINE_LEAVE, { roomId: activeRoomId });
  },

  /** Your voice effect; while you sing, listeners hear the change at once. */
  setVoiceEffect(effect: VoiceEffect, amount: number): void {
    useKaraokeStore.getState().setVoiceEffect(effect, amount);
    mesh?.applyVoiceEffect();
  },

  setVoiceVolume(volume: number): void {
    useKaraokeStore.getState().setVoiceVolume(volume);
    mesh?.applyMix();
  },

  setMusicWhileSinging(percent: number): void {
    useKaraokeStore.getState().setMusicWhileSinging(percent);
    mesh?.applyMix();
  },

  setHearOtherSingers(hear: boolean): void {
    useKaraokeStore.getState().setHearOtherSingers(hear);
    mesh?.applyMix();
  },

  /** 0–1 voice level for meters ("me" = your mic). */
  level(socketId: string | "me"): number {
    return mesh?.level(socketId) ?? 0;
  },

  resume(): void {
    mesh?.resume();
  },
};

function stopLocalMic(): void {
  mesh?.setMic(null);
  useKaraokeStore.getState().setMicStatus("off");
}

/**
 * Runs karaoke voice for the active room session: mirrors MIC_STATE, relays
 * WebRTC signals into the VoiceMesh, and keeps the mic in step with what the
 * server says (a host can close it; a reconnect gets a new socket id).
 */
export function useKaraoke(roomId: string | null, userId: string | undefined, isMember: boolean): void {
  useEffect(() => {
    if (!roomId || !userId || !isMember) return;
    const socket = getSocket();
    const store = useKaraokeStore.getState();
    store.reset(roomId);
    activeRoomId = roomId;
    // TURN credentials, ready before anyone takes a mic.
    void loadIceServers();
    mesh = new VoiceMesh(socket, roomId);

    const sync = () => {
      useKaraokeStore.getState().setMySocketId(socket.id ?? null);
      socket.emit(SOCKET_EVENTS.MIC_SYNC, { roomId });
    };

    const onMicState = ({ roomId: stateRoom, singers, maxSingers, line }: MicStatePayload) => {
      if (stateRoom !== roomId || !mesh) return;
      const state = useKaraokeStore.getState();
      const hadLine = state.line.length > 0;
      state.setSingers(roomId, singers, maxSingers, line ?? []);
      const holdsMic = isSinging({ singers, mySocketId: socket.id ?? null });
      if (holdsMic && state.micStatus === "starting") state.setMicStatus("live");
      // The host closed our mic, our turn passed on, or it was lost: stop capturing.
      if (!holdsMic && state.micStatus === "live") {
        stopLocalMic();
        if (hadLine) useKaraokeStore.getState().setMicStatus("off", "Your turn's over — the mic passed to the next singer.");
      }
      mesh.syncSingers(singers);
    };
    // The line kept a mic for us: open it (it's released again if the mic can't open).
    const onTurn = ({ roomId: turnRoom }: MicTurnPayload) => {
      if (turnRoom !== roomId) return;
      showToast({ icon: "mic", tone: "success", title: "Your turn to sing!", body: "Your mic is opening — use headphones." });
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Your turn to sing", { body: "A mic is free in your room", tag: `sing-${roomId}` });
        } catch {
          // Some browsers only allow notifications from a service worker.
        }
      }
      if (useKaraokeStore.getState().micStatus === "off") void karaoke.requestMic(true);
      else socket.emit(SOCKET_EVENTS.MIC_REQUEST, { roomId });
    };
    const onSignal = (event: RtcSignalEvent) => void mesh?.handleSignal(event);
    const onChunk = (chunk: VoiceChunkEvent) => mesh?.handleChunk(chunk);
    const onDemand = ({ roomId: demandRoom, listeners, pcmOnly }: VoiceRelayDemandPayload) => {
      if (demandRoom === roomId) mesh?.setRelayDemand(listeners, pcmOnly);
    };
    const onError = (error: ErrorPayload) => {
      if (error.code === ERROR_CODES.MIC_FULL && useKaraokeStore.getState().micStatus === "starting") {
        mesh?.setMic(null);
        useKaraokeStore.getState().setMicStatus("off", error.message);
      }
    };
    // The server echoes ROOM_JOIN once this socket is (back) in the room —
    // only then may it ask about mics. A new socket id means a reconnect:
    // old peers are gone, and so is our mic.
    const onJoined = ({ roomId: joinedRoom, userId: joinedUser }: { roomId: string; userId: string }) => {
      if (joinedRoom !== roomId || joinedUser !== userId) return;
      const previous = useKaraokeStore.getState().mySocketId;
      if (previous && previous !== socket.id) {
        const wasSinging = useKaraokeStore.getState().micStatus !== "off";
        mesh?.destroy();
        mesh = new VoiceMesh(socket, roomId);
        useKaraokeStore.getState().reset(roomId);
        if (wasSinging) useKaraokeStore.getState().setMicStatus("off", "Connection dropped — tap Sing to take the mic again.");
      }
      sync();
    };
    // Any tap or click unlocks Web Audio (autoplay rules). On touch screens
    // pointerdown doesn't count as a gesture — pointerup/touchend do.
    const onGesture = () => mesh?.resume();
    const gestures = ["pointerup", "touchend", "keydown"] as const;

    socket.on(SOCKET_EVENTS.MIC_STATE, onMicState);
    socket.on(SOCKET_EVENTS.MIC_TURN, onTurn);
    socket.on(SOCKET_EVENTS.RTC_SIGNAL, onSignal);
    socket.on(SOCKET_EVENTS.VOICE_CHUNK, onChunk);
    socket.on(SOCKET_EVENTS.VOICE_RELAY_DEMAND, onDemand);
    socket.on(SOCKET_EVENTS.ERROR, onError);
    socket.on(SOCKET_EVENTS.ROOM_JOIN, onJoined);
    for (const type of gestures) document.addEventListener(type, onGesture);
    sync();

    return () => {
      if (useKaraokeStore.getState().micStatus !== "off") socket.emit(SOCKET_EVENTS.MIC_RELEASE, { roomId });
      socket.off(SOCKET_EVENTS.MIC_STATE, onMicState);
      socket.off(SOCKET_EVENTS.MIC_TURN, onTurn);
      socket.off(SOCKET_EVENTS.RTC_SIGNAL, onSignal);
      socket.off(SOCKET_EVENTS.VOICE_CHUNK, onChunk);
      socket.off(SOCKET_EVENTS.VOICE_RELAY_DEMAND, onDemand);
      socket.off(SOCKET_EVENTS.ERROR, onError);
      socket.off(SOCKET_EVENTS.ROOM_JOIN, onJoined);
      for (const type of gestures) document.removeEventListener(type, onGesture);
      mesh?.destroy();
      mesh = null;
      activeRoomId = null;
      useKaraokeStore.getState().reset(null);
    };
  }, [roomId, userId, isMember]);
}
