import { create } from "zustand";
import type { TrackWithArtist } from "@soundwithme/types";

const STORAGE_KEY = "swm.recent-tracks";
const MAX_RECENT = 12;

/** Just enough to render a "Recently played" row — not a cache of the catalog. */
export type RecentTrack = Pick<TrackWithArtist, "id" | "title" | "artistName" | "artworkUrl" | "durationMs">;

function read(): RecentTrack[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as RecentTrack[]).slice(0, MAX_RECENT) : [];
  } catch {
    // Storage unavailable or corrupted: start with an empty history.
    return [];
  }
}

function write(tracks: RecentTrack[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
  } catch {
    // History just won't persist across visits.
  }
}

interface RecentTracksStore {
  tracks: RecentTrack[];
  hydrated: boolean;
  hydrate: () => void;
  push: (track: TrackWithArtist) => void;
  clear: () => void;
}

/** This browser's listening history (per-viewer convenience, localStorage). */
export const useRecentTracks = create<RecentTracksStore>((set, get) => ({
  tracks: [],
  hydrated: false,
  hydrate: () => {
    if (!get().hydrated) set({ tracks: read(), hydrated: true });
  },
  push: (track) => {
    const entry: RecentTrack = {
      id: track.id,
      title: track.title,
      artistName: track.artistName,
      artworkUrl: track.artworkUrl,
      durationMs: track.durationMs,
    };
    const base = get().hydrated ? get().tracks : read();
    const tracks = [entry, ...base.filter((t) => t.id !== track.id)].slice(0, MAX_RECENT);
    write(tracks);
    set({ tracks, hydrated: true });
  },
  clear: () => {
    write([]);
    set({ tracks: [], hydrated: true });
  },
}));
