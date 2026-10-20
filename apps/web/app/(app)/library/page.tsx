"use client";

import { useState } from "react";
import Link from "next/link";
import type { QueueTrackSnapshot } from "@soundwithme/types";
import { MAX_QUEUE_ADD_MANY } from "@soundwithme/validation";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import {
  useCreatePlaylist,
  useDeletePlaylist,
  useFavorites,
  usePlaylist,
  usePlaylists,
  useRemoveFromPlaylist,
} from "@/features/library/hooks/use-library";
import { LikeButton } from "@/features/library/components/LikeButton";
import { AddToPlaylistButton } from "@/features/library/components/AddToPlaylistButton";
import { useTrackActions } from "@/features/rooms/hooks/use-track-actions";
import { useRoomSession } from "@/features/rooms/components/RoomSessionProvider";
import { TrackArt, formatClock } from "@/features/rooms/components/TrackArt";
import { Icon } from "@/components/ui/Icon";
import { StatePanel, primaryPillClass } from "@/components/ui/StatePanel";
import { showToast } from "@/components/ui/Toaster";
import { ApiClientError } from "@/services/api-client";

type Tab = "liked" | "playlists";

/** Your music: liked songs and playlists, ready to queue in the room you're in. */
export default function LibraryPage() {
  const { data: user, isLoading } = useCurrentUser();
  const [tab, setTab] = useState<Tab>("liked");
  const [openPlaylist, setOpenPlaylist] = useState<string | null>(null);

  if (!isLoading && !user) {
    return (
      <div className="px-md py-2xl md:px-[40px]">
        <StatePanel
          icon="library_music"
          title="Sign in to keep a library"
          body="Like songs and build playlists, then play them in any room."
          action={
            <Link href="/login" className={primaryPillClass}>
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-lg px-md py-lg md:px-lg">
      <header className="flex flex-col gap-1">
        <span className="font-technical text-label-mono-sm uppercase text-secondary">Library</span>
        <h1 className="text-headline-xl text-on-surface">Your music</h1>
        <RoomHint />
      </header>

      <div role="tablist" className="flex self-start rounded-full bg-surface-container p-1">
        {(["liked", "playlists"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              setOpenPlaylist(null);
            }}
            className={`flex items-center gap-1.5 rounded-full px-md py-1.5 text-headline-sm ${
              tab === value ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant"
            }`}
          >
            <Icon name={value === "liked" ? "favorite" : "queue_music"} className="text-[18px]" filled={tab === value && value === "liked"} />
            {value === "liked" ? "Liked Songs" : "Playlists"}
          </button>
        ))}
      </div>

      {tab === "liked" ? (
        <LikedSongs />
      ) : openPlaylist ? (
        <PlaylistView id={openPlaylist} onBack={() => setOpenPlaylist(null)} />
      ) : (
        <PlaylistGrid onOpen={setOpenPlaylist} />
      )}
    </div>
  );
}

/** Where picking a song goes: the room you're in, or a new room. */
function RoomHint() {
  const { mode } = useTrackActions();
  const { room } = useRoomSession();
  const text =
    mode === "no-room"
      ? "Pick a song to start a room with it — or join a room first and add songs to its queue."
      : mode === "locked"
        ? `Only the host and DJs add songs in “${room?.name ?? "this room"}”.`
        : `Songs you pick go to “${room?.name ?? "your room"}”.`;
  return <p className="text-body-md text-on-surface-variant">{text}</p>;
}

