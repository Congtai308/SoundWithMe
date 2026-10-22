"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Conversation, PublicUser } from "@soundwithme/types";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { useFriends } from "@/features/friends/hooks/use-friends";
import { useConversations, useMarkRead, useSendMessage, useThread } from "@/features/messages/hooks/use-messages";
import { MessageBubble } from "@/features/messages/components/MessageBubble";
import { useSearchTracks } from "@/features/music/hooks/use-search-tracks";
import { useRoomSession } from "@/features/rooms/components/RoomSessionProvider";
import { useRoomLiveStore } from "@/features/rooms/stores/room-live-store";
import { Avatar } from "@/components/ui/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { StatePanel, primaryPillClass } from "@/components/ui/StatePanel";
import { ApiClientError } from "@/services/api-client";

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesView />
    </Suspense>
  );
}

function preview(conversation: Conversation, myId: string): string {
  const m = conversation.lastMessage;
  const prefix = m.senderId === myId ? "Bạn: " : "";
  if (m.kind === "track") return `${prefix}🎵 ${m.track?.title ?? "Một bài hát"}`;
  if (m.kind === "room") return `${prefix}📻 ${m.room?.name ?? "Một phòng"}`;
  return `${prefix}${m.content}`;
}

/** Inbox on the left, the open conversation on the right (one at a time on phones). */
function MessagesView() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("with");
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: inbox } = useConversations({ enabled: Boolean(user) });
  const { data: friends } = useFriends({ enabled: Boolean(user) });

  // Friends you haven't written to yet can be opened too.
  const people = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const c of inbox?.conversations ?? []) map.set(c.user.id, c.user);
    for (const f of friends?.friends ?? []) if (!map.has(f.user.id)) map.set(f.user.id, f.user);
    return map;
  }, [inbox, friends]);

  if (userLoading) return null;
  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-md py-xl">
        <StatePanel
          icon="chat_bubble"
          title="Đăng nhập để nhắn tin với bạn bè"
          body="Gửi bài hát và lời mời vào phòng cho bạn bè."
          action={
            <Link href="/login" className={primaryPillClass}>
              Đăng nhập
            </Link>
          }
        />
      </div>
    );
  }

  const open = (id: string | null) => router.push(id ? `/messages?with=${id}` : "/messages");
  const openUser = openId ? people.get(openId) ?? null : null;
  const friendIds = new Set((friends?.friends ?? []).map((f) => f.user.id));
  const startable = (friends?.friends ?? []).filter((f) => !(inbox?.conversations ?? []).some((c) => c.user.id === f.user.id));

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem-5rem)] w-full max-w-6xl gap-md px-md py-md sm:h-[calc(100vh-4rem)]">
      <aside className={`${openId ? "hidden md:flex" : "flex"} w-full flex-col gap-sm md:w-80 md:shrink-0`}>
        <h1 className="text-headline-md text-on-surface">Tin nhắn</h1>
        <div className="flex-1 overflow-y-auto rounded-lg bg-surface-container-low p-xs">
          {(inbox?.conversations ?? []).map((c) => (
            <button
              key={c.user.id}
              type="button"
              onClick={() => open(c.user.id)}
              aria-current={c.user.id === openId ? "true" : undefined}
              className={`flex w-full items-center gap-sm rounded-md px-sm py-xs text-left transition-colors ${
                c.user.id === openId ? "bg-surface-container-high" : "hover:bg-white/[0.04]"
              }`}
            >
              <Avatar name={c.user.displayName} src={c.user.avatarUrl} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-headline-sm text-on-surface">{c.user.displayName}</span>
                <span className={`block truncate text-body-sm ${c.unread ? "font-semibold text-on-surface" : "text-on-surface-variant"}`}>
                  {preview(c, user.id)}
                </span>
              </span>
              {c.unread > 0 && (
                <span className="font-technical rounded-full bg-primary-container px-xs py-0.5 text-label-mono-sm text-on-primary-container">
                  {c.unread}
                </span>
              )}
            </button>
          ))}
          {startable.length > 0 && (
            <>
              <p className="font-technical px-sm pb-1 pt-sm text-label-mono-sm uppercase text-outline">Bắt đầu trò chuyện</p>
              {startable.map((f) => (
                <button
                  key={f.user.id}
                  type="button"
                  onClick={() => open(f.user.id)}
                  className="flex w-full items-center gap-sm rounded-md px-sm py-xs text-left hover:bg-white/[0.04]"
                >
                  <Avatar name={f.user.displayName} src={f.user.avatarUrl} size={32} online={f.online} />
                  <span className="truncate text-body-md text-on-surface">{f.user.displayName}</span>
                </button>
              ))}
            </>
          )}
          {(inbox?.conversations ?? []).length === 0 && startable.length === 0 && (
            <p className="p-sm text-body-md text-on-surface-variant">
              No messages yet. <Link href="/friends" className="font-semibold text-primary hover:underline">Kết bạn</Link> to start chatting.
            </p>
          )}
        </div>
      </aside>

      <section className={`${openId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col rounded-lg bg-surface-container-low`}>
        {openId && openUser ? (
          <Thread key={openId} other={openUser} myId={user.id} canWrite={friendIds.has(openId)} onBack={() => open(null)} />
        ) : (
          <div className="m-auto p-lg">
            <StatePanel icon="forum" title="Chọn một cuộc trò chuyện" body="Hoặc bắt đầu với một người bạn trong danh sách." />
          </div>
        )}
      </section>
    </div>
  );
}

