"use client";

import { useEffect, useState } from "react";
import type { Room } from "@soundwithme/types";
import { barButtonActiveClass, barButtonClass, barDangerButtonClass } from "@/components/ui/bar-controls";
import { Icon } from "@/components/ui/Icon";
import { TopNavSlot } from "@/components/layout/TopNavSlot";
import type { ConnectionStatus } from "../stores/room-live-store";
import { useRoomEffects } from "../stores/room-effects";
import { roomShareUrl } from "../share";

const CONNECTION_COPY: Record<ConnectionStatus, { label: string; tone: string } | null> = {
  idle: null,
  connected: null,
  connecting: { label: "Đang kết nối…", tone: "text-secondary" },
  reconnecting: { label: "Đang kết nối lại — nhạc sẽ tự đồng bộ", tone: "text-[#f59e0b]" },
  error: { label: "Không kết nối được máy chủ phòng", tone: "text-error" },
};

/** How long "end the room?" waits for the second tap. */
const END_CONFIRM_MS = 4_000;

const TYPE_ICON: Record<Room["type"], string> = {
  public: "public",
  duo: "group",
  friends: "diversity_3",
  private: "lock",
  community: "groups",
};
const TYPE_LABEL: Record<Room["type"], string> = {
  public: "Phòng công khai",
  duo: "Phòng nghe đôi (2 người)",
  friends: "Phòng chỉ bạn bè",
  private: "Phòng riêng tư",
  community: "Phòng cộng đồng",
};

interface RoomHeaderProps {
  room: Room;
  isHost: boolean;
  isDj: boolean;
  listenerCount: number;
  connection: ConnectionStatus;
  isLeaving: boolean;
  onLeave: () => void;
  onOpenPeople: () => void;
  onOpenInvite: () => void;
}

/** The room's title and actions, shown inside the app's top bar to leave the studio more height. */
export function RoomHeader({
  room,
  isHost,
  isDj,
  listenerCount,
  connection,
  isLeaving,
  onLeave,
  onOpenPeople,
  onOpenInvite,
}: RoomHeaderProps) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const status = CONNECTION_COPY[connection];
  const effectsOn = useRoomEffects((s) => s.enabled);
  const toggleEffects = useRoomEffects((s) => s.toggle);
  // Ending the room sends everyone out: the host taps twice.
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  useEffect(() => {
    if (!confirmingEnd) return;
    const timer = window.setTimeout(() => setConfirmingEnd(false), END_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirmingEnd]);

  const leaveOrEnd = () => {
    if (isHost && !confirmingEnd) setConfirmingEnd(true);
    else onLeave();
  };

  const share = async () => {
    try {
      // Private rooms: the host's link carries the invite code.
      await navigator.clipboard.writeText(roomShareUrl(room));
      setCopied("copied");
    } catch {
      // Clipboard can be blocked (permissions / insecure context): say so instead of failing silently.
      setCopied("failed");
    }
    window.setTimeout(() => setCopied("idle"), 2_000);
  };

  return (
    <>
      <TopNavSlot name="start">
        <div className="flex min-w-0 items-center gap-sm">
          <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-tr sm:flex from-[#7C3AED] via-[#d946ef] to-secondary p-[1.5px] shadow-lg">
            <span className="flex h-full w-full items-center justify-center rounded-[7px] bg-surface-container-lowest">
              <Icon name="graphic_eq" className="text-[18px] text-primary" />
            </span>
          </span>
          <div className="min-w-0">
            <h1 className="flex items-center gap-xs text-headline-sm text-on-surface">
              <span className="truncate">{room.name}</span>
              {isHost && (
                <span className="font-technical hidden shrink-0 rounded-full bg-tertiary-container/20 px-1.5 sm:inline py-0.5 text-label-mono-sm uppercase text-tertiary">
                  Chủ phòng
                </span>
              )}
              {isDj && (
                <span className="font-technical hidden shrink-0 rounded-full bg-[#8B5CF6]/20 px-1.5 sm:inline py-0.5 text-label-mono-sm uppercase text-[#c4b5fd]">
                  DJ
                </span>
              )}
              {room.type !== "public" && (
                <span title={TYPE_LABEL[room.type]} className="hidden shrink-0 items-center text-outline sm:flex">
                  <Icon name={TYPE_ICON[room.type]} className="text-[16px]" />
                </span>
              )}
            </h1>
            {status ? (
              <p role="status" className={`flex items-center gap-1 truncate text-body-sm ${status.tone}`}>
                <Icon name="sync_problem" className="text-[14px]" />
                {status.label}
              </p>
            ) : (
              room.description && <p className="truncate text-body-sm text-on-surface-variant">{room.description}</p>
            )}
          </div>
        </div>
      </TopNavSlot>

      <TopNavSlot name="end">
        <button
          type="button"
          onClick={onOpenPeople}
          aria-label={isHost ? "Quản lý phòng và mọi người" : "Người trong phòng"}
          title={isHost ? "Quản lý phòng & mọi người" : "Người trong phòng"}
          className={barButtonClass}
        >
          <Icon name={isHost ? "admin_panel_settings" : "group"} className="text-[18px]" />
          <span className="font-technical text-label-mono-sm">{listenerCount}</span>
          <span className="hidden xl:inline">{isHost ? "Quản lý" : "Mọi người"}</span>
        </button>
        <button
          type="button"
          onClick={onOpenInvite}
          aria-label="Mời bạn bè"
          title="Mời bạn bè"
          className={`${barButtonClass} !hidden sm:!inline-flex`}
        >
          <Icon name="person_add" className="text-[18px]" />
          <span className="hidden xl:inline">Mời</span>
        </button>
        <button
          type="button"
          onClick={toggleEffects}
          aria-pressed={effectsOn}
          aria-label={effectsOn ? "Tắt hiệu ứng phòng" : "Bật hiệu ứng phòng"}
          title={effectsOn ? "Đang bật hiệu ứng — tắt đi nếu thấy máy chậm" : "Đã tắt hiệu ứng — mượt hơn trên máy yếu"}
          className={`${effectsOn ? barButtonActiveClass : barButtonClass} !hidden sm:!inline-flex`}
        >
          <Icon name={effectsOn ? "auto_awesome" : "speed"} className="text-[18px]" />
          <span className="hidden lg:inline">{effectsOn ? "Hiệu ứng" : "Nhẹ"}</span>
        </button>
        <button
          type="button"
          onClick={share}
          aria-label={copied === "copied" ? "Đã copy link" : "Chia sẻ link phòng"}
          className={barButtonClass}
        >
          <Icon name={copied === "copied" ? "done" : "share"} className="text-[18px]" />
          <span className="hidden md:inline">
            {copied === "copied" ? "Đã copy link" : copied === "failed" ? "Copy không được" : "Chia sẻ"}
          </span>
        </button>
        <button
          type="button"
          onClick={leaveOrEnd}
          disabled={isLeaving}
          aria-label={confirmingEnd ? "Bấm lần nữa để kết thúc phòng cho mọi người" : isHost ? "Kết thúc phòng" : "Rời phòng"}
          className={barDangerButtonClass}
        >
          <Icon name={confirmingEnd ? "warning" : "logout"} className="text-[18px]" />
          {confirmingEnd ? (
            // Shown at every width: on a phone this is the only warning.
            <span aria-live="polite">Bấm lần nữa để kết thúc</span>
          ) : (
            <span className="hidden md:inline">{isLeaving ? "Đang rời…" : isHost ? "Kết thúc phòng" : "Rời phòng"}</span>
          )}
        </button>
      </TopNavSlot>
    </>
  );
}