function SongRow({
  trackId,
  track,
  index,
  extra,
}: {
  trackId: string;
  track: QueueTrackSnapshot;
  index: number;
  extra?: React.ReactNode;
}) {
  const { mode, pick, notice } = useTrackActions();
  const label = mode === "no-room" ? "Start a room" : mode === "control" ? "Play / queue" : mode === "add" ? "Add to queue" : null;
  return (
    <li className="group flex items-center gap-sm rounded-md bg-surface-container-low p-sm">
      <span className="font-technical w-6 text-center text-label-mono-md text-outline">{index + 1}</span>
      <TrackArt artworkUrl={track.artworkUrl} seed={trackId} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-md font-semibold text-on-surface">{track.title}</p>
        <p className="truncate text-body-sm text-on-surface-variant">
          {track.artistName}
          {track.durationMs > 0 && <span className="text-outline"> · {formatClock(track.durationMs)}</span>}
        </p>
        {notice && <p className="text-body-sm text-tertiary">{notice}</p>}
      </div>
      {label && (
        <button
          type="button"
          onClick={() => pick(trackId)}
          title={label}
          aria-label={`${label}: ${track.title}`}
          className="flex items-center gap-1 rounded-full bg-primary-container/80 px-sm py-1 text-body-sm font-semibold text-on-primary-container hover:bg-primary-container"
        >
          <Icon name={mode === "no-room" ? "podcasts" : "playlist_play"} className="text-[18px]" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      )}
      <LikeButton trackId={trackId} size="sm" />
      <AddToPlaylistButton trackId={trackId} />
      {extra}
    </li>
  );
}

