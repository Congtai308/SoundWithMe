"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Room, RoomSettings } from "@soundwithme/types";
import {
  createRoomSchema,
  DEFAULT_ROOM_SINGERS,
  DUO_MAX_LISTENERS,
  MAX_ROOM_LISTENERS,
  MAX_ROOM_SINGERS,
  type CreateRoomInput,
} from "@soundwithme/validation";
import { ApiClientError } from "@/services/api-client";
import { Icon } from "@/components/ui/Icon";
import { useCreateRoom } from "../hooks/use-rooms";

interface RoomTypeOption {
  value: CreateRoomInput["type"];
  label: string;
  icon: string;
  hint: string;
}

const ROOM_TYPES: RoomTypeOption[] = [
  { value: "public", label: "Public Space", icon: "public", hint: "Listed in Live Rooms — anyone can join." },
  { value: "duo", label: "1-on-1 Duo", icon: "group", hint: "You and one other listener, by link." },
  { value: "friends", label: "Friends Only", icon: "diversity_3", hint: "Only your friends can join; they get notified." },
  { value: "private", label: "Secret & Passcode", icon: "lock", hint: "Hidden. Invite link only, plus an optional passcode." },
];

const CONTROL_OPTIONS: { value: RoomSettings["whoCanControlPlayback"]; label: string; icon: string }[] = [
  { value: "host", label: "Host & DJs", icon: "lock" },
  { value: "everyone", label: "Everyone", icon: "group" },
];

const QUEUE_OPTIONS: { value: RoomSettings["whoCanAddSongs"]; label: string }[] = [
  { value: "host", label: "Host & DJs" },
  { value: "everyone", label: "Everyone" },
];

const DEFAULT_MAX_LISTENERS = 50;
const SINGER_CHOICES = Array.from({ length: MAX_ROOM_SINGERS }, (_, i) => i + 1);

const labelClass = "font-technical text-label-mono-sm uppercase text-outline";

