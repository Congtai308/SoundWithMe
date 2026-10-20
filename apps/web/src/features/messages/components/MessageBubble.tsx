"use client";

import Link from "next/link";
import type { DirectMessage, SharedTrack } from "@soundwithme/types";
import { Icon } from "@/components/ui/Icon";
import { useTrackActions } from "@/features/rooms/hooks/use-track-actions";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number): string {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** One message: text (rendered as text, never HTML), a shared song, or a room invite. */
export function MessageBubble({ message, mine, seen }: { message: DirectMessage; mine: boolean; seen: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
      {message.track && <TrackCard track={message.track} />}
      {message.room && (
        <div className="flex w-72 max-w-full items-center gap-sm rounded-lg border border-white/[0.08] bg-surface-container-high p-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-tertiary-container/25 text-tertiary">
            <Icon name="sensors" className="text-[20px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-headline-sm text-on-surface">{message.room.name}</p>
            <p className="text-body-sm text-on-surface-variant">Listen together</p>
          </div>
          <Link
            href={message.room.link}
            className="rounded-full bg-primary-container px-md py-1 text-body-sm font-semibold text-on-primary-container"
          >
            Join
          </Link>
        </div>
      )}
      {message.content && (
        <p
          className={`max-w-[min(32rem,85%)] whitespace-pre-wrap break-words rounded-2xl px-md py-xs text-body-md ${
            mine ? "rounded-br-sm bg-primary-container text-on-primary-container" : "rounded-bl-sm bg-surface-container-high text-on-surface"
          }`}
        >
          {message.content}
        </p>
      )}
      <span className="font-technical px-xs text-label-mono-sm text-outline">
        {formatTime(message.createdAt)}
        {mine && seen && " · Seen"}
      </span>
    </div>
  );
}

function TrackCard({ track }: { track: SharedTrack }) {
  const { mode, pick } = useTrackActions();
  const label = mode === "no-room" ? "Play" : mode === "locked" ? null : "Add to room";

  return (
    <div className="flex w-72 max-w-full items-center gap-sm rounded-lg border border-white/[0.08] bg-surface-container-high p-sm">
      {track.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- artwork comes from provider CDNs
        <img src={track.artworkUrl} alt="" className="h-12 w-12 shrink-0 rounded-sm object-cover" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-primary-container/25 text-primary">
          <Icon name="music_note" className="text-[20px]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-headline-sm text-on-surface">{track.title}</p>
        <p className="truncate text-body-sm text-on-surface-variant">
          {track.artistName}
          {track.durationMs ? ` · ${formatDuration(track.durationMs)}` : ""}
        </p>
      </div>
      {label && (
        <button
          type="button"
          onClick={() => pick(track.id)}
          aria-label={`${label}: ${track.title}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container"
        >
          <Icon name={mode === "no-room" ? "play_arrow" : "playlist_add"} className="text-[20px]" />
        </button>
      )}
    </div>
  );
}
