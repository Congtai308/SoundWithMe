"use client";

import type { QueueItem, TrackWithArtist } from "@soundwithme/types";
import { Icon } from "@/components/ui/Icon";
import { Equalizer, TrackArt, formatClock } from "./TrackArt";

interface RoomQueueSidebarProps {
  queue: QueueItem[];
  nowPlaying: TrackWithArtist | undefined;
  isPlaying: boolean;
  currentUserId: string;
  /** Host or DJ: may remove anyone's songs. */
  canManage: boolean;
  canAdd: boolean;
  canControl: boolean;
  /** Nothing has played in this room yet but songs are queued. */
  canStartQueue: boolean;
  onAddSong: () => void;
  onRemove: (queueItemId: string) => void;
  onVote: (queueItemId: string, value: 1 | 0 | -1) => void;
  onStartQueue: () => void;
}

/** Column 1 — shared queue (TASK-04). */
export function RoomQueueSidebar({
  queue,
  nowPlaying,
  isPlaying,
  currentUserId,
  canManage,
  canAdd,
  canControl,
  canStartQueue,
  onAddSong,
  onRemove,
  onVote,
  onStartQueue,
}: RoomQueueSidebarProps) {
  return (
    <section
      aria-label="Queue"
      className="room-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.025] px-md py-sm">
        <div className="flex items-center gap-xs">
          <h2 className="text-headline-sm text-on-surface">Queue</h2>
          <span className="font-technical rounded-full bg-white/10 px-1.5 py-0.5 text-label-mono-sm text-on-surface-variant">
            {queue.length} {queue.length === 1 ? "song" : "songs"}
          </span>
        </div>
        {canAdd ? (
          <button
            type="button"
            onClick={onAddSong}
            className="flex items-center gap-1 text-body-sm font-semibold text-tertiary transition-colors hover:text-tertiary-fixed"
          >
            <Icon name="add" className="text-[18px]" />
            Add Song
          </button>
        ) : (
          <span className="text-body-sm text-outline" title="Only the host and DJs can add songs in this room">
            Host &amp; DJs pick
          </span>
        )}
      </header>

      <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-xs">
        {nowPlaying && (
          <div className="glass-card-active relative flex items-center gap-sm overflow-hidden rounded-md p-2.5">
            <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-tertiary-container to-secondary" />
            <span className="flex w-5 justify-center">
              {isPlaying ? (
                <Equalizer />
              ) : (
                <Icon name="pause" className="text-[16px] text-outline" />
              )}
            </span>
            <TrackArt artworkUrl={nowPlaying.artworkUrl} seed={nowPlaying.id} size={52} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-body-md font-semibold leading-snug text-on-surface">
                {nowPlaying.title}
              </p>
              <p className="flex items-center gap-1 truncate text-body-sm text-tertiary">
                <span className="h-1.5 w-1.5 rounded-full bg-tertiary-container" />
                {isPlaying ? "Playing now" : "Paused"} · {nowPlaying.artistName}
              </p>
            </div>
          </div>
        )}

        {queue.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-xs px-md py-xl text-center">
            <Icon name="queue_music" className="text-[32px] text-outline" />
            <p className="text-body-md text-on-surface">Nothing queued</p>
            <p className="text-body-sm text-on-surface-variant">
              {canAdd
                ? "Paste a YouTube link to line up the next song."
                : "The host and DJs haven't queued anything yet."}
            </p>
          </div>
        ) : (
          <>
            <p className="font-technical flex items-center justify-between px-xs pb-0.5 pt-sm text-label-mono-sm uppercase tracking-wider text-outline">
              Up next
              <span className="normal-case tracking-normal" title="Most-wanted songs play first">
                Sorted by votes
              </span>
            </p>
            <ol className="flex flex-col gap-1.5">
              {queue.map((item, index) => {
                const canRemove = canManage || item.addedBy === currentUserId;
                return (
                  <li
                    key={item.id}
                    className="group flex items-center gap-sm rounded-md border border-white/[0.05] bg-white/[0.03] p-2 transition-colors hover:border-white/[0.12] hover:bg-white/[0.07]"
                  >
                    <span className="font-technical w-5 text-center text-label-mono-md text-on-surface-variant">
                      {index + 1}
                    </span>
                    <TrackArt
                      artworkUrl={item.track.artworkUrl}
                      seed={item.trackId}
                      size={48}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        title={item.track.title}
                        className="line-clamp-2 text-body-md font-semibold leading-snug text-on-surface"
                      >
                        {item.track.title}
                      </p>
                      <p className="mt-0.5 truncate text-body-sm text-on-surface-variant">
                        {item.addedByName}
                        {item.track.durationMs > 0 && (
                          <span className="text-outline">
                            {" "}
                            · {formatClock(item.track.durationMs)}
                          </span>
                        )}
                      </p>
                    </div>
                    <QueueVotes item={item} currentUserId={currentUserId} onVote={onVote} />
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        aria-label={`Remove ${item.track.title} from the queue`}
                        className="rounded-full p-1 text-outline opacity-0 transition hover:text-error focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Icon name="close" className="text-[18px]" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-sm border-t border-white/[0.08] px-md py-sm">
        <span className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
          <span className="h-2 w-2 rounded-full bg-success" />
          Auto-play next
        </span>
        {canStartQueue && canControl && (
          <button
            type="button"
            onClick={onStartQueue}
            className="flex items-center gap-1 rounded-full bg-primary-container px-sm py-1 text-body-sm font-semibold text-on-primary-container"
          >
            <Icon name="play_arrow" className="text-[18px]" filled />
            Start queue
          </button>
        )}
      </footer>
    </section>
  );
}

/** Thumbs up / down: the queue plays the highest score first. Tap again to take your vote back. */
function QueueVotes({
  item,
  currentUserId,
  onVote,
}: {
  item: QueueItem;
  currentUserId: string;
  onVote: (queueItemId: string, value: 1 | 0 | -1) => void;
}) {
  const up = item.upvotes.includes(currentUserId);
  const down = item.downvotes.includes(currentUserId);
  return (
    <div className="flex shrink-0 flex-col items-center" aria-label={`Score ${item.score}`}>
      <button
        type="button"
        aria-pressed={up}
        aria-label={up ? "Take back your vote" : `Play ${item.track.title} sooner`}
        title="Play sooner"
        onClick={() => onVote(item.id, up ? 0 : 1)}
        className={`rounded-full p-0.5 transition-colors ${up ? "text-[#4ade80]" : "text-outline hover:text-on-surface"}`}
      >
        <Icon name="thumb_up" filled={up} className="text-[16px]" />
      </button>
      <span
        className={`font-technical text-label-mono-sm ${
          item.score > 0 ? "text-[#4ade80]" : item.score < 0 ? "text-error" : "text-on-surface-variant"
        }`}
      >
        {item.score > 0 ? `+${item.score}` : item.score}
      </span>
      <button
        type="button"
        aria-pressed={down}
        aria-label={down ? "Take back your vote" : `Play ${item.track.title} later`}
        title="Play later"
        onClick={() => onVote(item.id, down ? 0 : -1)}
        className={`rounded-full p-0.5 transition-colors ${down ? "text-error" : "text-outline hover:text-on-surface"}`}
      >
        <Icon name="thumb_down" filled={down} className="text-[16px]" />
      </button>
    </div>
  );
}
