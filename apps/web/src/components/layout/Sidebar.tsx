"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { useRoomsList } from "@/features/rooms/hooks/use-rooms";
import { useConversations } from "@/features/messages/hooks/use-messages";
import { Icon } from "@/components/ui/Icon";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { NAV_ITEMS, isActivePath } from "./nav-items";
import { UserCard } from "./UserCard";
import { isRailPath, useSidebarStore } from "./sidebar-store";

/**
 * Desktop (≥1024px): full 288px dock, which the user can slide fully out of
 * view (button or Ctrl/⌘+B; TopNav shows the button to bring it back).
 * Tablet (768–1023px), and desktop inside a room: 72px icon rail. Mobile:
 * hidden — MobileTabBar takes over navigation.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const { data: rooms } = useRoomsList();
  const hasLiveRooms = (rooms?.length ?? 0) > 0;
  const { data: inbox } = useConversations({ enabled: Boolean(user) });
  const unreadMessages = inbox?.unread ?? 0;
  const collapsed = useSidebarStore((s) => s.collapsed);
  const hydrate = useSidebarStore((s) => s.hydrate);
  const toggle = useSidebarStore((s) => s.toggle);

  useEffect(hydrate, [hydrate]);
  useSidebarShortcut(toggle);

  // The root layout's script sets it on load; this keeps it right on client-side navigation.
  const rail = isRailPath(pathname);
  useEffect(() => {
    if (rail) document.documentElement.dataset.rail = "";
    else delete document.documentElement.dataset.rail;
  }, [rail]);

  return (
    <aside
      aria-hidden={collapsed || undefined}
      className="fixed bottom-0 left-0 top-0 z-40 hidden w-[72px] flex-col justify-between border-r border-white/[0.06] bg-surface-container-lowest/90 shadow-[0_1px_8px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:flex md:w-72 rail:w-[72px] md:transition-[transform,visibility,width] md:duration-300 md:ease-out undock:invisible undock:-translate-x-full"
    >
      <div className="scrollbar-none flex flex-1 flex-col overflow-y-auto px-xs pt-lg md:px-md rail:px-xs">
        <div className="mb-xl flex items-center justify-center md:justify-between rail:justify-center">
          <Link href="/" className="flex items-center rounded-md md:px-sm rail:px-0" aria-label="SoundWithMe home">
            <span className="md:hidden rail:block">
              <BrandLogo showWordmark={false} />
            </span>
            <span className="hidden md:block rail:hidden">
              <BrandLogo />
            </span>
          </Link>
          <SidebarToggle action="hide" onClick={toggle} tooltipSide="bottom-end" className="hidden md:block rail:hidden" />
        </div>

        <Link
          href={user ? "/rooms/new" : "/login"}
          className="mb-md flex w-full items-center justify-center gap-sm rounded-full bg-primary-container px-sm py-sm text-headline-sm text-on-primary-container shadow-[0_0_24px_rgba(160,120,255,0.35)] transition-transform active:scale-95 md:px-md rail:px-sm"
        >
          <Icon name="graphic_eq" className="text-[20px]" />
          <span className="hidden md:inline rail:hidden">Tạo phòng</span>
        </Link>

        <p className="font-technical mb-2xs hidden px-sm text-label-mono-sm uppercase text-outline md:block rail:hidden">
          Điều hướng
        </p>
        <nav className="mb-lg flex flex-col gap-1" aria-label="Điều hướng chính">
          {NAV_ITEMS.map((item) => {
            if (item.soon) {
              return (
                <span
                  key={item.href}
                  title={`${item.label} — sắp ra mắt`}
                  aria-disabled="true"
                  className="flex cursor-not-allowed items-center justify-center rounded-lg px-sm py-xs text-outline/60 md:justify-between rail:justify-center"
                >
                  <span className="flex items-center gap-sm">
                    <Icon name={item.icon} className="text-[20px]" />
                    <span className="hidden text-body-md md:inline rail:hidden">{item.label}</span>
                  </span>
                  <span className="font-technical hidden rounded-full bg-surface-container-high px-xs py-0.5 text-label-mono-sm uppercase text-outline md:inline rail:hidden">
                    Sắp có
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
                className={`flex items-center justify-center rounded-lg px-sm py-xs transition-colors md:justify-between rail:justify-center ${
                  active
                    ? "bg-surface-container-high text-primary"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                }`}
              >
                <span className="relative flex items-center gap-sm">
                  <Icon name={item.icon} className="text-[20px]" filled={active} />
                  {item.href === "/messages" && unreadMessages > 0 && (
                    // The icon rail has no room for the count: a dot instead.
                    <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary md:hidden rail:block" />
                  )}
                  <span className={`hidden md:inline rail:hidden ${active ? "text-headline-sm" : "text-body-md"}`}>
                    {item.label}
                  </span>
                </span>
                {item.href === "/messages" && unreadMessages > 0 && (
                  <span
                    aria-label={`${unreadMessages} chưa đọc`}
                    className="font-technical hidden rounded-full bg-primary-container px-xs py-0.5 text-label-mono-sm text-on-primary-container md:inline rail:hidden"
                  >
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
                {item.href === "/rooms" && hasLiveRooms && (
                  <span className="font-technical hidden rounded-full bg-tertiary-container px-xs py-0.5 text-label-mono-sm uppercase text-on-tertiary-container motion-safe:animate-pulse md:inline rail:hidden">
                    Live
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <UserCard />
      <SidebarHint collapsed={collapsed} />
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

/**
 * The round show/hide button, used in the sidebar and (while hidden) in
 * TopNav. Its tooltip opens beside it (`tooltipSide`), instantly, with the
 * keyboard shortcut.
 */