function LikedSongs() {
  const favorites = useFavorites();
  if (favorites.isLoading) return <div className="h-40 animate-pulse rounded-lg bg-surface-container-low" />;
  if (favorites.isError) return <StatePanel tone="error" icon="error" title="Couldn't load your liked songs" body="Try again in a moment." />;
  if (!favorites.data || favorites.data.length === 0) {
    return (
      <StatePanel
        icon="favorite"
        title="No liked songs yet"
        body="Tap the heart on any song — on the Music page or in a room — to save it here."
        action={
          <Link href="/discover" className={primaryPillClass}>
            Find music
          </Link>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-sm">
      <QueueAllButton trackIds={favorites.data.map((f) => f.trackId)} />
      <ol className="flex flex-col gap-1.5">
        {favorites.data.map((favorite, index) => (
          <SongRow key={favorite.trackId} trackId={favorite.trackId} track={favorite.track} index={index} />
        ))}
      </ol>
    </div>
  );
}

/** Queues every song (in order) in the room you're in, in batches the server accepts. */
function QueueAllButton({ trackIds }: { trackIds: string[] }) {
  const { mode } = useTrackActions();
  const { commands, room } = useRoomSession();
  if (trackIds.length === 0 || (mode !== "control" && mode !== "add")) return null;
  return (
    <button
      type="button"
      onClick={() => {
        for (let i = 0; i < trackIds.length; i += MAX_QUEUE_ADD_MANY) {
          commands.queueAddMany(trackIds.slice(i, i + MAX_QUEUE_ADD_MANY));
        }
        showToast({ icon: "queue_music", tone: "success", title: `Queued ${trackIds.length} songs`, body: room ? `in “${room.name}”` : undefined });
      }}
      className="flex items-center gap-1.5 self-start rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#d946ef] px-md py-1.5 text-body-sm font-semibold text-white shadow-[0_0_18px_rgba(139,92,246,0.4)]"
    >
      <Icon name="queue_music" className="text-[18px]" />
      Queue all in {room?.name ?? "the room"}
    </button>
  );
}

function PlaylistGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const playlists = usePlaylists();
  const create = useCreatePlaylist();
  const [name, setName] = useState("");

  return (
    <div className="flex flex-col gap-md">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = name.trim();
          if (!value) return;
          create.mutate(
            { name: value },
            {
              onSuccess: (playlist) => {
                setName("");
                onOpen(playlist.id);
              },
              onError: (error) =>
                showToast({
                  icon: "error",
                  tone: "error",
                  title: "Couldn't create the playlist",
                  body: error instanceof ApiClientError ? error.message : undefined,
                }),
            },
          );
        }}
        className="flex max-w-md items-center gap-xs"
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          placeholder="New playlist name…"
          aria-label="New playlist name"
          className="min-w-0 flex-1 rounded-full bg-surface-container px-md py-xs text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button type="submit" disabled={!name.trim() || create.isPending} className={`${primaryPillClass} disabled:opacity-50`}>
          <Icon name="add" className="text-[18px]" /> Create
        </button>
      </form>

      {playlists.isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-surface-container-low" />
      ) : !playlists.data || playlists.data.length === 0 ? (
        <StatePanel icon="queue_music" title="No playlists yet" body="Name one above, then add songs with the + button on any song." />
      ) : (
        <ul className="grid grid-cols-2 gap-md sm:grid-cols-3 lg:grid-cols-4">
          {playlists.data.map((playlist) => (
            <li key={playlist.id}>
              <button
                type="button"
                onClick={() => onOpen(playlist.id)}
                className="group flex w-full flex-col gap-xs rounded-lg bg-surface-container-low p-sm text-left hover:bg-surface-container"
              >
                <TrackArt artworkUrl={playlist.coverUrl} seed={playlist.id} size={160} className="aspect-square h-auto w-full rounded-md" />
                <span className="truncate text-body-md font-semibold text-on-surface group-hover:text-primary">{playlist.name}</span>
                <span className="text-body-sm text-on-surface-variant">
                  {playlist.trackCount} {playlist.trackCount === 1 ? "song" : "songs"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlaylistView({ id, onBack }: { id: string; onBack: () => void }) {
  const playlist = usePlaylist(id);
  const remove = useRemoveFromPlaylist();
  const del = useDeletePlaylist();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (playlist.isLoading) return <div className="h-40 animate-pulse rounded-lg bg-surface-container-low" />;
  if (!playlist.data) {
    return <StatePanel tone="error" icon="error" title="Playlist not found" body="It may have been deleted." action={<button type="button" onClick={onBack} className={primaryPillClass}>Back</button>} />;
  }
  const data = playlist.data;

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center gap-sm">
        <button type="button" onClick={onBack} aria-label="Back to playlists" className="rounded-full p-1 text-on-surface-variant hover:text-on-surface">
          <Icon name="arrow_back" className="text-[22px]" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-headline-lg text-on-surface">{data.name}</h2>
          <p className="text-body-sm text-on-surface-variant">
            {data.trackCount} {data.trackCount === 1 ? "song" : "songs"}
          </p>
        </div>
        {confirmDelete ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              disabled={del.isPending}
              onClick={() => del.mutate(data.id, { onSuccess: onBack })}
              className="rounded-full bg-error/15 px-sm py-1 text-body-sm font-semibold text-error"
            >
              Delete playlist
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-full px-sm py-1 text-body-sm text-on-surface-variant">
              Keep
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} title="Delete playlist" aria-label="Delete playlist" className="rounded-full p-1 text-outline hover:text-error">
            <Icon name="delete" className="text-[20px]" />
          </button>
        )}
      </div>

      <QueueAllButton trackIds={data.items.map((item) => item.trackId)} />

      {data.items.length === 0 ? (
        <StatePanel icon="playlist_add" title="Empty playlist" body="Add songs with the + button on any song, on the Music page or in a room." />
      ) : (
        <ol className="flex flex-col gap-1.5">
          {data.items.map((item, index) => (
            <SongRow
              key={item.id}
              trackId={item.trackId}
              track={item.track}
              index={index}
              extra={
                <button
                  type="button"
                  onClick={() => remove.mutate({ playlistId: data.id, itemId: item.id })}
                  aria-label={`Remove ${item.track.title} from the playlist`}
                  title="Remove from playlist"
                  className="rounded-full p-1 text-outline hover:text-error"
                >
                  <Icon name="remove_circle" className="text-[18px]" />
                </button>
              }
            />
          ))}
        </ol>
      )}
    </div>
  );
}
