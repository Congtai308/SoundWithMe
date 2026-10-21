"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayerStore } from "@/features/player/stores/player-store";
import { useRoomSession } from "../components/RoomSessionProvider";
import { useRoomLiveStore } from "../stores/room-live-store";

const NOTICE_MS = 2_500;

/**
 * - "control": in a room and allowed to change the song
 * - "add": in a room and allowed to queue songs
 * - "locked": in a room, but only the host adds songs
 * - "no-room": not listening anywhere — picking a song starts a room
 */
export type TrackActionMode = "control" | "add" | "locked" | "no-room";

/** What picking a song from the catalog does, given the room this tab is in. */
export function useTrackActions() {
  const router = useRouter();
  const { roomId, room, canControl, canAdd, commands } = useRoomSession();
  const membership = useRoomLiveStore((s) => s.membership);
  const hasTrack = usePlayerStore((s) => Boolean(s.serverState));
  const [notice, setNotice] = useState<string | null>(null);

  const inRoom = Boolean(roomId && membership === "member");
  const mode: TrackActionMode = !inRoom ? "no-room" : canControl ? "control" : canAdd ? "add" : "locked";

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const queue = useCallback(
    (trackId: string) => {
      commands.queueAdd(trackId);
      setNotice(`Đã thêm vào hàng chờ của ${room?.name ?? "phòng bạn"}`);
    },
    [commands, room?.name],
  );

  const playNow = useCallback(
    (trackId: string) => {
      commands.changeTrack(trackId);
      setNotice(`Đang phát trong ${room?.name ?? "phòng bạn"}`);
    },
    [commands, room?.name],
  );

  /** The single-click action: play if the room is silent, otherwise queue. */
  const pick = useCallback(
    (trackId: string) => {
      if (mode === "no-room") router.push(`/rooms/new?play=${encodeURIComponent(trackId)}`);
      else if (mode === "control" && !hasTrack) playNow(trackId);
      else if (mode === "control" || mode === "add") queue(trackId);
    },
    [mode, hasTrack, router, playNow, queue],
  );

  return { mode, pick, queue, playNow, notice };
}
