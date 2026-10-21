"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { Icon } from "@/components/ui/Icon";
import { showToast } from "@/components/ui/Toaster";
import { ApiClientError } from "@/services/api-client";
import { useAddToPlaylist, useCreatePlaylist, usePlaylists } from "../hooks/use-library";

/** "+" menu: add this song to one of your playlists, or to a new one. */
export function AddToPlaylistButton({ trackId, className = "" }: { trackId: string; className?: string }) {
  const { data: user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const playlists = usePlaylists({ enabled: Boolean(user) && open });
  const add = useAddToPlaylist();
  const create = useCreatePlaylist();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const failed = (error: unknown) =>
    showToast({
      icon: "error",
      tone: "error",
      title: "Couldn't add to the playlist",
      body: error instanceof ApiClientError ? error.message : undefined,
    });
  const addTo = (playlistId: string, name: string) =>
    add.mutate(
      { playlistId, trackId },
      {
        onSuccess: () => {
          setOpen(false);
          showToast({ icon: "playlist_add_check", tone: "success", title: `Added to ${name}`, href: "/library" });
        },
        onError: failed,
      },
    );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add to a playlist"
        title="Add to a playlist"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="flex items-center rounded-full p-1 text-outline transition-colors hover:text-on-surface"
      >
        <Icon name="playlist_add" className="text-[20px]" />
      </button>
      {open && (
        <div
          role="menu"
          onClick={(event) => event.stopPropagation()}
          className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-md border border-white/[0.16] bg-[rgba(30,41,59,0.95)] p-1 shadow-[0_12px_36px_-4px_rgba(0,0,0,0.65)] backdrop-blur-xl"
        >
          <p className="px-sm py-1 text-label-mono-sm uppercase text-outline">Add to playlist</p>
          <div className="scrollbar-none max-h-52 overflow-y-auto">
            {playlists.isLoading && <p className="px-sm py-xs text-body-sm text-on-surface-variant">Loading…</p>}
            {playlists.data?.length === 0 && (
              <p className="px-sm py-xs text-body-sm text-on-surface-variant">No playlists yet — make one below.</p>
            )}
            {playlists.data?.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                role="menuitem"
                disabled={add.isPending}
                onClick={() => addTo(playlist.id, playlist.name)}
                className="flex w-full items-center justify-between gap-sm rounded-sm px-sm py-xs text-left text-body-md text-on-surface hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span className="truncate">{playlist.name}</span>
                <span className="font-technical shrink-0 text-label-mono-sm text-outline">{playlist.trackCount}</span>
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const name = newName.trim();
              if (!name) return;
              create.mutate(
                { name },
                {
                  onSuccess: (playlist) => {
                    setNewName("");
                    addTo(playlist.id, playlist.name);
                  },
                  onError: failed,
                },
              );
            }}
            className="mt-1 flex items-center gap-1 border-t border-white/[0.08] p-1 pt-xs"
          >
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={60}
              placeholder="New playlist…"
              aria-label="New playlist name"
              className="min-w-0 flex-1 rounded-sm bg-surface-container-highest/60 px-xs py-1 text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={!newName.trim() || create.isPending}
              aria-label="Create playlist and add"
              className="rounded-sm bg-primary-container px-xs py-1 text-body-sm text-on-primary-container disabled:opacity-40"
            >
              <Icon name="add" className="text-[16px]" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
