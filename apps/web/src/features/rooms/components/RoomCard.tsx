"use client";

import Link from "next/link";
import type { Room } from "@soundwithme/types";
import { Icon } from "@/components/ui/Icon";
import { useTrack } from "@/features/music/hooks/use-track";

const ROOM_TYPE_LABEL: Record<Room["type"], string> = {
  public: "Công khai",
  duo: "Nghe đôi",
  friends: "Bạn bè",
  private: "Riêng tư",
  community: "Cộng đồng",
};

// Deterministic artwork gradient per room so cards are distinguishable
// without real cover art (same approach as TrackRow).
function coverGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue} 65% 45%), hsl(${(hue + 50) % 360} 70% 22%))`;
}

/** Live room card: the cover is the song playing right now, falling back to the room's cover. */
export function RoomCard({ room, featured = false }: { room: Room; featured?: boolean }) {
  const { data: track } = useTrack(room.currentTrackId);
  const coverUrl = track?.artworkUrl ?? room.coverUrl;
  const isFull = room.memberCount >= room.settings.maxListeners;

  return (
    <Link
      href={`/room/${room.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-surface-container-low transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(160,120,255,0.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
        featured ? "border-primary-container/50" : "border-white/[0.06]"
      }`}
    >
      <div className="relative aspect-video overflow-hidden" style={coverUrl ? undefined : { background: coverGradient(room.id) }}>
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- artwork comes from provider CDNs
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center" aria-hidden="true">
            <Icon name="graphic_eq" className="text-[48px] text-white/70" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-black/10 to-black/30" />

        <span className="font-technical absolute left-sm top-sm inline-flex items-center gap-1.5 rounded-full bg-black/60 px-sm py-0.5 text-label-mono-sm uppercase text-tertiary-container backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-tertiary-container motion-safe:animate-pulse" />
          Live
        </span>
        <span className="font-technical absolute right-sm top-sm inline-flex items-center gap-1 rounded-full bg-black/60 px-sm py-0.5 text-label-mono-sm text-on-surface backdrop-blur-md">
          <Icon name="headphones" className="text-[14px]" />
          {room.memberCount} đang nghe
        </span>
        <span className="absolute bottom-sm right-sm flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-primary-container text-on-primary-container opacity-0 shadow-[0_0_20px_rgba(160,120,255,0.5)] transition-all group-hover:translate-y-0 group-hover:opacity-100">
          <Icon name="play_arrow" className="text-[26px]" filled />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-xs p-md">
        <div className="flex items-center justify-between gap-xs">
          <h3 className="truncate text-headline-md text-on-surface">{room.name}</h3>
          <span className="font-technical shrink-0 rounded-full bg-surface-container-high px-xs py-0.5 text-label-mono-sm text-primary">
            {ROOM_TYPE_LABEL[room.type]}
          </span>
        </div>

        {track ? (
          <p className="flex min-w-0 items-center gap-1.5 text-body-sm text-secondary">
            <Icon name="equalizer" className="shrink-0 text-[16px]" />
            <span className="truncate">
              <span className="text-on-surface-variant">Đang phát: </span>
              {track.title}
            </span>
          </p>
        ) : (
          <p className="truncate text-body-sm text-on-surface-variant">{room.description ?? "Chưa phát bài nào — vào chọn nhạc nhé"}</p>
        )}

        <div className="mt-auto flex items-center justify-between pt-xs text-body-sm">
          <span className="text-outline">{isFull ? "Phòng đã đầy" : `Còn ${room.settings.maxListeners - room.memberCount} chỗ`}</span>
          <span className="flex items-center gap-1 font-semibold text-on-surface transition-colors group-hover:text-primary">
            Vào nghe cùng
            <Icon name="arrow_forward" className="text-[18px] transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function RoomCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-container-low">
      <div className="aspect-video animate-pulse bg-surface-container-high" />
      <div className="flex flex-col gap-xs p-md">
        <div className="h-5 w-2/3 animate-pulse rounded-full bg-surface-container-high" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-surface-container-high" />
        <div className="mt-xs h-3 w-1/3 animate-pulse rounded-full bg-surface-container-high" />
      </div>
    </div>
  );
}
