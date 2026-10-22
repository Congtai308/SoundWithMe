"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { VideoSlot } from "@/features/player/components/VideoSlot";
import { usePlayerStore } from "@/features/player/stores/player-store";
import { useRoomLiveStore } from "../stores/room-live-store";
import { useRoomSessionStore } from "../stores/room-session-store";
import { useRoomSession } from "./RoomSessionProvider";
import { formatClock } from "./TrackArt";

/**
 * Floating player shown while the user browses away from their room. The
 * video stays visible at ≥200px tall (YouTube embed requirement), so there
 * is no collapsed state: close stops listening instead.
 */
export function MiniPlayer() {
  const pathname = usePathname();
  const { roomId, room, track, canControl, commands } = useRoomSession();
  const exit = useRoomSessionStore((s) => s.exit);
  const membership = useRoomLiveStore((s) => s.membership);
  const hasQueue = useRoomLiveStore((s) => s.queue.length > 0);
  const hasTrack = usePlayerStore((s) => Boolean(s.serverState));
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const positionMs = usePlayerStore((s) => s.currentPositionMs);
  const storeDuration = usePlayerStore((s) => s.durationMs);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);

  if (!roomId || membership !== "member" || !hasTrack || pathname === `/room/${roomId}`) return null;

  const durationMs = storeDuration || track?.durationMs || 0;
  const position = durationMs ? Math.min(positionMs, durationMs) : positionMs;

  return (
    <aside
      aria-label="Trình phát mini"
      className="fixed bottom-20 right-md z-[19] flex w-[min(356px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-white/[0.1] bg-surface-container-lowest shadow-[0_12px_36px_-4px_rgba(0,0,0,0.75),0_0_24px_-2px_rgba(139,92,246,0.18)] sm:bottom-md"
    >
      <div className="flex items-center justify-between gap-xs px-sm py-1.5">
        <Link
          href={`/room/${roomId}`}
          className="flex min-w-0 items-center gap-1 text-body-sm text-on-surface-variant hover:text-on-surface"
        >
          <Icon name="sensors" className="text-[16px] text-tertiary" />
          <span className="truncate">{room?.name ?? "Phòng của bạn"}</span>
        </Link>
        <div className="flex shrink-0 items-center">
          <Link
            href={`/room/${roomId}`}
            aria-label="Mở phòng"
            title="Mở phòng"
            className="flex h-7 w-7 items-center justify-center rounded-full text-outline hover:bg-white/[0.08] hover:text-on-surface"
          >
            <Icon name="open_in_full" className="text-[16px]" />
          </Link>
          <button
            type="button"
            onClick={exit}
            aria-label="Dừng nghe"
            title="Dừng nghe"
            className="flex h-7 w-7 items-center justify-center rounded-full text-outline hover:bg-white/[0.08] hover:text-on-surface"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      </div>

      <VideoSlot kind="mini" className="h-[200px] w-full bg-black" />

      <div className="flex flex-col gap-1 px-sm pt-xs">
        <p className="truncate text-headline-sm text-on-surface">{track?.title ?? "Đang tải…"}</p>
        <p className="truncate text-body-sm text-on-surface-variant">{track?.artistName}</p>
        <div className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.12]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-secondary via-[#8B5CF6] to-[#ec4899]"
            style={{ width: durationMs ? `${(position / durationMs) * 100}%` : "0%" }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-xs px-xs py-xs">
        <div className="flex items-center">
          <MiniButton
            label="Phát lại từ đầu cho cả phòng"
            icon="skip_previous"
            disabled={!canControl}
            onClick={() => commands.seek(0)}
          />
          <button
            type="button"
            disabled={!canControl}
            onClick={() => (isPlaying ? commands.pause(position) : commands.play(position))}
            aria-label={isPlaying ? "Tạm dừng cho cả phòng" : "Phát cho cả phòng"}
            title={canControl ? undefined : "Chỉ chủ phòng điều khiển nhạc trong phòng này"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#d946ef] text-white disabled:opacity-40"
          >
            <Icon name={isPlaying ? "pause" : "play_arrow"} className="text-[22px]" filled />
          </button>
          <MiniButton
            label="Chuyển sang bài tiếp theo"
            icon="skip_next"
            disabled={!canControl || !hasQueue}
            onClick={() => commands.next(usePlayerStore.getState().stateVersion)}
          />
          <span className="font-technical ml-xs text-label-mono-sm text-outline">
            {formatClock(position)} / {durationMs ? formatClock(durationMs) : "--:--"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <MiniButton
            label={isMuted ? "Bật tiếng" : "Tắt tiếng"}
            icon={isMuted || volume === 0 ? "volume_off" : "volume_up"}
            disabled={false}
            onClick={toggleMute}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Âm lượng của bạn"
            className="h-1 w-16 cursor-pointer accent-[#8B5CF6]"
          />
        </div>
      </div>
    </aside>
  );
}

function MiniButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface disabled:opacity-30"
    >
      <Icon name={icon} className="text-[20px]" filled />
    </button>
  );
}
