import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** Shared empty / error / signed-out panel so every data view has the same fallback look. */
export function StatePanel({
  icon,
  title,
  body,
  action,
  tone = "neutral",
}: {
  icon: string;
  title: string;
  body: string;
  action?: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className="flex flex-col items-center gap-sm rounded-lg bg-surface-container-low px-lg py-2xl text-center"
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full ${
          tone === "error" ? "bg-error-container/40 text-error" : "bg-surface-container-high text-outline"
        }`}
      >
        <Icon name={icon} className="text-[24px]" />
      </div>
      <p className="text-headline-sm text-on-surface">{title}</p>
      <p className="max-w-sm text-body-md text-on-surface-variant">{body}</p>
      {action && <div className="mt-xs">{action}</div>}
    </div>
  );
}

export const primaryPillClass =
  "inline-flex items-center gap-xs rounded-full bg-primary-container px-md py-xs text-headline-sm text-on-primary-container shadow-[0_0_16px_rgba(160,120,255,0.25)] transition-all active:scale-[0.96]";

export const ghostPillClass =
  "inline-flex items-center gap-xs rounded-full border border-white/[0.12] bg-white/[0.06] px-md py-xs text-headline-sm text-on-surface transition-colors hover:border-white/[0.18]";
