"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLogout } from "@/features/auth/hooks/use-auth";
import { Icon } from "@/components/ui/Icon";

/** Account popover (Level-3 floating surface) shared by the sidebar card and the mobile top bar. */
export function AccountMenu({
  trigger,
  placement,
  triggerClassName,
  className = "",
}: {
  trigger: ReactNode;
  placement: "above" | "below";
  triggerClassName: string;
  className?: string;
}) {
  const router = useRouter();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {open && (
        <div
          role="menu"
          className={`absolute z-50 min-w-[180px] overflow-hidden rounded-md border border-white/[0.16] bg-[rgba(30,41,59,0.85)] p-1 shadow-[0_12px_36px_-4px_rgba(0,0,0,0.65),0_0_24px_-2px_rgba(139,92,246,0.12)] backdrop-blur-[32px] ${
            placement === "above" ? "bottom-full left-0 mb-xs" : "right-0 top-full mt-xs"
          }`}
        >
          <button
            type="button"
            role="menuitem"
            disabled={logout.isPending}
            onClick={() =>
              logout.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false);
                  router.push("/login");
                },
              })
            }
            className="flex w-full items-center gap-sm rounded-sm px-sm py-xs text-body-md text-on-surface hover:bg-white/[0.06] disabled:opacity-50"
          >
            <Icon name="logout" className="text-[18px]" />
            {logout.isPending ? "Signing out…" : "Sign out"}
          </button>
          {logout.isError && (
            <p className="px-sm pb-xs text-body-sm text-error">Couldn&apos;t sign out. Try again.</p>
          )}
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={triggerClassName}
      >
        {trigger}
      </button>
    </div>
  );
}
