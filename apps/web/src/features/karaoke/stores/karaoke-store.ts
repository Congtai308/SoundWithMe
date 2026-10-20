import { create } from "zustand";
import type { MicSinger } from "@soundwithme/realtime-contracts";
import type { VoiceEffect } from "../services/voice-fx";

const VOLUME_STORAGE_KEY = "swm.karaoke.voiceVolume";
const MUSIC_STORAGE_KEY = "swm.karaoke.musicWhileSinging";
const EFFECT_STORAGE_KEY = "swm.karaoke.voiceEffect";
const EFFECT_AMOUNT_STORAGE_KEY = "swm.karaoke.voiceEffectAmount";
const EFFECTS: VoiceEffect[] = ["off", "room", "hall", "echo"];

function readEffect(): VoiceEffect {
  try {
    const value = window.localStorage.getItem(EFFECT_STORAGE_KEY);
    return EFFECTS.find((effect) => effect === value) ?? "room";
  } catch {
    return "room";
  }
}

function readPercent(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    const stored = raw === null ? NaN : Number(raw);
    return Number.isFinite(stored) && stored >= 0 && stored <= 100 ? stored : fallback;
  } catch {
    return fallback;
  }
}

function writePercent(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // The setting just won't persist.
  }
}

export type MicStatus = "off" | "starting" | "live";

/** UI-facing karaoke state. The audio itself lives in VoiceMesh. */
interface KaraokeStore {
  roomId: string | null;
  singers: MicSinger[];
  maxSingers: number;
  /** Waiting for a mic, first in line first. */
  line: MicSinger[];
  /** Your voice effect when you sing (everyone hears it). */
  voiceEffect: VoiceEffect;
  /** 0–100 */
  voiceEffectAmount: number;
  /** This tab's socket — singers are per tab. */
  mySocketId: string | null;
  micStatus: MicStatus;
  micError: string | null;
  /** Singers' voices, 0–100 (100 = twice the mic's own level), for this listener only. */
  voiceVolume: number;
  /** Music level while you hear someone sing, % of your normal volume (karaoke ducking). */
  musicWhileSinging: number;
  /** While singing: others' voices arrive late, so they're off unless asked for. */
  hearOtherSingers: boolean;
  /** Music delay applied to line voices up with it (0 while singing). */
  listenDelayMs: number;
  /** socketId → whether the voice connection is up. */
  connected: Record<string, boolean>;
  /** socketId → the voice connection failed (the network blocks it; retrying). */
  voiceFailed: Record<string, boolean>;
  /** socketId → this voice comes through the server relay. */
  relayed: Record<string, boolean>;

  reset: (roomId: string | null) => void;
  setSingers: (roomId: string, singers: MicSinger[], maxSingers: number, line: MicSinger[]) => void;
  setVoiceEffect: (effect: VoiceEffect, amount: number) => void;
  setMySocketId: (socketId: string | null) => void;
  setMicStatus: (status: MicStatus, error?: string | null) => void;
  setVoiceVolume: (volume: number) => void;
  setMusicWhileSinging: (percent: number) => void;
  setHearOtherSingers: (hear: boolean) => void;
  setListenDelayMs: (ms: number) => void;
  setConnected: (socketId: string, connected: boolean) => void;
  setVoiceFailed: (socketId: string, failed: boolean) => void;
  setRelayed: (socketId: string, relayed: boolean) => void;
}

export const useKaraokeStore = create<KaraokeStore>((set, get) => ({
  roomId: null,
  singers: [],
  maxSingers: 4,
  line: [],
  voiceEffect: typeof window === "undefined" ? "room" : readEffect(),
  voiceEffectAmount: typeof window === "undefined" ? 50 : readPercent(EFFECT_AMOUNT_STORAGE_KEY, 50),
  mySocketId: null,
  micStatus: "off",
  micError: null,
  voiceVolume: typeof window === "undefined" ? 75 : readPercent(VOLUME_STORAGE_KEY, 75),
  musicWhileSinging: typeof window === "undefined" ? 45 : readPercent(MUSIC_STORAGE_KEY, 45),
  hearOtherSingers: false,
  listenDelayMs: 0,
  connected: {},
  voiceFailed: {},
  relayed: {},

  reset: (roomId) =>
    set({ roomId, singers: [], line: [], micStatus: "off", micError: null, listenDelayMs: 0, connected: {}, voiceFailed: {}, relayed: {}, hearOtherSingers: false }),
  setSingers: (roomId, singers, maxSingers, line) => {
    if (roomId === get().roomId) set({ singers, maxSingers, line });
  },
  setVoiceEffect: (voiceEffect, voiceEffectAmount) => {
    set({ voiceEffect, voiceEffectAmount });
    try {
      window.localStorage.setItem(EFFECT_STORAGE_KEY, voiceEffect);
    } catch {
      // The choice just won't persist.
    }
    writePercent(EFFECT_AMOUNT_STORAGE_KEY, voiceEffectAmount);
  },
  setMySocketId: (mySocketId) => set({ mySocketId }),
  setMicStatus: (micStatus, micError = null) => set({ micStatus, micError }),
  setVoiceVolume: (voiceVolume) => {
    set({ voiceVolume });
    writePercent(VOLUME_STORAGE_KEY, voiceVolume);
  },
  setMusicWhileSinging: (musicWhileSinging) => {
    set({ musicWhileSinging });
    writePercent(MUSIC_STORAGE_KEY, musicWhileSinging);
  },
  setHearOtherSingers: (hearOtherSingers) => set({ hearOtherSingers }),
  setListenDelayMs: (listenDelayMs) => set({ listenDelayMs }),
  setConnected: (socketId, connected) => set({ connected: { ...get().connected, [socketId]: connected } }),
  setRelayed: (socketId, relayed) => set({ relayed: { ...get().relayed, [socketId]: relayed } }),
  setVoiceFailed: (socketId, failed) => {
    if (Boolean(get().voiceFailed[socketId]) !== failed) set({ voiceFailed: { ...get().voiceFailed, [socketId]: failed } });
  },
}));

/** True when this tab holds a mic. */
export function isSinging(state: Pick<KaraokeStore, "singers" | "mySocketId">): boolean {
  return state.mySocketId !== null && state.singers.some((s) => s.socketId === state.mySocketId);
}
