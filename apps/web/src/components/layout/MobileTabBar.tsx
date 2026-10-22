"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { Icon } from "@/components/ui/Icon";
import { isActivePath } from "./nav-items";

/** Phone-only bottom navigation (<768px), replacing the sidebar. */
export function MobileTabBar() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();

  const tabs = [
    { href: "/", label: "Home", icon: "grid_view" },
    { href: "/discover", label: "Nhạc", icon: "music_note" },
    { href: user ? "/rooms/new" : "/login", label: "Tạo", icon: "add_circle" },
    { href: "/rooms", label: "Phòng", icon: "sensors" },
    { href: "/friends", label: "Bạn bè", icon: "group" },
    { href: "/library", label: "Thư viện", icon: "library_music" },
  ];

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-stretch justify-around border-t border-white/[0.06] bg-surface-container-lowest sm:hidden"
    >
      {tabs.map((tab) => {
        const active = tab.label !== "Tạo" && isActivePath(pathname, tab.href);
        return (
          <Link
            key={tab.label}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
              active ? "text-primary" : "text-outline"
            }`}
          >
            <Icon name={tab.icon} className="text-[22px]" filled={active} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
