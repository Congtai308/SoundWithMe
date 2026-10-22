"use client";

import { useState } from "react";
import Link from "next/link";
import type { Room } from "@soundwithme/types";
import { ApiClientError } from "@/services/api-client";
import { Icon } from "@/components/ui/Icon";

interface JoinRoomGateProps {
  /** null: a private room we can't see yet (no invite link). */
  room: Room | null;
  /** The room accepts a passcode (private rooms only). */
  needsPasscode: boolean;
  isJoining: boolean;
  error: unknown;
  onJoin: (passcode?: string) => void;
}

const REASONS: Record<string, { icon: string; title: string }> = {
  ROOM_FRIENDS_ONLY: { icon: "diversity_3", title: "Friends only" },
  ROOM_BANNED: { icon: "block", title: "You can't rejoin this room" },
  ROOM_FULL: { icon: "groups", title: "This room is full" },
  ROOM_PASSCODE_INVALID: { icon: "password", title: "Wrong passcode" },
  ROOM_LOCKED: { icon: "lock", title: "Private room" },
};

/** Shown when the user isn't a member yet: join, or enter a private room's passcode. */
export function JoinRoomGate({ room, needsPasscode, isJoining, error, onJoin }: JoinRoomGateProps) {
  const [passcode, setPasscode] = useState("");
  const code = error instanceof ApiClientError ? error.code : null;
  const reason = code ? REASONS[code] : undefined;
  const blocked = code === "ROOM_BANNED" || code === "ROOM_FRIENDS_ONLY";
  const askPasscode = needsPasscode && !blocked;
  const inviteOnly = !room && !needsPasscode;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (askPasscode && passcode.trim().length === 0) return;
        onJoin(askPasscode ? passcode.trim() : undefined);
      }}
      className="mx-auto flex max-w-lg flex-col items-center gap-md rounded-lg bg-surface-container-low p-xl text-center shadow-2xl"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-container/20 text-primary">
        <Icon name={room ? (room.type === "private" ? "lock" : "headphones") : "lock"} className="text-[32px]" />
      </span>
      <div className="flex flex-col gap-1">
        {room ? (
          <>
            <span className="font-technical text-label-mono-sm uppercase text-secondary">
              {room.listenerCount} {room.listenerCount === 1 ? "listener" : "listeners"} inside
              {room.type === "friends" && " · friends only"}
              {room.type === "private" && " · private"}
            </span>
            <h1 className="text-headline-xl text-on-surface">{room.name}</h1>
            {room.description && <p className="text-body-lg text-on-surface-variant">{room.description}</p>}
          </>
        ) : (
          <>
            <span className="font-technical text-label-mono-sm uppercase text-secondary">Private room</span>
            <h1 className="text-headline-xl text-on-surface">{inviteOnly ? "Invite only" : "Enter the passcode"}</h1>
            <p className="text-body-md text-on-surface-variant">
              {inviteOnly
                ? "This room only opens with its invite link. Ask the host to send it to you."
                : "Ask the host for the passcode, or open the invite link they shared."}
            </p>
          </>
        )}
      </div>

      {askPasscode && (
        <label className="flex w-full max-w-xs flex-col gap-1 text-left">
          <span className="font-technical text-label-mono-sm uppercase text-outline">Passcode</span>
          <input
            type="password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            maxLength={32}
            autoComplete="off"
            autoFocus
            className="w-full rounded-md bg-surface-container-highest/60 px-md py-sm text-body-md text-on-surface shadow-inner focus:outline-none focus:ring-1 focus:ring-primary-container"
          />
        </label>
      )}

      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-body-md text-error">
          {reason && <Icon name={reason.icon} className="text-[18px]" />}
          {error instanceof ApiClientError ? error.message : "Couldn't join this room."}
        </p>
      ) : null}

      {!blocked && !inviteOnly && (
        <button
          type="submit"
          disabled={isJoining || (askPasscode && passcode.trim().length === 0)}
          className="flex items-center gap-xs rounded-full bg-primary-container px-lg py-sm text-headline-sm text-on-primary-container shadow-[0_0_24px_rgba(160,120,255,0.35)] transition-all active:scale-[0.96] disabled:opacity-60"
        >
          <Icon name={askPasscode ? "key" : "login"} className="text-[20px]" />
          {isJoining ? "Joining…" : askPasscode ? "Unlock & join" : "Listen together"}
        </button>
      )}
      <Link href="/rooms" className="text-body-sm text-on-surface-variant hover:text-on-surface">
        Back to live rooms
      </Link>
    </form>
  );
}
