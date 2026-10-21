"use client";

import { useState } from "react";
import type { Room, RoomListener } from "@soundwithme/types";
import { MAX_ROOM_DJS, MAX_ROOM_LISTENERS, MAX_ROOM_SINGERS } from "@soundwithme/validation";
import { Avatar } from "@/components/ui/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { showToast } from "@/components/ui/Toaster";
import { ApiClientError } from "@/services/api-client";
import { useRegenerateInvite, useUpdateRoom } from "../hooks/use-rooms";
import type { RoomCommands } from "../hooks/use-room-socket";
import { roomShareUrl } from "../share";
import { Toggle } from "./CreateRoomForm";

type Tab = "people" | "settings";
type Pending = { userId: string; action: "host" | "kick" } | null;

/** Who's here (with roles) and, for the host, the room's controls. */
export function RoomPeopleDialog({
  room,
  listeners,
  currentUserId,
  commands,
  initialTab = "people",
  onInvite,
  onClose,
}: {
  room: Room;
  listeners: RoomListener[];
  currentUserId: string;
  commands: RoomCommands;
  initialTab?: Tab;
  onInvite: () => void;
  onClose: () => void;
}) {
  const isHost = room.hostId === currentUserId;
  const [tab, setTab] = useState<Tab>(isHost ? initialTab : "people");

  return (
    <Dialog title={isHost ? "Manage room" : "People here"} onClose={onClose} wide={isHost}>
      {isHost && (
        <div role="tablist" className="mb-md flex rounded-full bg-surface-container p-1">
          {(["people", "settings"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-headline-sm capitalize ${
                tab === value ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant"
              }`}
            >
              <Icon name={value === "people" ? "group" : "tune"} className="text-[18px]" />
              {value === "people" ? `People · ${listeners.length}` : "Settings"}
            </button>
          ))}
        </div>
      )}
      {tab === "people" && (
        <button
          type="button"
          onClick={onInvite}
          className="mb-sm flex w-full items-center justify-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.06] py-1.5 text-body-sm font-semibold text-on-surface hover:border-white/[0.2]"
        >
          <Icon name="person_add" className="text-[18px]" />
          Invite friends
        </button>
      )}
      {tab === "people" ? (
        <PeopleList room={room} listeners={listeners} currentUserId={currentUserId} commands={commands} />
      ) : (
        <RoomSettingsForm room={room} />
      )}
    </Dialog>
  );
}

function PeopleList({
  room,
  listeners,
  currentUserId,
  commands,
}: {
  room: Room;
  listeners: RoomListener[];
  currentUserId: string;
  commands: RoomCommands;
}) {
  const isHost = room.hostId === currentUserId;
  const [pending, setPending] = useState<Pending>(null);
  const rank = (l: RoomListener) => (l.id === room.hostId ? 0 : room.djIds.includes(l.id) ? 1 : 2);
  const people = [...listeners].sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName));
  const djsFull = room.djIds.length >= MAX_ROOM_DJS;

  return (
    <div className="flex flex-col gap-sm">
      {isHost && (
        <p className="text-body-sm text-on-surface-variant">
          DJs control the music and the queue like you. Removed people can&apos;t come back to this room.
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {people.map((person) => {
          const isRoomHost = person.id === room.hostId;
          const isDj = room.djIds.includes(person.id);
          const muted = room.mutedUserIds.includes(person.id);
          const isMe = person.id === currentUserId;
          const confirming = pending?.userId === person.id ? pending.action : null;
          return (
            <li key={person.id} className="flex flex-col gap-xs rounded-md bg-white/[0.03] p-sm">
              <div className="flex items-center gap-sm">
                <Avatar name={person.displayName} size={36} online />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-md font-semibold text-on-surface">
                    {person.displayName}
                    {isMe && <span className="font-normal text-outline"> (you)</span>}
                  </p>
                  <p className="flex flex-wrap gap-1">
                    {isRoomHost && <Badge tone="host" label="Host" />}
                    {isDj && <Badge tone="dj" label="DJ" />}
                    {muted && <Badge tone="muted" label="Muted" />}
                  </p>
                </div>
                {isHost && !isMe && !confirming && (
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <ActionButton
                      icon={isDj ? "headset_off" : "headphones"}
                      label={isDj ? "Remove DJ" : "Make DJ"}
                      disabled={!isDj && djsFull}
                      title={!isDj && djsFull ? `Up to ${MAX_ROOM_DJS} DJs` : undefined}
                      onClick={() => commands.setDj(person.id, !isDj)}
                    />
                    <ActionButton
                      icon={muted ? "chat" : "speaker_notes_off"}
                      label={muted ? "Unmute" : "Mute chat"}
                      onClick={() => commands.muteUser(person.id, !muted)}
                    />
                    <ActionButton icon="workspace_premium" label="Make host" onClick={() => setPending({ userId: person.id, action: "host" })} />
                    <ActionButton icon="person_remove" label="Remove" tone="danger" onClick={() => setPending({ userId: person.id, action: "kick" })} />
                  </div>
                )}
              </div>
              {confirming && (
                <div className="flex flex-wrap items-center justify-between gap-xs rounded-md bg-surface-container px-sm py-xs">
                  <span className="text-body-sm text-on-surface">
                    {confirming === "host"
                      ? `Hand the room to ${person.displayName}? You'll stay in as a listener.`
                      : `Remove ${person.displayName}? They won't be able to come back.`}
                  </span>
                  <span className="flex gap-1">
                    <ActionButton icon="close" label="Cancel" onClick={() => setPending(null)} />
                    <ActionButton
                      icon="check"
                      label={confirming === "host" ? "Hand over" : "Remove"}
                      tone={confirming === "kick" ? "danger" : "primary"}
                      onClick={() => {
                        if (confirming === "host") commands.transferHost(person.id);
                        else commands.kickUser(person.id);
                        setPending(null);
                      }}
                    />
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {people.length === 0 && <p className="text-body-sm text-on-surface-variant">Nobody is connected right now.</p>}
    </div>
  );
}

function RoomSettingsForm({ room }: { room: Room }) {
  const update = useUpdateRoom(room.id);
  const regenerate = useRegenerateInvite(room.id);
  const [passcode, setPasscode] = useState("");
  const [maxListeners, setMaxListeners] = useState(room.settings.maxListeners);
  const settings = room.settings;

  const save = (input: Parameters<typeof update.mutate>[0], done?: string) =>
    update.mutate(input, {
      onSuccess: () => done && showToast({ icon: "check_circle", tone: "success", title: done }),
      onError: (error) =>
        showToast({
          icon: "error",
          tone: "error",
          title: "Couldn't save",
          body: error instanceof ApiClientError ? error.message : undefined,
        }),
    });

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-col gap-sm">
        <Toggle
          icon="chat"
          label="Live chat"
          checked={settings.chatEnabled}
          disabled={update.isPending}
          onChange={(value) => save({ settings: { chatEnabled: value } })}
        />
        <Toggle
          icon="add_reaction"
          label="Live reactions"
          checked={settings.reactionsEnabled}
          disabled={update.isPending}
          onChange={(value) => save({ settings: { reactionsEnabled: value } })}
        />
      </div>

      <Choice
        label="Who controls playback"
        value={settings.whoCanControlPlayback}
        options={[
          { value: "host", label: "Host & DJs" },
          { value: "everyone", label: "Everyone" },
        ]}
        onChange={(value) => save({ settings: { whoCanControlPlayback: value } })}
      />
      <Choice
        label="Who can queue songs"
        value={settings.whoCanAddSongs === "vote" ? "everyone" : settings.whoCanAddSongs}
        options={[
          { value: "host", label: "Host & DJs" },
          { value: "everyone", label: "Everyone" },
        ]}
        onChange={(value) => save({ settings: { whoCanAddSongs: value } })}
      />
      <Choice
        label="Karaoke mics open at once"
        value={String(settings.maxSingers)}
        options={Array.from({ length: MAX_ROOM_SINGERS }, (_, i) => ({ value: String(i + 1), label: `${i + 1}` }))}
        onChange={(value) => save({ settings: { maxSingers: Number(value) } }, `${value} mic${value === "1" ? "" : "s"} open`)}
      />

      {room.type !== "duo" && (
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between">
            <span className="font-technical text-label-mono-sm uppercase text-outline">Max listeners</span>
            <span className="font-technical text-label-mono-md text-secondary">{maxListeners}</span>
          </span>
          <input
            type="range"
            min={2}
            max={MAX_ROOM_LISTENERS}
            value={maxListeners}
            onChange={(event) => setMaxListeners(Number(event.target.value))}
            onPointerUp={() => maxListeners !== settings.maxListeners && save({ settings: { maxListeners } }, "Capacity saved")}
            onKeyUp={() => maxListeners !== settings.maxListeners && save({ settings: { maxListeners } }, "Capacity saved")}
            className="accent-[#a078ff]"
          />
        </label>
      )}

      {room.type === "private" && (
        <section className="flex flex-col gap-sm rounded-md bg-surface-container p-sm">
          <span className="font-technical text-label-mono-sm uppercase text-outline">Private access</span>
          <div className="flex flex-wrap items-center gap-xs">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(roomShareUrl(room));
                  showToast({ icon: "link", tone: "success", title: "Invite link copied" });
                } catch {
                  showToast({ icon: "error", tone: "error", title: "Couldn't copy — use Share instead" });
                }
              }}
              className="flex items-center gap-1 rounded-full bg-surface-container-high px-sm py-1 text-body-sm text-on-surface"
            >
              <Icon name="content_copy" className="text-[16px]" /> Copy invite link
            </button>
            <button
              type="button"
              disabled={regenerate.isPending}
              onClick={() =>
                regenerate.mutate(undefined, {
                  onSuccess: () => showToast({ icon: "autorenew", tone: "success", title: "New invite link — the old one stopped working" }),
                })
              }
              className="flex items-center gap-1 rounded-full bg-surface-container-high px-sm py-1 text-body-sm text-on-surface disabled:opacity-50"
            >
              <Icon name="autorenew" className="text-[16px]" /> New link
            </button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (passcode.trim().length < 4) return;
              save({ passcode: passcode.trim() }, "Passcode saved");
              setPasscode("");
            }}
            className="flex flex-wrap items-center gap-xs"
          >
            <input
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              maxLength={32}
              autoComplete="new-password"
              placeholder={room.hasPasscode ? "New passcode (4–32)" : "Set a passcode (4–32)"}
              className="min-w-0 flex-1 rounded-md bg-surface-container-highest/60 px-sm py-1.5 text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={passcode.trim().length < 4 || update.isPending}
              className="rounded-full bg-primary-container px-sm py-1 text-body-sm text-on-primary-container disabled:opacity-40"
            >
              Save
            </button>
            {room.hasPasscode && (
              <button
                type="button"
                onClick={() => save({ passcode: null }, "Passcode removed — invite link only")}
                className="rounded-full px-sm py-1 text-body-sm text-error hover:bg-error/10"
              >
                Remove
              </button>
            )}
          </form>
          <p className="text-body-sm text-on-surface-variant">
            {room.hasPasscode ? "People with the passcode can get in without the link." : "Only people with the invite link can get in."}
          </p>
        </section>
      )}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      <span className="font-technical text-label-mono-sm uppercase text-outline">{label}</span>
      <div className="flex gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => value !== option.value && onChange(option.value)}
            className={`flex-1 rounded-md px-sm py-xs text-headline-sm transition-colors ${
              value === option.value
                ? "bg-primary-container text-on-primary-container"
                : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Badge({ tone, label }: { tone: "host" | "dj" | "muted"; label: string }) {
  const style =
    tone === "host"
      ? "bg-tertiary-container/25 text-tertiary"
      : tone === "dj"
        ? "bg-[#8B5CF6]/20 text-[#c4b5fd]"
        : "bg-error/15 text-error";
  return <span className={`font-technical rounded-full px-1.5 py-0.5 text-label-mono-sm uppercase ${style}`}>{label}</span>;
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  title,
  tone = "neutral",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: "neutral" | "danger" | "primary";
}) {
  const style =
    tone === "danger"
      ? "text-error hover:bg-error/10"
      : tone === "primary"
        ? "bg-primary-container text-on-primary-container"
        : "text-on-surface-variant hover:bg-white/[0.08] hover:text-on-surface";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`flex items-center gap-1 rounded-full px-sm py-1 text-body-sm font-medium transition-colors disabled:opacity-40 ${style}`}
    >
      <Icon name={icon} className="text-[16px]" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
