export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Not built yet — rendered disabled with a "Soon" tag instead of a dead link. */
  soon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Trang chủ", icon: "grid_view" },
  { href: "/discover", label: "Nhạc", icon: "music_note" },
  { href: "/rooms", label: "Phòng đang mở", icon: "sensors" },
  { href: "/friends", label: "Bạn bè", icon: "group" },
  { href: "/messages", label: "Tin nhắn", icon: "chat_bubble" },
  { href: "/library", label: "Thư viện", icon: "library_music" },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
