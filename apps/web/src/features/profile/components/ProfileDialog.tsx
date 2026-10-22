"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { AuthenticatedUser } from "@soundwithme/types";
import { Dialog } from "@/components/ui/Dialog";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { useUpdateProfile } from "@/features/auth/hooks/use-auth";
import { ApiClientError } from "@/services/api-client";
import { AVATARS } from "../avatars";

/**
 * Your name and avatar (one of the singer set, or your initial). Rendered on
 * document.body: the menu that opens it can sit in the sliding sidebar, whose
 * transform would otherwise trap the fixed overlay.
 */
export function ProfileDialog({ user, onClose }: { user: AuthenticatedUser; onClose: () => void }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl ?? null);
  const update = useUpdateProfile();
  const name = displayName.trim();
  const changed = name !== user.displayName || avatarUrl !== (user.avatarUrl ?? null);

  return createPortal(
    <Dialog title="Hồ sơ của bạn" onClose={onClose} wide>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!name || !changed) return;
          update.mutate(
            {
              ...(name !== user.displayName ? { displayName: name } : {}),
              ...(avatarUrl !== (user.avatarUrl ?? null) ? { avatarUrl } : {}),
            },
            { onSuccess: onClose },
          );
        }}
        className="flex flex-col gap-md"
      >
        <div className="flex items-center gap-md">
          <Avatar name={name || user.displayName} src={avatarUrl} size={72} />
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-technical text-label-mono-sm uppercase text-outline">Tên hiển thị</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={50}
              className="w-full rounded-md bg-surface-container-highest/60 px-md py-sm text-body-md text-on-surface shadow-inner focus:outline-none focus:ring-1 focus:ring-primary-container"
            />
          </label>
        </div>

        <fieldset className="flex flex-col gap-xs">
          <legend className="font-technical mb-xs text-label-mono-sm uppercase text-outline">Chọn avatar ca sĩ</legend>
          <div className="grid grid-cols-4 gap-sm sm:grid-cols-6">
            {AVATARS.map((avatar) => {
              const selected = avatarUrl === avatar.url;
              return (
                <button
                  key={avatar.id}
                  type="button"
                  aria-pressed={selected}
                  title={avatar.name}
                  onClick={() => setAvatarUrl(avatar.url)}
                  className={`group flex flex-col items-center gap-1 rounded-lg p-1 transition-colors ${
                    selected ? "bg-primary-container/25 ring-2 ring-primary" : "hover:bg-white/[0.06]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- small local SVGs */}
                  <img src={avatar.url} alt="" width={64} height={64} className="h-16 w-16 transition-transform group-hover:scale-105" />
                  <span className="line-clamp-2 text-center text-[11px] leading-tight text-on-surface-variant">{avatar.name}</span>
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={avatarUrl === null}
              title="Không dùng avatar"
              onClick={() => setAvatarUrl(null)}
              className={`flex flex-col items-center gap-1 rounded-lg p-1 transition-colors ${
                avatarUrl === null ? "bg-primary-container/25 ring-2 ring-primary" : "hover:bg-white/[0.06]"
              }`}
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-white/20 text-outline">
                <Icon name="block" className="text-[26px]" />
              </span>
              <span className="text-center text-[11px] leading-tight text-on-surface-variant">Chữ cái đầu</span>
            </button>
          </div>
        </fieldset>

        {update.isError && (
          <p role="alert" className="text-body-sm text-error">
            {update.error instanceof ApiClientError ? update.error.message : "Không lưu được. Thử lại nhé."}
          </p>
        )}

        <div className="flex justify-end gap-sm">
          <button type="button" onClick={onClose} className="rounded-full px-md py-sm text-headline-sm text-on-surface-variant hover:text-on-surface">
            Huỷ
          </button>
          <button
            type="submit"
            disabled={!name || !changed || update.isPending}
            className="rounded-full bg-primary-container px-lg py-sm text-headline-sm text-on-primary-container disabled:opacity-50"
          >
            {update.isPending ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Dialog>,
    document.body,
  );
}