function Thread({ other, myId, canWrite, onBack }: { other: PublicUser; myId: string; canWrite: boolean; onBack: () => void }) {
  const thread = useThread(other.id);
  const send = useSendMessage(other.id);
  const markRead = useMarkRead();
  const [draft, setDraft] = useState("");
  const [sharing, setSharing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { roomId, room } = useRoomSession();
  const inRoom = useRoomLiveStore((s) => Boolean(roomId) && s.membership === "member");

  const messages = useMemo(() => (thread.data?.pages ?? []).flatMap((p) => p.items).reverse(), [thread.data]);
  const newestId = messages.at(-1)?.id;
  const hasUnread = messages.some((m) => m.recipientId === myId && !m.readAt);
  const lastMineSeen = [...messages].reverse().find((m) => m.senderId === myId)?.readAt;
  const lastMineId = [...messages].reverse().find((m) => m.senderId === myId)?.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [newestId]);

  useEffect(() => {
    if (hasUnread && !document.hidden) markRead.mutate(other.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when new unread messages arrive
  }, [hasUnread, newestId, other.id]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || send.isPending) return;
    send.mutate({ kind: "text", content }, { onSuccess: () => setDraft("") });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <>
      <header className="flex items-center gap-sm border-b border-white/[0.06] px-md py-sm">
        <button type="button" onClick={onBack} aria-label="Quay lại danh sách tin nhắn" className="md:hidden">
          <Icon name="arrow_back" className="text-[22px] text-on-surface-variant" />
        </button>
        <Avatar name={other.displayName} src={other.avatarUrl} size={36} />
        <div className="min-w-0">
          <p className="truncate text-headline-sm text-on-surface">{other.displayName}</p>
          <p className="truncate text-body-sm text-on-surface-variant">@{other.username}</p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-sm overflow-y-auto px-md py-sm">
        {thread.hasNextPage && (
          <button
            type="button"
            onClick={() => void thread.fetchNextPage()}
            disabled={thread.isFetchingNextPage}
            className="mx-auto text-body-sm font-semibold text-primary hover:underline disabled:opacity-50"
          >
            {thread.isFetchingNextPage ? "Đang tải…" : "Xem tin nhắn cũ hơn"}
          </button>
        )}
        {thread.isLoading && <p className="m-auto text-body-md text-on-surface-variant">Đang tải…</p>}
        {!thread.isLoading && messages.length === 0 && (
          <p className="m-auto text-center text-body-md text-on-surface-variant">
            Say hi to {other.displayName}, or send them a song.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} mine={m.senderId === myId} seen={m.id === lastMineId && Boolean(lastMineSeen)} />
        ))}
        <div ref={bottomRef} />
      </div>

      {canWrite ? (
        <form onSubmit={submit} className="flex items-end gap-xs border-t border-white/[0.06] p-sm">
          <button
            type="button"
            onClick={() => setSharing(true)}
            title="Gửi bài hát"
            aria-label="Gửi bài hát"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-white/[0.08]"
          >
            <Icon name="music_note" className="text-[20px]" />
          </button>
          {inRoom && roomId && (
            <button
              type="button"
              onClick={() => send.mutate({ kind: "room", roomId })}
              title={`Mời vào ${room?.name ?? "phòng của bạn"}`}
              aria-label={`Mời vào ${room?.name ?? "phòng của bạn"}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-white/[0.08]"
            >
              <Icon name="sensors" className="text-[20px]" />
            </button>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={2000}
            placeholder={`Nhắn cho ${other.displayName}`}
            aria-label={`Nhắn cho ${other.displayName}`}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-white/[0.12] bg-surface-container-high px-md py-xs text-body-md text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || send.isPending}
            aria-label="Gửi"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container disabled:opacity-50"
          >
            <Icon name="send" className="text-[20px]" />
          </button>
        </form>
      ) : (
        <p className="border-t border-white/[0.06] p-sm text-center text-body-sm text-on-surface-variant">
          You&apos;re no longer friends, so you can read this conversation but not reply.
        </p>
      )}
      {send.error && (
        <p role="alert" className="px-md pb-sm text-body-sm text-error">
          {send.error instanceof ApiClientError ? send.error.message : "Không gửi được. Thử lại nhé."}
        </p>
      )}
      {sharing && (
        <PickSongDialog
          onClose={() => setSharing(false)}
          onPick={(trackId) => {
            send.mutate({ kind: "track", trackId });
            setSharing(false);
          }}
        />
      )}
    </>
  );
}

function PickSongDialog({ onClose, onPick }: { onClose: () => void; onPick: (trackId: string) => void }) {
  const [query, setQuery] = useState("");
  const results = useSearchTracks(query);

  return (
    <Dialog title="Gửi bài hát" onClose={onClose}>
      <div className="flex flex-col gap-sm p-md">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm bài hát"
          aria-label="Tìm bài hát"
          className="w-full rounded-lg border border-white/[0.12] bg-surface-container-high px-md py-sm text-body-md text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
        />
        <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
          {results.isFetching && <p className="text-body-sm text-on-surface-variant">Đang tìm…</p>}
          {(results.data ?? []).map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => onPick(track.id)}
              className="flex items-center gap-sm rounded-md px-sm py-xs text-left hover:bg-white/[0.06]"
            >
              {track.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- artwork comes from provider CDNs
                <img src={track.artworkUrl} alt="" className="h-10 w-10 shrink-0 rounded-sm object-cover" />
              ) : (
                <Icon name="music_note" className="h-10 w-10 text-[20px] text-outline" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-body-md text-on-surface">{track.title}</span>
                <span className="block truncate text-body-sm text-on-surface-variant">{track.artistName}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
