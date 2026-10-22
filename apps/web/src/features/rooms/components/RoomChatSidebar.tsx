"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { REACTION_EMOJIS, type ChatMessage, type ReactionEmoji, type RoomListener } from "@soundwithme/types";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { useRoomMessages } from "@/features/chat/hooks/use-room-messages";
import { KaraokePanel } from "@/features/karaoke/components/KaraokePanel";
import { useKaraokeStore } from "@/features/karaoke/stores/karaoke-store";

const MAX_MESSAGE_LENGTH = 1000;
const VISIBLE_AVATARS = 6;
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

interface RoomChatSidebarProps {
  roomId: string;
  hostId: string;
  currentUserId: string;
  listeners: RoomListener[];
  chatEnabled: boolean;
  /** The host muted you in this room's chat. */
  isMuted: boolean;
  reactionsEnabled: boolean;
  isConnected: boolean;
  onSendMessage: (content: string) => void;
  onReact: (emoji: ReactionEmoji) => void;
}

/** Column 3 — who's listening, live chat and quick reactions (TASK-04). */
export function RoomChatSidebar({
  roomId,
  hostId,
  currentUserId,
  listeners,
  chatEnabled,
  isMuted,
  reactionsEnabled,
  isConnected,
  onSendMessage,
  onReact,
}: RoomChatSidebarProps) {
  const messages = useRoomMessages(roomId, chatEnabled);
  const singers = useKaraokeStore((s) => s.singers);
  const singingUserIds = useMemo(() => new Set(singers.map((s) => s.userId)), [singers]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  // Pages are newest-first; the list reads oldest → newest.
  const ordered = useMemo<ChatMessage[]>(
    () => (messages.data?.pages.flatMap((page) => page.items) ?? []).slice().reverse(),
    [messages.data],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [ordered.length]);

  const sortedListeners = useMemo(
    () => [...listeners].sort((a, b) => Number(b.id === hostId) - Number(a.id === hostId)),
    [listeners, hostId],
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !isConnected) return;
    onSendMessage(content);
    setDraft("");
    stickToBottomRef.current = true;
  };

  return (
    <section aria-label="Người nghe và chat" className="room-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
      <header className="flex shrink-0 flex-col gap-sm border-b border-white/[0.08] bg-white/[0.025] px-md py-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-headline-sm text-on-surface">Người nghe</h2>
          <span className="font-technical flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-xs py-0.5 text-label-mono-sm text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {listeners.length} online
          </span>
        </div>
        <ul className="flex items-center gap-xs" aria-label="Người đang nghe">
          {sortedListeners.slice(0, VISIBLE_AVATARS).map((listener) => (
            <li
              key={listener.id}
              title={`${listener.displayName}${listener.id === hostId ? " (chủ phòng)" : ""}`}
              className={`relative rounded-full ${listener.id === hostId ? "ring-2 ring-tertiary-container ring-offset-2 ring-offset-surface-container-low" : ""}`}
            >
              <Avatar name={listener.displayName} src={listener.avatarUrl} size={34} online />
              {singingUserIds.has(listener.id) && (
                <span
                  title="Đang hát"
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#ec4899] text-white shadow"
                >
                  <Icon name="mic" className="text-[11px]" filled />
                </span>
              )}
            </li>
          ))}
          {listeners.length > VISIBLE_AVATARS && (
            <li className="font-technical flex h-[34px] w-[34px] items-center justify-center rounded-full bg-surface-container-high text-label-mono-sm text-on-surface-variant">
              +{listeners.length - VISIBLE_AVATARS}
            </li>
          )}
        </ul>
      </header>

      <KaraokePanel isHost={hostId === currentUserId} />

      <div className="flex shrink-0 items-center justify-between px-md pt-sm">
        <span className="font-technical text-label-mono-sm uppercase text-outline">Chat</span>
        <span className="text-body-sm text-outline">Chat trong phòng</span>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        aria-live="polite"
        className="scrollbar-none flex min-h-[200px] flex-1 flex-col gap-sm overflow-y-auto px-md py-sm"
      >
        {!chatEnabled ? (
          <ChatNotice icon="speaker_notes_off" text="Chủ phòng đã tắt chat." />
        ) : messages.isLoading ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-sm">
              <div className="h-8 w-8 animate-pulse rounded-full bg-surface-container-high" />
              <div className="flex flex-1 flex-col gap-1">
                <div className="h-3 w-24 animate-pulse rounded-full bg-surface-container-high" />
                <div className="h-6 w-3/4 animate-pulse rounded-md bg-surface-container-high" />
              </div>
            </div>
          ))
        ) : messages.isError ? (
          <ChatNotice
            icon="wifi_off"
            text="Không tải được chat."
            action={{ label: "Thử lại", onClick: () => messages.refetch() }}
          />
        ) : (
          <>
            {messages.hasNextPage && (
              <button
                type="button"
                onClick={() => {
                  stickToBottomRef.current = false;
                  void messages.fetchNextPage();
                }}
                disabled={messages.isFetchingNextPage}
                className="self-center rounded-full bg-surface-container-high px-sm py-1 text-body-sm text-on-surface-variant hover:text-on-surface disabled:opacity-60"
              >
                {messages.isFetchingNextPage ? "Đang tải…" : "Xem tin nhắn cũ hơn"}
              </button>
            )}
            {ordered.length === 0 && <ChatNotice icon="forum" text="Chưa có tin nhắn — chào cả phòng đi 👋" />}
            {ordered.map((message) => {
              // Your own messages sit on the right; everyone else's on the left.
              const isOwn = message.userId === currentUserId;
              return (
                <article key={message.id} className={`flex gap-sm ${isOwn ? "flex-row-reverse" : ""}`}>
                  <Avatar name={message.authorName} size={32} />
                  <div className={`flex min-w-0 flex-1 flex-col ${isOwn ? "items-end" : "items-start"}`}>
                    <p className={`flex max-w-full items-baseline gap-xs ${isOwn ? "flex-row-reverse" : ""}`}>
                      <span
                        className={`truncate text-body-sm font-semibold ${
                          message.userId === hostId ? "text-tertiary" : isOwn ? "text-secondary" : "text-primary"
                        }`}
                      >
                        {isOwn ? "Bạn" : message.authorName}
                      </span>
                      <time dateTime={message.createdAt} className="shrink-0 text-[11px] text-outline">
                        {TIME_FORMAT.format(new Date(message.createdAt))}
                      </time>
                    </p>
                    {/* Rendered as text — React escapes it; never inject HTML from chat. */}
                    <p
                      className={`mt-0.5 w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-md border px-sm py-1.5 text-body-md text-on-surface shadow-[0_2px_8px_rgba(0,0,0,0.25)] ${
                        isOwn
                          ? "rounded-tr-sm border-[#8B5CF6]/30 bg-[#8B5CF6]/20"
                          : "rounded-tl-sm border-white/[0.07] bg-surface-container-high/90"
                      }`}
                    >
                      {message.content}
                    </p>
                  </div>
                </article>
              );
            })}
          </>
        )}
      </div>

      {reactionsEnabled && (
        <div className="flex shrink-0 items-center justify-between border-t border-white/[0.08] px-sm py-xs" aria-label="Thả cảm xúc">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={!isConnected}
              onClick={() => onReact(emoji)}
              aria-label={`Thả ${emoji}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[20px] transition-transform hover:scale-125 hover:bg-white/[0.06] active:scale-95 disabled:opacity-40"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex shrink-0 items-center gap-xs border-t border-white/[0.08] p-sm">
        <label htmlFor="room-chat-input" className="sr-only">
          Nhắn cho cả phòng
        </label>
        <input
          id="room-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={!chatEnabled || isMuted || !isConnected}
          placeholder={
            !chatEnabled ? "Chat đã tắt" : isMuted ? "Chủ phòng đã tắt chat của bạn" : isConnected ? "Nói gì đó…" : "Đang kết nối lại…"
          }
          className="min-w-0 flex-1 rounded-full bg-surface-container px-md py-xs text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary-container disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!chatEnabled || isMuted || !isConnected || !draft.trim()}
          aria-label="Gửi tin nhắn"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container transition-opacity disabled:opacity-40"
        >
          <Icon name="send" className="text-[18px]" filled />
        </button>
      </form>
    </section>
  );
}

function ChatNotice({
  icon,
  text,
  action,
}: {
  icon: string;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-xs py-lg text-center">
      <Icon name={icon} className="text-[28px] text-outline" />
      <p className="text-body-sm text-on-surface-variant">{text}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="text-body-sm font-semibold text-primary hover:underline">
          {action.label}
        </button>
      )}
    </div>
  );
}
