"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SOCKET_EVENTS } from "@soundwithme/constants";
import type { AppNotification, DirectMessage } from "@soundwithme/types";
import { getSocket } from "@/services/socket-client";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { showToast } from "@/components/ui/Toaster";
import { FRIENDS_KEY } from "@/features/friends/hooks/use-friends";
import { CONVERSATIONS_KEY, applyLiveMessage, applyLiveRead } from "@/features/messages/hooks/use-messages";
import { forgetLocalPreferences } from "@/features/music/hooks/use-music-preferences";
import { addLiveNotification } from "../hooks/use-notifications";
import { NOTIFICATION_ICON } from "./NotificationBell";

/**
 * Keeps the signed-in user's socket open on every page (not only in rooms),
 * so the bell, friends' presence and "your turn to sing" arrive live.
 */
export function UserRealtime() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const onNotification = (notification: AppNotification) => {
      addLiveNotification(queryClient, notification);
      if (notification.type === "friend_request" || notification.type === "friend_accepted") {
        void queryClient.invalidateQueries({ queryKey: FRIENDS_KEY });
      }
      // The karaoke panel announces your own turn itself.
      if (notification.type === "sing_turn") return;
      showToast({ icon: NOTIFICATION_ICON[notification.type], title: notification.title, body: notification.body, href: notification.link });
      if (document.hidden && "Thông báo" in window && Notification.permission === "granted") {
        try {
          new Notification(notification.title, { body: notification.body, tag: notification.id });
        } catch {
          // Some browsers only allow notifications from a service worker.
        }
      }
    };
    const onFriendsChanged = () => void queryClient.invalidateQueries({ queryKey: FRIENDS_KEY });
    const onDirectMessage = (message: DirectMessage) => {
      applyLiveMessage(queryClient, message, userId);
      // The open conversation shows it already; elsewhere, a toast.
      const openThread = new URLSearchParams(window.location.search).get("with");
      if (message.senderId === userId || (window.location.pathname === "/messages" && openThread === message.senderId)) return;
      showToast({
        icon: "chat_bubble",
        title: "Tin nhắn mới",
        body: message.kind === "track" ? `Đã gửi “${message.track?.title ?? "một bài hát"}”` : message.kind === "room" ? `Mời bạn vào “${message.room?.name ?? "một phòng"}”` : message.content.slice(0, 120),
        href: `/messages?with=${message.senderId}`,
      });
    };
    const onDirectRead = (payload: { conversationId: string; readerId: string; readAt: string }) =>
      applyLiveRead(queryClient, payload, userId);
    // After a reconnect, catch up on anything pushed while we were away.
    const onConnect = () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    };

    socket.on(SOCKET_EVENTS.NOTIFICATION, onNotification);
    socket.on(SOCKET_EVENTS.FRIENDS_CHANGED, onFriendsChanged);
    socket.on(SOCKET_EVENTS.DM_MESSAGE, onDirectMessage);
    socket.on(SOCKET_EVENTS.DM_READ, onDirectRead);
    socket.on("connect", onConnect);
    return () => {
      socket.off(SOCKET_EVENTS.NOTIFICATION, onNotification);
      socket.off(SOCKET_EVENTS.FRIENDS_CHANGED, onFriendsChanged);
      socket.off(SOCKET_EVENTS.DM_MESSAGE, onDirectMessage);
      socket.off(SOCKET_EVENTS.DM_READ, onDirectRead);
      socket.off("connect", onConnect);
    };
  }, [userId, queryClient]);

  // Another account (or nobody) on this tab now: drop everything cached for
  // the previous one (friends, library, bell, messages), so the next person
  // never sees it. Only the current-user query stays; it is already fresh.
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (user === undefined) return; // still loading
    const current = user?.id ?? null;
    const previous = previousUserId.current;
    previousUserId.current = current;
    if (previous === undefined || previous === null || previous === current) return;
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
    forgetLocalPreferences();
  }, [user, queryClient]);

  // Signing out: drop the socket (it authenticated as the old user).
  useEffect(() => {
    if (user === null) {
      const socket = getSocket();
      if (socket.connected) socket.disconnect();
    }
  }, [user]);

  return null;
}
