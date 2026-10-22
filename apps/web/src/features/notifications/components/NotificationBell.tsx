"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppNotification, NotificationType } from "@soundwithme/types";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { Icon } from "@/components/ui/Icon";
import { useMarkAllRead, useMarkRead, useNotifications } from "../hooks/use-notifications";

export const NOTIFICATION_ICON: Record<NotificationType, string> = {
  friend_request: "person_add",
  friend_accepted: "how_to_reg",
  friend_room_started: "podcasts",
  room_invite: "mail",
  sing_turn: "mic",
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "vừa xong";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)} ngày`;
}

/** Top-bar bell: friend requests, friends going live, invites, your turn to sing. */
export function NotificationBell() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data } = useNotifications({ enabled: Boolean(user) });
  const markAll = useMarkAllRead();
  const markOne = useMarkRead();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const unread = data?.unread ?? 0;

  const openNotification = (notification: AppNotification) => {
    if (!notification.readAt) markOne.mutate(notification.id);
    setOpen(false);
    if (notification.link) router.push(notification.link);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
        onClick={() => {
          setOpen((value) => !value);
          // Asking once, from a click, is the only way browsers allow it.
          if ("Thông báo" in window && Notification.permission === "default") void Notification.requestPermission();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <Icon name="notifications" className="text-[20px]" filled={unread > 0} />
        {unread > 0 && (
          <span className="font-technical absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ec4899] px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-xs flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-md border border-white/[0.16] bg-[rgba(30,41,59,0.96)] shadow-[0_12px_36px_-4px_rgba(0,0,0,0.65)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/[0.08] px-sm py-xs">
            <span className="text-headline-sm text-on-surface">Thông báo</span>
            {unread > 0 && (
              <button type="button" onClick={() => markAll.mutate()} className="text-body-sm text-primary hover:underline">
                Đánh dấu đã đọc hết
              </button>
            )}
          </div>
          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto p-1">
            {!data || data.items.length === 0 ? (
              <p className="px-sm py-lg text-center text-body-sm text-on-surface-variant">Chưa có gì — lời mời kết bạn và lời mời vào phòng sẽ hiện ở đây.</p>
            ) : (
              data.items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  role="menuitem"
                  onClick={() => openNotification(notification)}
                  className={`flex w-full items-start gap-sm rounded-sm px-sm py-xs text-left hover:bg-white/[0.06] ${
                    notification.readAt ? "opacity-70" : ""
                  }`}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container/20 text-primary">
                    <Icon name={NOTIFICATION_ICON[notification.type]} className="text-[18px]" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-xs">
                      <span className="truncate text-body-md font-semibold text-on-surface">{notification.title}</span>
                      {!notification.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-[#ec4899]" />}
                    </span>
                    <span className="text-body-sm text-on-surface-variant">{notification.body}</span>
                    <span className="text-label-mono-sm text-outline">{timeAgo(notification.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
