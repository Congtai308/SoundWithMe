"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { useRoomsList } from "@/features/rooms/hooks/use-rooms";
import { RoomCard, RoomCardSkeleton } from "@/features/rooms/components/RoomCard";
import { DailyPickHero } from "@/features/music/components/DailyPickHero";
import { MusicOnboarding } from "@/features/music/components/MusicOnboarding";
import { useMusicPreferences } from "@/features/music/hooks/use-music-preferences";
import { useListeningProfile } from "@/features/music/hooks/use-listening";
import { buildSeeds, habitGenres } from "@/features/music/preferences";
import { MUSIC_TOPICS } from "@/features/music/topics";
import { Icon } from "@/components/ui/Icon";
import { StatePanel, primaryPillClass, ghostPillClass } from "@/components/ui/StatePanel";

const HOME_ROOM_LIMIT = 6;

function greetingForHour(hour: number): string {
  if (hour < 5) return "Khuya rồi";
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

export default function HomePage() {
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const isSignedIn = Boolean(user);
  const rooms = useRoomsList({ enabled: isSignedIn });

  const greeting = greetingForHour(new Date().getHours());
  const visibleRooms = rooms.data?.slice(0, HOME_ROOM_LIMIT) ?? [];
  const createHref = isSignedIn ? "/rooms/new" : "/login";

  const { preferences, status, save, isSaving } = useMusicPreferences();
  const [editingPreferences, setEditingPreferences] = useState(false);
  const profile = useListeningProfile();
  // Wait for the habits too, or the hero would start one song and then restart with another.
  const profileSettled = !isSignedIn || !profile.isPending || profile.isError;
  const seeds = useMemo(() => buildSeeds(preferences, profile.data), [preferences, profile.data]);
  // Remount the hero when answers change so the next pick reflects them.
  const seedKey = seeds.map((seed) => seed.query).join("|");
  const showOnboarding = status === "needs-onboarding" || editingPreferences;

  return (
    <div className="relative w-full overflow-hidden px-md py-xl md:px-[40px]">
      <div className="pointer-events-none absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-primary-container/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-10 top-[40rem] h-80 w-80 rounded-full bg-secondary/10 blur-[130px]" />

      <header className="relative z-10 mb-lg flex flex-col justify-between gap-md md:flex-row md:items-end">
        <div className="flex flex-col gap-2xs">
          <h1 className="text-[28px] font-bold leading-[36px] tracking-tight text-on-surface md:text-headline-xl">
            <span suppressHydrationWarning>{greeting}</span>
            {user ? `, ${user.displayName}` : ""} <span aria-hidden="true">✨</span>
          </h1>
          <p className="max-w-2xl text-body-lg text-on-surface-variant">
            Nghe thử một bài ngẫu nhiên, hoặc vào phòng để cùng nghe với mọi người.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-sm self-start md:self-auto">
          <Link
            href="/discover"
            className="group flex items-center gap-xs whitespace-nowrap rounded-full bg-surface-container-high px-md py-sm text-headline-sm text-on-surface transition-all hover:bg-surface-container-highest"
          >
            <Icon name="explore" className="text-[18px] text-secondary transition-transform group-hover:rotate-45" />
            Khám phá nhạc
          </Link>
          <Link
            href={createHref}
            className="flex items-center gap-xs whitespace-nowrap rounded-full bg-primary-container px-md py-sm text-headline-sm text-on-primary-container shadow-[0_0_24px_rgba(160,120,255,0.35)] transition-all hover:scale-[1.02] active:scale-95"
          >
            <Icon name="add_circle" className="text-[20px]" />
            Tạo phòng
          </Link>
        </div>
      </header>

      <div className="relative z-10 mb-3xl">
        {status === "ready" && profileSettled && !showOnboarding ? (
          <DailyPickHero key={seedKey} seeds={seeds} onEditPreferences={() => setEditingPreferences(true)} />
        ) : (
          <div className="h-[420px] animate-pulse rounded-[28px] bg-surface-container-low" />
        )}
      </div>

      {showOnboarding && status !== "loading" && (
        <MusicOnboarding
          initial={preferences}
          habitGenres={habitGenres(profile.data)}
          habitArtists={profile.data?.artists.map((a) => a.name) ?? []}
          isSaving={isSaving}
          onClose={status === "ready" ? () => setEditingPreferences(false) : undefined}
          onSave={(next) => {
            save(next)
              .then(() => setEditingPreferences(false))
              .catch(() => {
                // Saved in this browser already; the account copy retries on the next visit.
                setEditingPreferences(false);
              });
          }}
        />
      )}

      <section className="relative z-10 mb-3xl">
        <SectionHeading
          title="Phòng đang mở"
          subtitle="Mỗi phòng một vibe riêng — vào nghe cùng mọi người"
          badge={rooms.data && rooms.data.length > 0 ? `${rooms.data.length} phòng live` : undefined}
          link={isSignedIn ? { href: "/rooms", label: "Xem tất cả" } : undefined}
        />

        {isUserLoading || (isSignedIn && rooms.isLoading) ? (
          <div className="grid grid-cols-1 gap-lg sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <RoomCardSkeleton key={i} />
            ))}
          </div>
        ) : !isSignedIn ? (
          <StatePanel
            icon="sensors"
            title="Đăng nhập để xem ai đang nghe"
            body="Phòng live chỉ hiện với người đã đăng nhập. Dùng Fast Pass là vào được ngay, chỉ cần một cái tên."
            action={
              <Link href="/login" className={primaryPillClass}>
                Đăng nhập hoặc dùng Fast Pass
              </Link>
            }
          />
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
        ) : visibleRooms.length === 0 ? (
          <StatePanel
            icon="podcasts"
            title="Chưa có phòng nào đang mở"
            body="Mở phòng đầu tiên và rủ bạn bè vào nghe cùng nhé."
            action={
              <Link href="/rooms/new" className={primaryPillClass}>
                <Icon name="add_circle" className="text-[18px]" />
                Tạo phòng
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-lg sm:grid-cols-2 lg:grid-cols-3">
            {visibleRooms.map((room, index) => (
              <RoomCard key={room.id} room={room} featured={index === 0} />
            ))}
          </div>
        )}
      </section>

      <section className="relative z-10">
        <SectionHeading title="Hôm nay bạn muốn nghe gì?" link={{ href: "/discover", label: "Khám phá thêm" }} />
        <div className="scrollbar-none -mx-md flex gap-sm overflow-x-auto px-md pb-xs md:mx-0 md:flex-wrap md:px-0">
          {MUSIC_TOPICS.map((topic) => (
            <Link
              key={topic.slug}
              href={`/discover?topic=${topic.slug}`}
              className="shrink-0 rounded-full border border-white/[0.08] bg-surface-container px-md py-xs text-headline-sm text-on-surface-variant transition-colors hover:border-primary-container/50 hover:bg-surface-container-high hover:text-on-surface"
            >
              {topic.emoji} {topic.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
  badge,
  link,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="mb-md flex items-end justify-between gap-sm">
      <div>
        <div className="flex items-center gap-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-secondary shadow-[0_0_10px_rgba(76,215,246,0.8)]" />
          <h2 className="text-headline-lg text-on-surface">{title}</h2>
          {badge && (
            <span className="font-technical rounded-full bg-surface-container-highest px-xs py-0.5 text-label-mono-sm text-secondary">
              {badge}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-1 text-body-md text-on-surface-variant">{subtitle}</p>}
      </div>
      {link && (
        <Link
          href={link.href}
          className="hidden shrink-0 items-center gap-1 text-body-md text-secondary transition-colors hover:text-secondary-fixed sm:flex"
        >
          {link.label}
          <Icon name="chevron_right" className="text-[18px]" />
        </Link>
      )}
    </div>
  );
}
