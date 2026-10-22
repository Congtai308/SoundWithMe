"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { QUICK_VIBES } from "@/features/music/vibes";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { AccountMenu } from "./AccountMenu";
import { TopNavSlotTarget } from "./TopNavSlot";
import { SidebarToggle } from "./Sidebar";
import { useSidebarStore } from "./sidebar-store";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";

const QUICK_VIBE_LABEL: Record<string, string> = {
  "late-night": "Đêm khuya",
  hype: "Sôi động",
  focus: "Tập trung",
  romantic: "Lãng mạn",
};

export function TopNav() {
  const [query, setQuery] = useState("");
  const router = useRouter();
  // The room fills the bar with its own title and actions, so search and vibes step back.
  const inRoom = usePathname().startsWith("/room/");
  const { data: user } = useCurrentUser();
  const toggleSidebar = useSidebarStore((s) => s.toggle);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/discover?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-30 h-16 border-b border-white/[0.06] bg-background/80 shadow-[0_1px_8px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:left-[72px] md:left-72 undock:left-0 md:transition-[left] md:duration-300 md:ease-out">
      <div className="flex h-16 w-full items-center justify-between gap-md px-md md:px-lg">
        <Link href="/" className="sm:hidden" aria-label="SoundWithMe home">
          <BrandLogo showWordmark={false} />
        </Link>

        {/* Only while the desktop sidebar is hidden: the way back, next to the logo it took with it. */}
        <div className="hidden shrink-0 items-center gap-xs undock:flex">
          <SidebarToggle action="show" onClick={toggleSidebar} tooltipSide="bottom" />
          <Link href="/" aria-label="SoundWithMe home" className="rounded-md">
            <BrandLogo showWordmark={false} />
          </Link>
        </div>

        <TopNavSlotTarget name="start" className="flex min-w-0 flex-1 items-center" />

        <form
          onSubmit={submitSearch}
          className={`relative flex-1 ${inRoom ? "hidden max-w-xs lg:block" : "max-w-xl"}`}
          role="search"
        >
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline"
          />
          <label htmlFor="global-search" className="sr-only">
            Tìm bài hát, nghệ sĩ
          </label>
          <input
            id="global-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm bài hát, nghệ sĩ…"
            className="w-full rounded-full bg-surface-container-low py-xs pl-10 pr-md text-body-sm text-on-surface shadow-inner placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </form>

        <nav className={`hidden items-center gap-xs ${inRoom ? "" : "lg:flex"}`} aria-label="Chọn nhanh">
          {QUICK_VIBES.map((vibe) => (
            <Link
              key={vibe.slug}
              href={`/discover?vibe=${vibe.slug}`}
              className="rounded-full bg-surface-container px-sm py-1 text-body-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              {vibe.emoji} {QUICK_VIBE_LABEL[vibe.slug]}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-md">
          <TopNavSlotTarget name="end" className="flex items-center gap-xs" />
          <NotificationBell />
          {user ? (
            <AccountMenu
              placement="below"
              triggerClassName="flex rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              trigger={
                <>
                  <span className="sr-only">Tài khoản</span>
                  <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
                </>
              }
            />
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-primary-container px-md py-1.5 text-headline-sm text-on-primary-container"
            >
              Đăng nhập
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
