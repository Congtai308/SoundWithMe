"use client";

import { useState } from "react";
import Link from "next/link";
import type { Room, RoomListener } from "@soundwithme/types";
import { Avatar } from "@/components/ui/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { useFriends } from "@/features/friends/hooks/use-friends";
import type { RoomCommands } from "../hooks/use-room-socket";

/** Invite friends into this room through their notifications. */
export function InviteFriendsDialog({
  room,
  listeners,
  currentUserId,
  commands,
  onClose,
}: {
  room: Room;
  listeners: RoomListener[];
  currentUserId: string;
  commands: RoomCommands;
  onClose: () => void;
}) {
  const friends = useFriends();
  const [sent, setSent] = useState<Set<string>>(new Set());
  const here = new Set(listeners.map((l) => l.id));
  const blocked = room.type === "private" && room.hostId !== currentUserId;

  return (
    <Dialog title="Mời bạn bè" onClose={onClose}>
      {blocked ? (
        <p className="text-body-md text-on-surface-variant">Chỉ chủ phòng được mời người vào phòng riêng tư.</p>
      ) : friends.isLoading ? (
        <div className="h-24 animate-pulse rounded-md bg-surface-container" />
      ) : !friends.data || friends.data.friends.length === 0 ? (
        <div className="flex flex-col items-center gap-sm py-md text-center">
          <Icon name="group_add" className="text-[32px] text-outline" />
          <p className="text-body-md text-on-surface-variant">Chưa có bạn bè. Kết bạn ở trang Bạn bè nhé.</p>
          <Link href="/friends" className="rounded-full bg-primary-container px-md py-1.5 text-headline-sm text-on-primary-container">
            Tìm bạn
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {friends.data.friends.map(({ user, online }) => {
            const inRoom = here.has(user.id);
            const done = sent.has(user.id);
            return (
              <li key={user.id} className="flex items-center gap-sm rounded-md bg-white/[0.03] p-sm">
                <Avatar name={user.displayName} src={user.avatarUrl} size={36} online={online} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-md font-semibold text-on-surface">{user.displayName}</p>
                  <p className="truncate text-body-sm text-on-surface-variant">
                    {inRoom ? "Đã ở trong phòng" : online ? "Đang online" : "Offline — họ sẽ thấy trong thông báo"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={inRoom || done}
                  onClick={() => {
                    commands.inviteFriend(user.id);
                    setSent((previous) => new Set(previous).add(user.id));
                  }}
                  className="flex items-center gap-1 rounded-full bg-primary-container px-sm py-1 text-body-sm font-semibold text-on-primary-container disabled:bg-surface-container-high disabled:text-on-surface-variant"
                >
                  <Icon name={done ? "done" : "send"} className="text-[16px]" />
                  {done ? "Đã mời" : "Mời"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
