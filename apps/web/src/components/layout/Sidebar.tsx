"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { useRoomsList } from "@/features/rooms/hooks/use-rooms";
import { Icon } from "@/components/ui/Icon";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { NAV_ITEMS, isActivePath } from "./nav-items";
import { UserCard } from "./UserCard";
import { useSidebarStore } from "./sidebar-store";

/**
 * Desktop (≥1024px): full 288px dock, which the user can slide fully out of
 * view (button or Ctrl/⌘+B; TopNav shows the button to bring it back).
 * Tablet (768–1023px): 72px icon rail. Mobile: hidden — MobileTabBar takes
 * over navigation.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const { data: rooms } = useRoomsList({ enabled: Boolean(user) });
  const hasLiveRooms = (rooms?.length ?? 0) > 0;
  const collapsed = useSidebarStore((s) => s.collapsed);
  const hydrate = useSidebarStore((s) => s.hydrate);
  const toggle = useSidebarStore((s) => s.toggle);

  useEffect(hydrate, [hydrate]);
  useSidebarShortcut(toggle);

  return (
    <aside
      aria-hidden={collapsed || undefined}
      className="fixed bottom-0 left-0 top-0 z-40 hidden w-[72px] flex-col justify-between border-r border-white/[0.06] bg-surface-container-lowest/90 shadow-[0_1px_8px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:flex md:w-72 md:transition-[transform,visibility] md:duration-300 md:ease-out undock:invisible undock:-translate-x-full"
    >
      <div className="scrollbar-none flex flex-1 flex-col overflow-y-auto px-xs pt-lg md:px-md">
        <div className="mb-xl flex items-center justify-center md:justify-between">
          <Link href="/" className="flex items-center rounded-md md:px-sm" aria-label="SoundWithMe home">
            <span className="md:hidden">
              <BrandLogo showWordmark={false} />
            </span>
            <span className="hidden md:block">
              <BrandLogo />
            </span>
          </Link>
          <SidebarToggle action="hide" onClick={toggle} className="hidden md:flex" />
        </div>

        <Link
          href={user ? "/rooms/new" : "/login"}
          className="mb-md flex w-full items-center justify-center gap-sm rounded-full bg-primary-container px-sm py-sm text-headline-sm text-on-primary-container shadow-[0_0_24px_rgba(160,120,255,0.35)] transition-transform active:scale-95 md:px-md"
        >
          <Icon name="graphic_eq" className="text-[20px]" />
          <span className="hidden md:inline">Create Room</span>
        </Link>

        <p className="font-technical mb-2xs hidden px-sm text-label-mono-sm uppercase text-outline md:block">
          Navigation
        </p>
        <nav className="mb-lg flex flex-col gap-1" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            if (item.soon) {
              return (
                <span
                  key={item.href}
                  title={`${item.label} — coming soon`}
                  aria-disabled="true"
                  className="flex cursor-not-allowed items-center justify-center rounded-lg px-sm py-xs text-outline/60 md:justify-between"
                >
                  <span className="flex items-center gap-sm">
                    <Icon name={item.icon} className="text-[20px]" />
                    <span className="hidden text-body-md md:inline">{item.label}</span>
                  </span>
                  <span className="font-technical hidden rounded-full bg-surface-container-high px-xs py-0.5 text-label-mono-sm uppercase text-outline md:inline">
                    Soon
                  </span>
                </span>
              );
            }

            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={`flex items-center justify-center rounded-lg px-sm py-xs transition-colors md:justify-between ${
                  active
                    ? "bg-surface-container-high text-primary"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                }`}
              >
                <span className="flex items-center gap-sm">
                  <Icon name={item.icon} className="text-[20px]" filled={active} />
                  <span className={`hidden md:inline ${active ? "text-headline-sm" : "text-body-md"}`}>
                    {item.label}
                  </span>
                </span>
                {item.href === "/rooms" && hasLiveRooms && (
                  <span className="font-technical hidden rounded-full bg-tertiary-container px-xs py-0.5 text-label-mono-sm uppercase text-on-tertiary-container motion-safe:animate-pulse md:inline">
                    Live
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <UserCard />
    </aside>
  );
}

/** Ctrl/⌘+B shows or hides the desktop sidebar, unless the user is typing. */
function useSidebarShortcut(toggle: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "b" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);
}

/** The panel-style show/hide button, used in the sidebar and (while hidden) in TopNav. */
export function SidebarToggle({
  action,
  onClick,
  className = "",
}: {
  action: "show" | "hide";
  onClick: () => void;
  className?: string;
}) {
  const label = action === "hide" ? "Hide sidebar" : "Show sidebar";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={`${label} (Ctrl+B)`}
      className={`h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-white/[0.08] hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${className}`}
    >
      <Icon name={action === "hide" ? "left_panel_close" : "left_panel_open"} className="text-[22px]" />
    </button>
  );
}
