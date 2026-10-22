"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { QUICK_VIBES } from "@/features/music/vibes";
import { barButtonActiveClass, barButtonClass } from "@/components/ui/bar-controls";
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
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-outline transition-colors peer-focus:text-primary"
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
            className="h-10 w-full rounded-full border border-white/[0.1] bg-white/[0.04] pl-11 pr-md text-body-sm text-on-surface transition-all placeholder:text-outline hover:border-white/[0.18] focus:border-primary/60 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </form>

        <nav className={`hidden items-center gap-2 ${inRoom ? "" : "lg:flex"}`} aria-label="Chọn nhanh">
          {/* Reading the URL's query needs a Suspense boundary in a shared layout. */}
          <Suspense fallback={<VibeChips active={null} />}>
            <ActiveVibeChips />
          </Suspense>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <TopNavSlotTarget name="end" className="flex items-center gap-2" />
          <NotificationBell />
          {user ? (
            <AccountMenu
              placement="below"
              triggerClassName="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] transition-all hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
              className="inline-flex h-10 items-center rounded-full bg-primary-container px-md text-headline-sm text-on-primary-container shadow-[0_0_20px_rgba(160,120,255,0.3)] transition-transform hover:scale-[1.02]"
            >
              Đăng nhập
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function ActiveVibeChips() {
  const onDiscover = usePathname() === "/discover";
  const vibe = useSearchParams().get("vibe");
  return <VibeChips active={onDiscover ? vibe : null} />;
}

function VibeChips({ active }: { active: string | null }) {
  return (
    <>
      {QUICK_VIBES.map((vibe) => (
        <Link
          key={vibe.slug}
          href={`/discover?vibe=${vibe.slug}`}
          aria-current={active === vibe.slug ? "page" : undefined}
          className={`${active === vibe.slug ? barButtonActiveClass : barButtonClass} !h-9 !px-3`}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06] text-[13px] leading-none" aria-hidden="true">
            {vibe.emoji}
          </span>
          {QUICK_VIBE_LABEL[vibe.slug]}
        </Link>
      ))}
    </>
  );
}
