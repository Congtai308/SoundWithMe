"use client";

import { useEffect, useState } from "react";
import { setPendingPlay } from "../pending-play";
import Link from "next/link";
import type { Room } from "@soundwithme/types";
import { Icon } from "@/components/ui/Icon";
import { roomSharePath, roomShareUrl } from "../share";

type CopyState = "idle" | "copied" | "failed";

export function RoomReadyPanel({ room, playTrackId = null }: { room: Room; playTrackId?: string | null }) {
  const [inviteUrl, setInviteUrl] = useState(roomSharePath(room));
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    setInviteUrl(roomShareUrl(room));
  }, [room]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyState("copied");
    } catch {
      // Clipboard can be blocked (insecure context, permissions) — tell the
      // user to copy manually instead of silently doing nothing.
      setCopyState("failed");
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-lg py-md text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary/15 text-secondary shadow-[0_0_32px_rgba(76,215,246,0.25)]">
        <Icon name="check_circle" className="text-[36px]" filled />
      </div>

      <div className="flex flex-col gap-xs">
        <span className="font-technical text-label-mono-sm uppercase text-secondary">Your room is live</span>
        <h2 className="text-headline-xl text-on-surface">{room.name}</h2>
        {room.description && <p className="text-body-lg text-on-surface-variant">{room.description}</p>}
      </div>

      <div className="flex w-full flex-col gap-xs text-left">
        <span className="font-technical text-label-mono-sm uppercase text-outline">Instant invite link</span>
        <div className="flex items-center gap-xs rounded-md bg-surface-container p-xs pl-md shadow-inner">
          <Icon name="link" className="text-[18px] text-outline" />
          <input
            readOnly
            value={inviteUrl}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
            className="font-technical min-w-0 flex-1 bg-transparent text-label-mono-md text-on-surface focus:outline-none"
          />
          <button
            type="button"
            onClick={copyInvite}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container-high px-md py-xs text-headline-sm text-on-surface hover:bg-surface-container-highest"
          >
            <Icon name={copyState === "copied" ? "done" : "content_copy"} className="text-[18px]" />
            {copyState === "copied" ? "Copied" : "Copy"}
          </button>
        </div>
        {copyState === "failed" && (
          <span className="text-body-sm text-error">Couldn&apos;t access the clipboard — select the link and copy it manually.</span>
        )}
        {room.type === "private" && (
          <span className="text-body-sm text-on-surface-variant">
            Private: only people with this link{room.hasPasscode ? " or the passcode" : ""} can get in. It isn&apos;t listed anywhere.
          </span>
        )}
        {room.type === "friends" && (
          <span className="text-body-sm text-on-surface-variant">Friends only: your friends can join; they&apos;ve been notified.</span>
        )}
        {room.type === "duo" && (
          <span className="text-body-sm text-on-surface-variant">
            Duo rooms fit you and one other listener — send this link to them.
          </span>
        )}
      </div>

      <div className="flex w-full flex-col gap-sm sm:flex-row">
        <Link
          href={`/room/${room.id}`}
          onClick={() => playTrackId && setPendingPlay(room.id, playTrackId)}
          className="flex flex-1 items-center justify-center gap-xs rounded-full bg-primary-container px-md py-sm text-headline-sm text-on-primary-container shadow-[0_0_24px_rgba(160,120,255,0.35)] transition-all active:scale-[0.96]"
        >
          <Icon name="login" className="text-[20px]" />
          Enter Room
        </Link>
        <Link
          href="/rooms"
          className="flex flex-1 items-center justify-center gap-xs rounded-full border border-white/[0.12] bg-white/[0.06] px-md py-sm text-headline-sm text-on-surface hover:border-white/[0.18]"
        >
          Browse live rooms
        </Link>
      </div>
    </div>
  );
}