export function SidebarToggle({
  action,
  onClick,
  className = "",
  tooltipSide = "bottom",
}: {
  action: "show" | "hide";
  onClick: () => void;
  className?: string;
  /** "bottom-end" keeps it inside the sidebar, which clips anything past its edge. */
  tooltipSide?: "bottom" | "bottom-end";
}) {
  const label = action === "hide" ? "Ẩn thanh bên" : "Hiện thanh bên";
  return (
    <span className={`group/toggle relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label} (Ctrl+B)`}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-on-surface-variant shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[color,background-color,border-color,box-shadow,transform] duration-200 hover:border-primary/50 hover:bg-primary-container/25 hover:text-primary hover:shadow-[0_0_18px_rgba(160,120,255,0.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-90"
      >
        <Icon
          name={action === "hide" ? "keyboard_double_arrow_left" : "keyboard_double_arrow_right"}
          className={`text-[20px] transition-transform duration-200 ${
            action === "hide" ? "group-hover/toggle:-translate-x-0.5" : "group-hover/toggle:translate-x-0.5"
          }`}
        />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 flex items-center gap-xs whitespace-nowrap rounded-md border border-white/[0.12] bg-surface-container-highest px-sm py-1 text-body-sm text-on-surface opacity-0 shadow-lg transition-opacity duration-150 group-hover/toggle:opacity-100 group-focus-within/toggle:opacity-100 [html[data-sidebar-hint]_&]:hidden ${
          tooltipSide === "bottom-end" ? "right-0 top-full mt-sm" : "left-0 top-full mt-sm"
        }`}
      >
        {label}
        <kbd className="font-technical rounded border border-white/[0.15] bg-white/[0.06] px-1 text-label-mono-sm text-on-surface-variant">
          Ctrl B
        </kbd>
      </span>
    </span>
  );
}

const HINT_STORAGE_KEY = "swm.sidebar.hint-seen";

/**
 * First visits on desktop: a bubble beside the hide button saying it hides
 * the sidebar. Gone for good once dismissed or once the sidebar is hidden.
 */
function SidebarHint({ collapsed }: { collapsed: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(HINT_STORAGE_KEY) === "1";
    } catch {
      // No storage: don't nag every visit.
    }
    if (seen) return;
    const timer = window.setTimeout(() => setShow(true), 1_200);
    return () => window.clearTimeout(timer);
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      window.localStorage.setItem(HINT_STORAGE_KEY, "1");
    } catch {
      // It just shows again next time.
    }
  }, []);

  // Hiding the sidebar is the lesson learned.
  useEffect(() => {
    if (collapsed && show) dismiss();
  }, [collapsed, show, dismiss]);

  // While the bubble is up, the button's own hover tooltip would sit on top of it.
  useEffect(() => {
    const root = document.documentElement;
    if (show && !collapsed) root.dataset.sidebarHint = "";
    else delete root.dataset.sidebarHint;
    return () => {
      delete root.dataset.sidebarHint;
    };
  }, [show, collapsed]);

  if (!show || collapsed) return null;
  return (
    <div
      role="dialog"
      aria-label="Mẹo"
      className="absolute left-full top-[30px] z-50 ml-3 hidden w-72 motion-safe:animate-[hint-in_300ms_ease-out] md:block rail:hidden"
    >
      {/* Arrow pointing back at the button. */}
      <span className="absolute -left-[7px] top-[14px] h-3.5 w-3.5 rotate-45 border-b border-l border-primary/40 bg-surface-container-highest" />
      <div className="relative rounded-lg border border-primary/40 bg-surface-container-highest p-sm shadow-[0_12px_32px_rgba(0,0,0,0.55),0_0_24px_rgba(160,120,255,0.18)]">
        <p className="flex items-center gap-xs text-headline-sm text-on-surface">
          <Icon name="touch_app" className="text-[20px] text-primary motion-safe:animate-[hint-nudge_1.2s_ease-in-out_infinite]" />
          Ấn vào đây để ẩn thanh bên
        </p>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Nhạc và phòng nghe sẽ rộng hơn. Hiện lại bằng nút{" "}
          <Icon name="keyboard_double_arrow_right" className="align-middle text-[16px]" /> ở góc trên, hoặc phím{" "}
          <kbd className="font-technical rounded border border-white/[0.15] bg-white/[0.06] px-1 text-label-mono-sm">Ctrl B</kbd>.
        </p>
        <div className="mt-sm flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full bg-primary-container px-md py-1 text-body-sm font-semibold text-on-primary-container transition-transform active:scale-95"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}
