"use client";

import { useEffect, useId, type ReactNode } from "react";
import { Icon } from "./Icon";

/** Shared modal shell (same look as the Add songs dialog): Escape and a click outside close it. */
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-md pt-[8vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[84vh] w-full flex-col overflow-hidden rounded-lg border border-white/[0.16] bg-[rgba(30,41,59,0.95)] shadow-[0_12px_36px_-4px_rgba(0,0,0,0.65),0_0_24px_-2px_rgba(139,92,246,0.12)] backdrop-blur-[32px] ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        <header className="flex items-center justify-between gap-sm px-lg pb-sm pt-lg">
          <h2 id={titleId} className="text-headline-md text-on-surface">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-outline hover:text-on-surface">
            <Icon name="close" className="text-[22px]" />
          </button>
        </header>
        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-lg pb-lg">{children}</div>
      </div>
    </div>
  );
}