export function CreateRoomForm({ onCreated }: { onCreated: (room: Room) => void }) {
  const createRoom = useCreateRoom();
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateRoomInput>({
    resolver: zodResolver(createRoomSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "public",
      settings: {
        whoCanControlPlayback: "host",
        whoCanAddSongs: "everyone",
        chatEnabled: true,
        reactionsEnabled: true,
        maxListeners: DEFAULT_MAX_LISTENERS,
        maxSingers: DEFAULT_ROOM_SINGERS,
      },
    },
  });

  const roomType = watch("type");

  const onSubmit = (data: CreateRoomInput) => {
    const description = data.description?.trim();
    createRoom.mutate(
      { ...data, description: description ? description : undefined },
      { onSuccess: ({ room }) => onCreated(room) },
    );
  };

  const error = createRoom.error;
  const hostedRoomId = error instanceof ApiClientError ? error.details.roomId : undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid grid-cols-1 gap-xl md:grid-cols-12">
      <div className="flex flex-col gap-lg md:col-span-7">
        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-xs rounded-md bg-error-container/40 px-md py-sm text-body-sm text-on-error-container">
            <Icon name="error" className="text-[18px]" />
            <span className="flex-1">
              {error instanceof ApiClientError
                ? error.code === "RATE_LIMITED"
                  ? "You've opened a lot of rooms in a short time — wait a few minutes and try again."
                  : error.message
                : "Couldn't create the room. Try again."}
            </span>
            {typeof hostedRoomId === "string" && (
              <Link href={`/room/${hostedRoomId}`} className="rounded-full bg-white/10 px-sm py-0.5 font-semibold hover:bg-white/20">
                Open my room
              </Link>
            )}
          </div>
        )}

        <div className="flex flex-col gap-sm">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Room identity &amp; title</span>
            <span className="relative flex items-center">
              <input
                type="text"
                placeholder="Name your chamber…"
                maxLength={80}
                aria-invalid={errors.name ? true : undefined}
                className={`w-full rounded-md bg-surface-container-highest/60 px-md py-sm pr-10 text-headline-sm text-on-surface shadow-inner placeholder:text-outline focus:bg-surface-container focus:outline-none focus:ring-1 focus:ring-primary-container ${
                  errors.name ? "ring-1 ring-error" : ""
                }`}
                {...register("name")}
              />
              <Icon name="radio" className="absolute right-3 text-[20px] text-secondary" />
            </span>
            {errors.name && <span className="text-body-sm text-error">{errors.name.message}</span>}
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Atmospheric brief / description</span>
            <textarea
              rows={2}
              maxLength={500}
              placeholder="What's the vibe tonight?"
              className="w-full resize-none rounded-md bg-surface-container-highest/60 px-md py-sm text-body-md text-on-surface shadow-inner placeholder:text-outline focus:bg-surface-container focus:outline-none focus:ring-1 focus:ring-primary-container"
              {...register("description")}
            />
            {errors.description && <span className="text-body-sm text-error">{errors.description.message}</span>}
          </label>
        </div>

        <fieldset className="flex flex-col gap-xs">
          <legend className={`${labelClass} mb-xs`}>Access tier &amp; broadcast scope</legend>
          <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
            {ROOM_TYPES.map((option) => {
              const selected = roomType === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-sm rounded-md p-sm transition-colors ${
                    selected ? "bg-primary-container/15 shadow-sm ring-1 ring-primary-container/50" : "bg-surface-container hover:bg-surface-container-high"
                  }`}
                >
                  <input
                    type="radio"
                    value={option.value}
                    className="sr-only"
                    {...register("type", {
                      onChange: () => {
                        setValue("settings.maxListeners", option.value === "duo" ? DUO_MAX_LISTENERS : DEFAULT_MAX_LISTENERS);
                        if (option.value !== "private") setValue("passcode", undefined);
                      },
                    })}
                  />
                  <Icon name={option.icon} className={`mt-0.5 text-[20px] ${selected ? "text-primary" : "text-outline"}`} />
                  <span className="flex flex-col">
                    <span className={`text-headline-sm ${selected ? "text-primary" : "text-on-surface"}`}>{option.label}</span>
                    <span className="text-body-sm text-on-surface-variant">{option.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {roomType === "private" && (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Passcode (optional)</span>
            <input
              type="text"
              autoComplete="off"
              maxLength={32}
              placeholder="4–32 characters — leave empty for invite link only"
              aria-invalid={errors.passcode ? true : undefined}
              className={`w-full rounded-md bg-surface-container-highest/60 px-md py-sm text-body-md text-on-surface shadow-inner placeholder:text-outline focus:bg-surface-container focus:outline-none focus:ring-1 focus:ring-primary-container ${
                errors.passcode ? "ring-1 ring-error" : ""
              }`}
              {...register("passcode", { setValueAs: (value: string) => (value.trim() === "" ? undefined : value) })}
            />
            {errors.passcode ? (
              <span className="text-body-sm text-error">{errors.passcode.message}</span>
            ) : (
              <span className="text-body-sm text-on-surface-variant">
                With a passcode, people who know it can get in without the invite link.
              </span>
            )}
          </label>
        )}

        <RoomRules />
      </div>

      <div className="flex flex-col justify-between gap-lg rounded-lg bg-surface-container p-lg md:col-span-5">
        <div className="flex flex-col gap-md">
          <div className="flex items-center justify-between">
            <span className="text-headline-sm text-on-surface">Session Permissions</span>
            <span className="font-technical rounded-full bg-secondary-container/20 px-2 py-0.5 text-label-mono-sm text-secondary">
              Server enforced
            </span>
          </div>

          <Controller
            control={control}
            name="settings.whoCanControlPlayback"
            render={({ field }) => (
              <Segmented label="Who can control playback?" columns={2}>
                {CONTROL_OPTIONS.map((option) => (
                  <SegmentButton key={option.value} selected={field.value === option.value} onClick={() => field.onChange(option.value)}>
                    <Icon name={option.icon} className="text-[16px]" /> {option.label}
                  </SegmentButton>
                ))}
              </Segmented>
            )}
          />

          <Controller
            control={control}
            name="settings.whoCanAddSongs"
            render={({ field }) => (
              <Segmented label="Who can queue tracks?" columns={2}>
                {QUEUE_OPTIONS.map((option) => (
                  <SegmentButton key={option.value} selected={field.value === option.value} onClick={() => field.onChange(option.value)}>
                    {option.label}
                  </SegmentButton>
                ))}
              </Segmented>
            )}
          />

          <Controller
            control={control}
            name="settings.maxSingers"
            render={({ field }) => (
              <Segmented label="Karaoke mics open at once" columns={4}>
                {SINGER_CHOICES.map((count) => (
                  <SegmentButton key={count} selected={field.value === count} onClick={() => field.onChange(count)}>
                    <Icon name="mic" className="text-[16px]" /> {count}
                  </SegmentButton>
                ))}
              </Segmented>
            )}
          />

          <div className="flex flex-col gap-sm pt-xs">
            <Controller
              control={control}
              name="settings.chatEnabled"
              render={({ field }) => (
                <Toggle icon="chat" label="Enable live chat" checked={field.value ?? true} onChange={field.onChange} />
              )}
            />
            <Controller
              control={control}
              name="settings.reactionsEnabled"
              render={({ field }) => (
                <Toggle icon="add_reaction" label="Allow live reactions" checked={field.value ?? true} onChange={field.onChange} />
              )}
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between">
              <span className={labelClass}>Max listeners</span>
              <span className="font-technical text-label-mono-md text-secondary">{watch("settings.maxListeners")}</span>
            </span>
            <input
              type="range"
              min={2}
              max={MAX_ROOM_LISTENERS}
              // Not `disabled`: react-hook-form drops disabled fields, and a duo
              // room must still submit its fixed capacity of 2.
              aria-disabled={roomType === "duo"}
              tabIndex={roomType === "duo" ? -1 : undefined}
              className={`accent-[#a078ff] ${roomType === "duo" ? "pointer-events-none opacity-50" : ""}`}
              {...register("settings.maxListeners", { valueAsNumber: true })}
            />
            {errors.settings?.maxListeners && (
              <span className="text-body-sm text-error">{errors.settings.maxListeners.message}</span>
            )}
          </label>
        </div>

        <div className="flex flex-col gap-sm">
          <button
            type="submit"
            disabled={createRoom.isPending}
            className="flex w-full items-center justify-center gap-xs rounded-full bg-primary-container px-md py-sm text-headline-sm text-on-primary-container shadow-[0_0_24px_rgba(160,120,255,0.35)] transition-all active:scale-[0.96] disabled:opacity-60 disabled:shadow-none"
          >
            <Icon name="podcasts" className="text-[20px]" />
            {createRoom.isPending ? "Opening the stage…" : "Go Live"}
          </button>
          <Link href="/rooms" className="text-center text-body-sm text-on-surface-variant hover:text-on-surface">
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}

/** The house rules, so nothing about rooms comes as a surprise. */
function RoomRules() {
  const rules: { icon: string; text: string }[] = [
    { icon: "looks_one", text: "You can host one live room at a time — end it (or hand it to someone) to start another." },
    { icon: "timer", text: "A room with nobody in it for 30 minutes ends by itself." },
    { icon: "shield_person", text: "As host you can make DJs, hand the room over, mute chat or remove people (they can't come back)." },
    { icon: "how_to_vote", text: "Listeners vote songs up or down in the queue, and can vote together to skip the current one." },
  ];
  return (
    <section aria-label="Room rules" className="flex flex-col gap-xs rounded-md bg-surface-container p-sm">
      <span className={labelClass}>Room rules</span>
      <ul className="flex flex-col gap-1.5">
        {rules.map((rule) => (
          <li key={rule.icon} className="flex items-start gap-xs text-body-sm text-on-surface-variant">
            <Icon name={rule.icon} className="mt-0.5 text-[16px] text-secondary" />
            {rule.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Segmented({ label, columns, children }: { label: string; columns: 2 | 3 | 4; children: ReactNode }) {
  const grid = columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-4";
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      <div className={`grid gap-1.5 ${grid}`}>{children}</div>
    </div>
  );
}

function SegmentButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-md px-sm py-xs text-headline-sm transition-colors ${
        selected
          ? "bg-primary-container text-on-primary-container shadow-sm"
          : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
      }`}
    >
      {children}
    </button>
  );
}

export function Toggle({
  icon,
  label,
  checked,
  onChange,
  disabled = false,
}: {
  icon: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-sm text-left disabled:opacity-50"
    >
      <span className="flex items-center gap-sm text-body-md text-on-surface">
        <Icon name={icon} className="text-[20px] text-primary" />
        {label}
      </span>
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-primary-container" : "bg-surface-variant"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-on-surface shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
        />
      </span>
    </button>
  );
}
