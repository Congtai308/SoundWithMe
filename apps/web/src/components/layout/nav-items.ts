export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Not built yet — rendered disabled with a "Soon" tag instead of a dead link. */
  soon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "grid_view" },
  { href: "/discover", label: "Music", icon: "music_note" },
  { href: "/rooms", label: "Live Rooms", icon: "sensors" },
  { href: "/friends", label: "Friends & Presence", icon: "group" },
  { href: "/messages", label: "Messages", icon: "chat_bubble" },
  { href: "/library", label: "Library", icon: "library_music" },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
