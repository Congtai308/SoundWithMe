import type { TrackWithArtist } from "@soundwithme/types";
import { Icon } from "@/components/ui/Icon";
import type { TrackActionMode } from "@/features/rooms/hooks/use-track-actions";
import { formatClock } from "@/features/rooms/components/TrackArt";
import { LikeButton } from "@/features/library/components/LikeButton";
import { ShareTrackButton } from "@/features/messages/components/ShareTrackButton";
import { AddToPlaylistButton } from "@/features/library/components/AddToPlaylistButton";
import { artworkAt } from "@/features/music/artwork";

const PRIMARY_LABEL: Record<TrackActionMode, string> = {
  control: "Play in your room",
  add: "Add to your room's queue",
  locked: "Only the host adds songs in this room",
  "no-room": "Start a room with this song",
};

interface VideoCardProps {
  track: TrackWithArtist;
  mode: TrackActionMode;
  onPick: (trackId: string) => void;
  /** Extra "play now" button for people who control the room. */
  onPlayNow?: (trackId: string) => void;
  /** First row of results: the thumbnail loads right away and before the rest. */
  priority?: boolean;
}

/** YouTube-style result tile: 16:9 thumbnail, duration, two-line title, channel. */
export function VideoCard({ track, mode, onPick, onPlayNow, priority = false }: VideoCardProps) {
  const locked = mode === "locked";

  return (
    <article className="group relative flex flex-col gap-xs">
      <button
        type="button"
        onClick={() => onPick(track.id)}
        disabled={locked}
        aria-label={`${PRIMARY_LABEL[mode]}: ${track.title}`}
        title={PRIMARY_LABEL[mode]}
        className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface-container-high text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed"
      >
        {track.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- artwork comes from provider CDNs
          <img
            src={artworkAt(track.artworkUrl, 160)}
            alt=""
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Icon name="music_note" className="text-[32px] text-outline" />
          </span>
        )}
        {track.durationMs > 0 && (
          <span className="font-technical absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-label-mono-sm text-white">
            {formatClock(track.durationMs)}
          </span>
        )}
        {!locked && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#d946ef] text-white shadow-[0_0_24px_rgba(139,92,246,0.5)]">
              <Icon name={mode === "no-room" ? "podcasts" : mode === "add" ? "playlist_add" : "play_arrow"} className="text-[24px]" filled />
            </span>
          </span>
        )}
      </button>

      {onPlayNow && mode === "control" && (
        <button
          type="button"
          onClick={() => onPlayNow(track.id)}
          aria-label={`Play now for everyone: ${track.title}`}
          title="Play now for everyone"
          className="absolute right-1.5 top-1.5 flex h-8 items-center gap-1 rounded-full bg-black/70 px-2 text-body-sm font-semibold text-white opacity-0 transition-opacity hover:bg-black/90 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Icon name="play_circle" className="text-[16px]" filled />
          Now
        </button>
      )}

      <div className="flex min-w-0 items-start gap-1 px-0.5">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-body-md font-semibold leading-snug text-on-surface group-hover:text-primary">{track.title}</h3>
          <p className="truncate text-body-sm text-on-surface-variant">{track.artistName}</p>
        </div>
        <LikeButton trackId={track.id} size="sm" />
        <AddToPlaylistButton trackId={track.id} />
        <ShareTrackButton trackId={track.id} trackTitle={track.title} />
      </div>
    </article>
  );
}

export function VideoCardSkeleton() {
  return (
    <div className="flex flex-col gap-xs">
      <div className="aspect-video w-full animate-pulse rounded-lg bg-surface-container-high" />
      <div className="h-3.5 w-5/6 animate-pulse rounded-full bg-surface-container-high" />
      <div className="h-3 w-1/2 animate-pulse rounded-full bg-surface-container-high" />
    </div>
  );
}
