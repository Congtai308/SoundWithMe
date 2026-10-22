"use client";

import { useState } from "react";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { useFriends } from "@/features/friends/hooks/use-friends";
import { Avatar } from "@/components/ui/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { showToast } from "@/components/ui/Toaster";
import { ApiClientError } from "@/services/api-client";
import { messagesApi } from "../services/messages-api";

/** "Send to a friend": shares a song into a direct message. */
export function ShareTrackButton({ trackId, trackTitle }: { trackId: string; trackTitle: string }) {
  const { data: user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Gửi “${trackTitle}” cho bạn bè`}
        title="Gửi cho bạn bè"
        className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-white/[0.08] hover:text-on-surface"
      >
        <Icon name="send" className="text-[18px]" />
      </button>
      {open && <ShareTrackDialog trackId={trackId} trackTitle={trackTitle} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareTrackDialog({ trackId, trackTitle, onClose }: { trackId: string; trackTitle: string; onClose: () => void }) {
  const { data, isLoading } = useFriends();
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const friends = data?.friends ?? [];

  const send = async (friendId: string, name: string) => {
    setPending(friendId);
    try {
      await messagesApi.send(friendId, { kind: "track", trackId });
      setSentTo((previous) => new Set(previous).add(friendId));
    } catch (error) {
      showToast({
        icon: "error",
        tone: "error",
        title: `Không gửi được cho ${name}`,
        body: error instanceof ApiClientError ? error.message : "Thử lại sau giây lát.",
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog title={`Gửi “${trackTitle}”`} onClose={onClose}>
      <div className="flex flex-col gap-1 overflow-y-auto p-md">
        {isLoading && <p className="text-body-md text-on-surface-variant">Đang tải danh sách bạn bè…</p>}
        {!isLoading && friends.length === 0 && (
          <p className="text-body-md text-on-surface-variant">Hãy kết bạn trước, rồi bạn có thể gửi bài hát cho họ.</p>
        )}
        {friends.map(({ user, online }) => {
          const sent = sentTo.has(user.id);
          return (
            <div key={user.id} className="flex items-center gap-sm rounded-md px-sm py-xs hover:bg-white/[0.04]">
              <Avatar name={user.displayName} src={user.avatarUrl} size={36} online={online} />
              <span className="min-w-0 flex-1 truncate text-body-md text-on-surface">{user.displayName}</span>
              <button
                type="button"
                disabled={sent || pending === user.id}
                onClick={() => void send(user.id, user.displayName)}
                className="rounded-full bg-primary-container px-md py-1 text-body-sm font-semibold text-on-primary-container disabled:opacity-60"
              >
                {sent ? "Đã gửi" : pending === user.id ? "Đang gửi…" : "Gửi"}
              </button>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
