"use client";

import { useEffect, useState } from "react";
import { setPendingPlay } from "@/features/rooms/pending-play";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Room } from "@soundwithme/types";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { CreateRoomForm } from "@/features/rooms/components/CreateRoomForm";
import { RoomReadyPanel } from "@/features/rooms/components/RoomReadyPanel";
import { TrackArt } from "@/features/rooms/components/TrackArt";
import { useTrack } from "@/features/music/hooks/use-track";
import { Icon } from "@/components/ui/Icon";
import { useLeaveRoom, useMyActiveRoom } from "@/features/rooms/hooks/use-rooms";
import { useRoomSessionStore } from "@/features/rooms/stores/room-session-store";

export default function CreateRoomPage() {
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);
  // `?play=<trackId>` from the Music page: the new room starts with that song.
  const [playTrackId, setPlayTrackId] = useState<string | null>(null);
  const { data: playTrack } = useTrack(playTrackId);
  const myRoom = useMyActiveRoom({ enabled: Boolean(user) });

  useEffect(() => {
    setPlayTrackId(new URLSearchParams(window.location.search).get("play"));
  }, []);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  return (
    <div className="flex w-full justify-center px-md py-lg sm:px-lg">
      <div className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-surface-container-low shadow-2xl">
        <div className="pointer-events-none absolute -top-32 left-1/4 h-64 w-96 rounded-full bg-primary-container/20 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 right-1/4 h-64 w-80 rounded-full bg-secondary-container/15 blur-[90px]" />

        <header className="relative z-10 flex flex-col justify-between gap-sm px-lg pb-sm pt-lg sm:flex-row sm:items-center md:px-xl">
          <div className="flex items-center gap-md">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container/20 text-primary shadow-sm">
              <Icon name="sensors" className="text-[24px]" />
            </div>
            <div>
              <span className="font-technical flex items-center gap-2 text-label-mono-sm uppercase text-secondary">
                Audio stage creator
                <span className="h-1.5 w-1.5 rounded-full bg-secondary motion-safe:animate-ping" />
              </span>
              <h1 className="text-headline-lg text-on-surface">Setup &amp; Broadcast Room</h1>
            </div>
          </div>

          <ol className="flex items-center self-start rounded-full bg-surface-container p-1 sm:self-auto">
            <li
              aria-current={createdRoom ? undefined : "step"}
              className={`rounded-full px-md py-xs text-headline-sm ${
                createdRoom ? "text-on-surface-variant" : "bg-primary-container text-on-primary-container shadow-md"
              }`}
            >
              1. Room Setup
            </li>
            <li
              aria-current={createdRoom ? "step" : undefined}
              className={`flex items-center gap-1.5 rounded-full px-md py-xs text-headline-sm ${
                createdRoom ? "bg-primary-container text-on-primary-container shadow-md" : "text-outline"
              }`}
            >
              2. Room is Ready
              {createdRoom && <span className="h-2 w-2 rounded-full bg-tertiary-container motion-safe:animate-pulse" />}
            </li>
          </ol>
        </header>

        <div className="relative z-10 p-lg md:p-xl">
          {playTrackId && !createdRoom && (
            <div className="mb-lg flex items-center gap-sm rounded-md bg-primary-container/15 p-sm">
              <TrackArt artworkUrl={playTrack?.artworkUrl} seed={playTrackId} size={48} className="rounded-md" />
              <div className="min-w-0">
                <p className="font-technical text-label-mono-sm uppercase text-secondary">Starts with</p>
                <p className="truncate text-headline-sm text-on-surface">{playTrack?.title ?? "Loading…"}</p>
              </div>
            </div>
          )}
          {isLoading || !user || myRoom.isLoading ? (
            <div className="h-80 animate-pulse rounded-lg bg-surface-container" />
          ) : createdRoom ? (
            <RoomReadyPanel room={createdRoom} playTrackId={playTrackId} />
          ) : myRoom.data ? (
            <AlreadyHosting room={myRoom.data} playTrackId={playTrackId} />
          ) : (
            <CreateRoomForm onCreated={setCreatedRoom} />
          )}
        </div>
      </div>
    </div>
  );
}

/** One live room per host: offer the room they have, or to end it and start fresh. */
function AlreadyHosting({ room, playTrackId }: { room: Room; playTrackId: string | null }) {
  const leave = useLeaveRoom(room.id);
  const exitSession = useRoomSessionStore((s) => s.exit);
  const activeRoomId = useRoomSessionStore((s) => s.activeRoomId);
  const href = `/room/${room.id}`;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-md py-md text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-tertiary-container/20 text-tertiary">
        <Icon name="podcasts" className="text-[30px]" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-technical text-label-mono-sm uppercase text-secondary">You&apos;re already live</span>
        <h2 className="text-headline-lg text-on-surface">{room.name}</h2>
        <p className="text-body-md text-on-surface-variant">
          You can host one room at a time. {playTrackId ? "Play the song there, or end" : "Head back in, or end"} it to start a new one.
        </p>
      </div>
      <div className="flex w-full flex-col gap-sm sm:flex-row">
        <Link
          href={href}
          onClick={() => playTrackId && setPendingPlay(room.id, playTrackId)}
          className="flex flex-1 items-center justify-center gap-xs rounded-full bg-primary-container px-md py-sm text-headline-sm text-on-primary-container shadow-[0_0_24px_rgba(160,120,255,0.35)]"
        >
          <Icon name="login" className="text-[20px]" />
          {playTrackId ? "Play it in my room" : "Open my room"}
        </Link>
        <button
          type="button"
          disabled={leave.isPending}
          onClick={() =>
            leave.mutate(undefined, {
              onSuccess: () => {
                if (activeRoomId === room.id) exitSession();
              },
            })
          }
          className="flex flex-1 items-center justify-center gap-xs rounded-full border border-error/40 bg-error/10 px-md py-sm text-headline-sm text-error hover:bg-error/20 disabled:opacity-60"
        >
          <Icon name="stop_circle" className="text-[20px]" />
          {leave.isPending ? "Ending…" : "End it & start a new one"}
        </button>
      </div>
      {leave.isError && <p className="text-body-sm text-error">Couldn&apos;t end the room. Try again.</p>}
    </div>
  );
}
