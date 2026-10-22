"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { usePlayerStore } from "@/features/player/stores/player-store";
import { useTrack } from "@/features/music/hooks/use-track";
import { TrackArt, formatClock } from "@/features/rooms/components/TrackArt";

/**
 * Persistent player dock from the Stitch shell. Audio is owned by the room
 * page (one synced engine per room), so this mirrors what that room is
 * playing; elsewhere it shows an idle state whose one live action is
 * finding a room to listen together.
 */
export function PlayerBar() {
  const roomId = usePlayerStore((s) => s.roomId);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const positionMs = usePlayerStore((s) => s.currentPositionMs);
  const durationMs = usePlayerStore((s) => s.durationMs);
  const isSynced = usePlayerStore((s) => s.isSyncedWithServer);
  const { data: track } = useTrack(roomId ? currentTrackId : null);
  const active = Boolean(roomId && track);
  const progress = active && durationMs ? Math.min(100, (positionMs / durationMs) * 100) : 0;

  return (
    <footer
      aria-label="Trình phát"
      className="fixed bottom-16 left-0 right-0 z-50 flex h-16 items-center justify-between gap-md bg-surface-container-lowest/95 px-md shadow-[0_-4px_24px_rgba(0,0,0,0.6)] backdrop-blur-2xl sm:bottom-0 sm:h-24 sm:px-lg"
    >
      <div className="flex min-w-0 flex-1 items-center gap-md sm:w-1/4 sm:flex-none md:min-w-[240px]">
        {active && track ? (
          <TrackArt artworkUrl={track.artworkUrl} seed={track.id} size={56} className="hidden rounded-md shadow-lg sm:flex" />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface-container-high shadow-lg sm:h-14 sm:w-14">
            <Icon name="album" className="text-[24px] text-outline sm:text-[28px]" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-headline-sm text-on-surface">{active && track ? track.title : "Chưa phát gì"}</p>
          <p className="truncate text-body-sm text-on-surface-variant">
            {active && track ? track.artistName : "Vào một phòng để nghe cùng mọi người"}
          </p>
          {active && (
            <p className="font-technical flex items-center gap-1 text-label-mono-sm text-secondary">
              <span className={`h-1.5 w-1.5 rounded-full ${isSynced ? "bg-secondary" : "bg-[#f59e0b]"}`} />
              {isPlaying ? (isSynced ? "Đã đồng bộ" : "Đang đồng bộ…") : "Tạm dừng"}
            </p>
          )}
        </div>
      </div>

      <div className="hidden max-w-2xl flex-1 flex-col items-center gap-xs px-md sm:flex">
        <div className="flex items-center gap-md text-outline/60" aria-hidden="true">
          <Icon name={isPlaying && active ? "graphic_eq" : "play_circle"} className="text-[28px]" />
        </div>
        <div className="flex w-full items-center gap-sm">
          <span className="font-technical text-label-mono-sm text-outline">{active ? formatClock(positionMs) : "--:--"}</span>
          <div className="relative h-1.5 flex-1 rounded-full bg-surface-variant">
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <span className="font-technical text-label-mono-sm text-outline">
            {active && durationMs ? formatClock(durationMs) : "--:--"}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-md sm:w-1/4 md:min-w-[240px]">
        <Link
          href={roomId ? `/room/${roomId}` : "/rooms"}
          className="flex items-center gap-xs rounded-full bg-primary-container px-sm py-xs text-headline-sm text-on-primary-container shadow-[0_0_16px_rgba(160,120,255,0.25)] transition-opacity hover:opacity-95 sm:px-md"
        >
          <Icon name="headphones" className="text-[18px]" />
          <span className="hidden md:inline">{roomId ? "Trong phòng" : "Nghe cùng"}</span>
        </Link>
      </div>
    </footer>
  );
}
