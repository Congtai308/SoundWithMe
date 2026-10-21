import type { TrackWithArtist } from "@soundwithme/types";
import { Icon } from "@/components/ui/Icon";
import { artworkAt } from "@/features/music/artwork";

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Deterministic gradient per track (from its id) rather than a generic grey
// placeholder box — keeps the "artwork as hero" feel even without real art.
function artworkGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 30%))`;
}

export function TrackRow({ track, index }: { track: TrackWithArtist; index?: number }) {
  return (
    <div className="group flex items-center gap-md rounded-md px-sm py-xs transition-colors hover:bg-white/[0.04]">
      {index !== undefined && (
        <span className="font-technical w-6 shrink-0 text-center text-label-mono-md text-outline">
          {String(index + 1).padStart(2, "0")}
        </span>
      )}
      {track.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- artwork comes from provider CDNs
        <img src={artworkAt(track.artworkUrl, 48)} alt="" loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-sm object-cover shadow-md" />
      ) : (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm shadow-md"
          style={{ background: artworkGradient(track.id) }}
          aria-hidden="true"
        >
          <Icon name="music_note" className="text-[20px] text-white/80" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-headline-sm text-on-surface group-hover:text-primary">{track.title}</p>
        <p className="truncate text-body-sm text-on-surface-variant">{track.artistName}</p>
      </div>
      <span className="font-technical shrink-0 text-label-mono-sm text-outline">
        {formatDuration(track.durationMs)}
      </span>
    </div>
  );
}

export function TrackRowSkeleton() {
  return (
    <div className="flex items-center gap-md px-sm py-xs">
      <div className="h-12 w-12 shrink-0 animate-pulse rounded-sm bg-surface-container-high" />
      <div className="flex flex-1 flex-col gap-xs">
        <div className="h-3.5 w-1/2 animate-pulse rounded-full bg-surface-container-high" />
        <div className="h-3 w-1/3 animate-pulse rounded-full bg-surface-container-high" />
      </div>
    </div>
  );
}
