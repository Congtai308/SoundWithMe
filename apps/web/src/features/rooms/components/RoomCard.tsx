"use client";

import Link from "next/link";
import type { Room } from "@soundwithme/types";
import { Icon } from "@/components/ui/Icon";
import { useTrack } from "@/features/music/hooks/use-track";
import { artworkAt } from "@/features/music/artwork";

const ROOM_TYPE_LABEL: Record<Room["type"], string> = {
  public: "Công khai",
  duo: "Nghe đôi",
  friends: "Bạn bè",
  private: "Riêng tư",
  community: "Cộng đồng",
};

/** Listener faces shown before "+N". */
const STACK_SIZE = 3;

function hueOf(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return Math.abs(hash) % 360;
}

// Deterministic gradient per room so cards are distinguishable without cover art.
function coverGradient(id: string): string {
  const hue = hueOf(id);
  return `linear-gradient(135deg, hsl(${hue} 65% 45%), hsl(${(hue + 50) % 360} 70% 22%))`;
}

/**
 * Live room card: the room's face is the song playing right now (falling
 * back to its cover), then who's listening, how many songs wait, and its
 * topic. Lobby rooms (`room.topic`) are the app's own themed rooms.
 */
export function RoomCard({ room, featured = false }: { room: Room; featured?: boolean }) {
  const { data: track } = useTrack(room.currentTrackId);
  const coverUrl = track?.artworkUrl ?? room.coverUrl;
  const listeners = room.listenerCount;
  const faces = Math.min(STACK_SIZE, listeners);
  const hue = hueOf(room.id);

  return (
    <Link
      href={`/room/${room.id}`}
      className={`group relative flex flex-col gap-sm overflow-hidden rounded-2xl border bg-surface-container-low p-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-container/40 hover:shadow-[0_12px_32px_rgba(160,120,255,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
        featured ? "border-primary-container/40" : "border-white/[0.06]"
      }`}
    >
      {/* Tinted by what's playing: the artwork, blurred, glows from the card's corner. */}
      <span aria-hidden="true" className="pointer-events-none absolute -left-10 -top-12 h-40 w-56 opacity-25 blur-3xl transition-opacity duration-300 group-hover:opacity-40">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- same thumbnail as the cover below, already cached
          <img src={artworkAt(coverUrl, 96)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <span className="block h-full w-full" style={{ background: coverGradient(room.id) }} />
        )}
      </span>
      <div className="relative flex min-w-0 items-center gap-sm">
        <span className="relative shrink-0">
          <span
            className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl"
            style={coverUrl ? undefined : { background: coverGradient(room.id) }}
          >
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- artwork comes from provider CDNs
              <img src={artworkAt(coverUrl, 96)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            ) : (
              <Icon name="graphic_eq" className="text-[22px] text-white/80" />
            )}
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-container-low bg-success" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate text-headline-sm font-bold text-on-surface">{room.name}</h3>
          {track ? (
            <p className="flex min-w-0 items-center gap-1.5 text-body-sm text-success">
              <span className="flex h-2.5 shrink-0 items-end gap-[2px]" aria-hidden="true">
                <span className="eq-bar h-full w-[3px] rounded-full bg-current" />
                <span className="eq-bar h-full w-[3px] rounded-full bg-current [animation-delay:150ms]" />
                <span className="eq-bar h-full w-[3px] rounded-full bg-current [animation-delay:300ms]" />
              </span>
              <span className="truncate">Đang phát · {track.title}</span>
            </p>
          ) : (
            <p className="truncate text-body-sm text-on-surface-variant">{room.description ?? "Vào chọn bài đầu tiên nhé"}</p>
          )}
        </div>
      </div>

      <div className="relative flex min-w-0 items-center gap-xs">
        {faces > 0 && (
          <span className="flex shrink-0 items-center" aria-hidden="true">
            {Array.from({ length: faces }, (_, i) => (
              <span
                key={i}
                className="-ml-1.5 h-6 w-6 rounded-full border-2 border-surface-container-low first:ml-0"
                style={{
                  background: `linear-gradient(135deg, hsl(${(hue + i * 70) % 360} 80% 70%), hsl(${(hue + i * 70 + 40) % 360} 70% 45%))`,
                }}
              />
            ))}
            {listeners > faces && (
              <span className="font-technical -ml-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-surface-container-low bg-surface-container-highest px-1 text-[10px] text-on-surface-variant">
                +{listeners - faces}
              </span>
            )}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-body-sm text-outline">
          {listeners} đang nghe{room.upcomingCount !== undefined ? ` · ${room.upcomingCount} bài` : ""}
        </span>
        {room.topic ? (
          <span className="shrink-0 rounded-full border border-secondary/30 bg-secondary/10 px-xs py-0.5 text-label-mono-sm text-secondary">
            {room.topic.emoji} {room.topic.label}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-surface-container-high px-xs py-0.5 text-label-mono-sm text-primary">
            {ROOM_TYPE_LABEL[room.type]}
          </span>
        )}
        {featured && (
          <span className="shrink-0 rounded-full border border-primary-container/50 bg-primary-container/15 px-xs py-0.5 text-label-mono-sm text-primary">
            Nổi bật
          </span>
        )}
      </div>

      <div className="relative flex items-center justify-between border-t border-white/[0.05] pt-sm text-body-sm text-on-surface-variant transition-colors group-hover:text-primary">
        Nghe cùng
        <Icon name="arrow_forward" className="text-[18px] transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

export function RoomCardSkeleton() {
  return (
    <div className="flex flex-col gap-sm rounded-2xl border border-white/[0.06] bg-surface-container-low p-md">
      <div className="flex items-center gap-sm">
        <div className="h-11 w-11 animate-pulse rounded-xl bg-surface-container-high" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-container-high" />
          <div className="h-3 w-1/3 animate-pulse rounded-full bg-surface-container-high" />
        </div>
      </div>
      <div className="h-6 w-1/2 animate-pulse rounded-full bg-surface-container-high" />
      <div className="h-4 w-1/4 animate-pulse rounded-full bg-surface-container-high" />
    </div>
  );
}
