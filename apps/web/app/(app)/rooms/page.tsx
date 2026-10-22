"use client";

import Link from "next/link";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { useInfiniteRooms } from "@/features/rooms/hooks/use-rooms";
import { RoomCard, RoomCardSkeleton } from "@/features/rooms/components/RoomCard";
import { Icon } from "@/components/ui/Icon";
import { StatePanel, primaryPillClass, ghostPillClass } from "@/components/ui/StatePanel";

export default function RoomsPage() {
  const { data: user } = useCurrentUser();
  // Anyone can browse rooms; opening one signs a visitor in as a guest.
  const rooms = useInfiniteRooms();
  const items = rooms.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="relative overflow-hidden px-md py-xl md:px-[40px]">
      <div className="pointer-events-none absolute -top-24 right-1/4 h-96 w-96 rounded-full bg-secondary/10 blur-[130px]" />

      <header className="relative mb-xl flex flex-col justify-between gap-md sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2xs">
          <span className="font-technical text-label-mono-sm uppercase text-secondary">Đang phát trực tiếp</span>
          <h1 className="text-headline-xl text-on-surface">Các phòng đang mở</h1>
          <p className="max-w-2xl text-body-lg text-on-surface-variant">
            Mọi phòng đều phát đồng bộ — vào là nghe đúng khoảnh khắc mọi người đang nghe.
          </p>
        </div>
        {user && (
          <Link href="/rooms/new" className={`${primaryPillClass} self-start py-sm sm:self-auto`}>
            <Icon name="add_circle" className="text-[20px]" />
            Tạo phòng
          </Link>
        )}
      </header>

      {rooms.isLoading ? (
        <RoomGrid>
          {Array.from({ length: 6 }, (_, i) => (
            <RoomCardSkeleton key={i} />
          ))}
        </RoomGrid>
      ) : rooms.isError ? (
        <StatePanel
          tone="error"
          icon="wifi_off"
          title="Không tải được danh sách phòng"
          body="Kiểm tra kết nối mạng rồi thử lại."
          action={
            <button type="button" onClick={() => rooms.refetch()} className={ghostPillClass}>
              <Icon name="refresh" className="text-[18px]" />
              Thử lại
            </button>
          }
        />
      ) : items.length === 0 ? (
        <StatePanel
          icon="podcasts"
          title="Hiện chưa có phòng nào mở"
          body="Hãy là người đầu tiên — mở phòng và mời bạn bè."
          action={
            <Link href="/rooms/new" className={primaryPillClass}>
              <Icon name="add_circle" className="text-[18px]" />
              Tạo phòng
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
                {rooms.isFetchingNextPage ? "Đang tải…" : "Xem thêm phòng"}
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
  return <div className="relative grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
