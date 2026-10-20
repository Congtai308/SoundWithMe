"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SOCKET_EVENTS } from "@soundwithme/constants";
import type { AppNotification } from "@soundwithme/types";
import { getSocket } from "@/services/socket-client";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { showToast } from "@/components/ui/Toaster";
import { FRIENDS_KEY } from "@/features/friends/hooks/use-friends";
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
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(notification.title, { body: notification.body, tag: notification.id });
        } catch {
          // Some browsers only allow notifications from a service worker.
        }
      }
    };
    const onFriendsChanged = () => void queryClient.invalidateQueries({ queryKey: FRIENDS_KEY });
    // After a reconnect, catch up on anything pushed while we were away.
    const onConnect = () => void queryClient.invalidateQueries({ queryKey: ["notifications"] });

    socket.on(SOCKET_EVENTS.NOTIFICATION, onNotification);
    socket.on(SOCKET_EVENTS.FRIENDS_CHANGED, onFriendsChanged);
    socket.on("connect", onConnect);
    return () => {
      socket.off(SOCKET_EVENTS.NOTIFICATION, onNotification);
      socket.off(SOCKET_EVENTS.FRIENDS_CHANGED, onFriendsChanged);
      socket.off("connect", onConnect);
    };
  }, [userId, queryClient]);

  // Signing out: drop the socket (it authenticated as the old user).
  useEffect(() => {
    if (user === null) {
      const socket = getSocket();
      if (socket.connected) socket.disconnect();
    }
  }, [user]);

  return null;
}
