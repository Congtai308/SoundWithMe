"use client";

import Link from "next/link";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { useInfiniteRooms } from "@/features/rooms/hooks/use-rooms";
import { RoomCard, RoomCardSkeleton } from "@/features/rooms/components/RoomCard";
import { Icon } from "@/components/ui/Icon";
import { StatePanel, primaryPillClass, ghostPillClass } from "@/components/ui/StatePanel";

export default function RoomsPage() {
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const rooms = useInfiniteRooms({ enabled: Boolean(user) });
  const items = rooms.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="relative overflow-hidden px-md py-xl md:px-[40px]">
      <div className="pointer-events-none absolute -top-24 right-1/4 h-96 w-96 rounded-full bg-secondary/10 blur-[130px]" />

      <header className="relative mb-xl flex flex-col justify-between gap-md sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2xs">
          <span className="font-technical text-label-mono-sm uppercase text-secondary">Live broadcasts</span>
          <h1 className="text-headline-xl text-on-surface">Live Listening Rooms</h1>
          <p className="max-w-2xl text-body-lg text-on-surface-variant">
            Every room plays in sync — drop in and hear exactly what everyone else is hearing.
          </p>
        </div>
        {user && (
          <Link href="/rooms/new" className={`${primaryPillClass} self-start py-sm sm:self-auto`}>
            <Icon name="add_circle" className="text-[20px]" />
            Create Room
          </Link>
        )}
      </header>

      {isUserLoading || (user && rooms.isLoading) ? (
        <RoomGrid>
          {Array.from({ length: 6 }, (_, i) => (
            <RoomCardSkeleton key={i} />
          ))}
        </RoomGrid>
      ) : !user ? (
        <StatePanel
          icon="sensors"
          title="Sign in to see who's listening"
          body="Live rooms are visible to signed-in listeners. A Fast Pass gets you in with just a name."
          action={
            <Link href="/login" className={primaryPillClass}>
              Sign in or use a Fast Pass
            </Link>
          }
        />
      ) : rooms.isError ? (
        <StatePanel
          tone="error"
          icon="wifi_off"
          title="Couldn't load live rooms"
          body="Check your connection and try again."
          action={
            <button type="button" onClick={() => rooms.refetch()} className={ghostPillClass}>
              <Icon name="refresh" className="text-[18px]" />
              Retry
            </button>
          }
        />
      ) : items.length === 0 ? (
        <StatePanel
          icon="podcasts"
          title="No rooms are live right now"
          body="Be the first — open a room and invite your friends."
          action={
            <Link href="/rooms/new" className={primaryPillClass}>
              <Icon name="add_circle" className="text-[18px]" />
              Create Room
            </Link>
          }
        />
      ) : (
        <>
          <RoomGrid>
            {items.map((room, index) => (
              <RoomCard key={room.id} room={room} featured={index === 0} />
            ))}
          </RoomGrid>
          {rooms.hasNextPage && (
            <div className="mt-xl flex justify-center">
              <button
                type="button"
                onClick={() => rooms.fetchNextPage()}
                disabled={rooms.isFetchingNextPage}
                className={`${ghostPillClass} disabled:opacity-60`}
              >
                {rooms.isFetchingNextPage ? "Loading…" : "Load more rooms"}
              </button>
            </div>
          )}
          {rooms.isFetchNextPageError && (
            <p role="alert" className="mt-sm text-center text-body-sm text-error">
              Couldn&apos;t load more rooms. Try again.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function RoomGrid({ children }: { children: React.ReactNode }) {
  return <div className="relative grid grid-cols-1 gap-lg sm:grid-cols-2 md:grid-cols-3">{children}</div>;
}
