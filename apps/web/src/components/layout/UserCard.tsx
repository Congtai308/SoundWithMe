"use client";

import Link from "next/link";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { AccountMenu } from "./AccountMenu";

export function UserCard() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="p-xs md:p-md">
        <div className="h-[52px] animate-pulse rounded-lg bg-surface-container-low" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-xs md:p-md">
        <Link
          href="/login"
          title="Đăng nhập"
          className="flex items-center justify-center gap-xs rounded-lg bg-surface-container-low px-sm py-sm text-headline-sm text-on-surface transition-colors hover:bg-surface-container"
        >
          <Icon name="login" className="text-[20px]" />
          <span className="hidden md:inline">Đăng nhập</span>
        </Link>
      </div>
    );
  }

  return (
    <AccountMenu
      placement="above"
      className="p-xs md:p-md"
      triggerClassName="flex w-full items-center justify-center rounded-lg bg-surface-container-low p-xs text-left transition-colors hover:bg-surface-container md:justify-between"
      trigger={
        <>
          <span className="flex min-w-0 items-center gap-xs">
            <Avatar name={user.displayName} src={user.avatarUrl} size={36} online />
            <span className="hidden min-w-0 md:block">
              <span className="block truncate text-headline-sm text-on-surface">
                {user.displayName}
              </span>
              <span className="block truncate text-body-sm text-on-surface-variant">
                {user.isGuest ? "Tài khoản khách" : `@${user.username}`}
              </span>
            </span>
          </span>
          <Icon name="settings" className="hidden text-[20px] text-outline md:inline-block" />
        </>
      }
    />
  );
}
