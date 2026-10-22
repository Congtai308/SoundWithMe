"use client";

import Link from "next/link";
import { create } from "zustand";
import { Icon } from "./Icon";

export interface Toast {
  id: number;
  icon: string;
  title: string;
  body?: string;
  /** In-app link the toast opens. */
  href?: string | null;
  tone?: "info" | "success" | "error";
}

const TOAST_MS = 6_000;
const MAX_TOASTS = 3;
let nextId = 1;

interface ToastStore {
  toasts: Toast[];
  show: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

/** App-wide toasts: notifications, "your turn to sing", quick confirmations. */
export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (toast) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { ...toast, id }].slice(-MAX_TOASTS) });
    window.setTimeout(() => get().dismiss(id), TOAST_MS);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function showToast(toast: Omit<Toast, "id">): void {
  useToasts.getState().show(toast);
}

const TONE: Record<NonNullable<Toast["tone"]>, string> = {
  info: "text-primary",
  success: "text-[#4ade80]",
  error: "text-error",
};

/** Bottom-right on desktop, above the tab bar on phones. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-24 right-md z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-xs sm:bottom-md"
    >
      {toasts.map((toast) => {
        const content = (
          <>
            <Icon name={toast.icon} className={`mt-0.5 text-[20px] ${TONE[toast.tone ?? "info"]}`} filled />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-body-md font-semibold text-on-surface">{toast.title}</span>
              {toast.body && <span className="text-body-sm text-on-surface-variant">{toast.body}</span>}
            </span>
          </>
        );
        const shell =
          "pointer-events-auto flex items-start gap-sm rounded-md border border-white/[0.14] bg-[rgba(30,41,59,0.94)] p-sm text-left shadow-[0_12px_36px_-4px_rgba(0,0,0,0.65)] backdrop-blur-xl";
        return (
          <div key={toast.id} role="status" className="relative">
            {toast.href ? (
              <Link href={toast.href} onClick={() => dismiss(toast.id)} className={`${shell} pr-9 hover:border-white/[0.24]`}>
                {content}
              </Link>
            ) : (
              <div className={`${shell} pr-9`}>{content}</div>
            )}
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Đóng"
              className="pointer-events-auto absolute right-1.5 top-1.5 rounded-full p-1 text-outline hover:text-on-surface"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
