"use client";

import { useState } from "react";
import type { Room } from "@soundwithme/types";
import { Icon } from "@/components/ui/Icon";
import { TopNavSlot } from "@/components/layout/TopNavSlot";
import type { ConnectionStatus } from "../stores/room-live-store";
import { useRoomEffects } from "../stores/room-effects";
import { roomShareUrl } from "../share";

const CONNECTION_COPY: Record<ConnectionStatus, { label: string; tone: string } | null> = {
  idle: null,
  connected: null,
  connecting: { label: "Connecting…", tone: "text-secondary" },
  reconnecting: { label: "Reconnecting — playback will resync", tone: "text-[#f59e0b]" },
  error: { label: "Can't reach the room server", tone: "text-error" },
};

const TYPE_ICON: Record<Room["type"], string> = {
  public: "public",
  duo: "group",
  friends: "diversity_3",
  private: "lock",
  community: "groups",
};
const TYPE_LABEL: Record<Room["type"], string> = {
  public: "Public room",
  duo: "Duo room (2 people)",
  friends: "Friends-only room",
  private: "Private room",
  community: "Community room",
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
                  Host
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
          aria-label={isHost ? "Manage room and people" : "People in this room"}
          title={isHost ? "Manage room & people" : "People in this room"}
          className="flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-white/[0.06] px-sm py-1.5 text-body-sm font-medium text-on-surface transition-colors hover:border-white/[0.18]"
        >
          <Icon name={isHost ? "admin_panel_settings" : "group"} className="text-[18px]" />
          <span className="font-technical text-label-mono-sm">{listenerCount}</span>
          <span className="hidden xl:inline">{isHost ? "Manage" : "People"}</span>
        </button>
        <button
          type="button"
          onClick={onOpenInvite}
          aria-label="Invite friends"
          title="Invite friends"
          className="hidden items-center gap-1.5 sm:flex rounded-md border border-white/[0.12] bg-white/[0.06] px-sm py-1.5 text-body-sm font-medium text-on-surface transition-colors hover:border-white/[0.18]"
        >
          <Icon name="person_add" className="text-[18px]" />
          <span className="hidden xl:inline">Invite</span>
        </button>
        <button
          type="button"
          onClick={toggleEffects}
          aria-pressed={effectsOn}
          aria-label={effectsOn ? "Turn off room effects" : "Turn on room effects"}
          title={effectsOn ? "Effects on — turn off if the room feels slow" : "Effects off — smoother on slower devices"}
          className={`hidden items-center gap-1.5 rounded-md border px-sm py-1.5 text-body-sm font-medium transition-colors sm:flex ${
            effectsOn
              ? "border-[#f472b6]/40 bg-[#f472b6]/10 text-[#f9a8d4] hover:border-[#f472b6]/60"
              : "border-white/[0.12] bg-white/[0.06] text-on-surface-variant hover:border-white/[0.18]"
          }`}
        >
          <Icon name={effectsOn ? "auto_awesome" : "speed"} className="text-[18px]" />
          <span className="hidden lg:inline">{effectsOn ? "Effects" : "Lite"}</span>
        </button>
        <button
          type="button"
          onClick={share}
          aria-label={copied === "copied" ? "Link copied" : "Share room link"}
          className="flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-white/[0.06] px-sm py-1.5 text-body-sm font-medium text-on-surface transition-colors hover:border-white/[0.18]"
        >
          <Icon name={copied === "copied" ? "done" : "share"} className="text-[18px]" />
          <span className="hidden md:inline">
            {copied === "copied" ? "Link copied" : copied === "failed" ? "Copy failed" : "Share"}
          </span>
        </button>
        <button
          type="button"
          onClick={onLeave}
          disabled={isLeaving}
          aria-label={isHost ? "End room" : "Leave room"}
          className="flex items-center gap-1.5 rounded-md px-sm py-1.5 text-body-sm font-medium text-on-surface-variant transition-colors hover:bg-error-container/30 hover:text-error disabled:opacity-60"
        >
          <Icon name="logout" className="text-[18px]" />
          <span className="hidden md:inline">{isLeaving ? "Leaving…" : isHost ? "End room" : "Leave"}</span>
        </button>
      </TopNavSlot>
    </>
  );
}
