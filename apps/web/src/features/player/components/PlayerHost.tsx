"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Icon } from "@/components/ui/Icon";
import { usePlayerStore } from "../stores/player-store";
import { activeSlot, useVideoSlotStore } from "../stores/video-slot-store";

/** After a scroll/resize/transition starts, keep following the slot every frame this long. */
const FOLLOW_AFTER_CHANGE_MS = 700;
/** Safety net for moves no event announces (content above the slot changing height). */
const POLL_MS = 250;

/** Ancestors that can clip the slot (scroll containers), so the overlay is clipped the same way. */
function clippingAncestors(element: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (overflowX !== "visible" || overflowY !== "visible") result.push(node);
  }
  return result;
}

/**
 * The single, never-moved home of the embedded YouTube player. It is fixed
 * to the viewport and follows the active VideoSlot's box, so
 * switching between the room stage and the mini player never reloads the
 * video. It sits at z-20: anything a page wants above the video (badges,
 * reactions) uses z-[21]+ and must not be inside a stacking context.
 */
export function PlayerHost({
  containerRef,
  onUnlock,
}: {
  containerRef: RefObject<HTMLDivElement>;
  onUnlock: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const slot = useVideoSlotStore((s) => activeSlot(s.slots));
  const hasTrack = usePlayerStore((s) => Boolean(s.serverState));
  const needsUserGesture = usePlayerStore((s) => s.needsUserGesture);
  const tapVideoToStart = usePlayerStore((s) => s.tapVideoToStart);
  const engineError = usePlayerStore((s) => s.engineError);
  const isBuffering = usePlayerStore((s) => s.isBuffering);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!slot) {
      host.style.visibility = "hidden";
      return;
    }

    const clippers = clippingAncestors(slot.element);
    host.style.borderRadius = getComputedStyle(slot.element).borderRadius;
    let last = "";
    let frame = 0;
    let followUntil = 0;

    const measure = () => {
      const r = slot.element.getBoundingClientRect();
      let top = r.top;
      let left = r.left;
      let right = r.right;
      let bottom = r.bottom;
      for (const clipper of clippers) {
        const c = clipper.getBoundingClientRect();
        top = Math.max(top, c.top);
        left = Math.max(left, c.left);
        right = Math.min(right, c.right);
        bottom = Math.min(bottom, c.bottom);
      }
      const visible = r.width > 0 && r.height > 0 && right > left && bottom > top;
      const next = `${r.left}|${r.top}|${r.width}|${r.height}|${top}|${left}|${right}|${bottom}|${visible}`;
      if (next !== last) {
        last = next;
        host.style.visibility = visible ? "visible" : "hidden";
        host.style.transform = `translate(${r.left}px, ${r.top}px)`;
        host.style.width = `${r.width}px`;
        host.style.height = `${r.height}px`;
        host.style.clipPath = `inset(${top - r.top}px ${r.right - right}px ${r.bottom - bottom}px ${left - r.left}px round ${host.style.borderRadius})`;
      }
    };

    // Measuring forces a style + layout pass, and the lyrics restyle every
    // frame — so measuring every frame cost more than anything else in the
    // room. Follow frame by frame only while something moves (scroll,
    // resize, a transition or animation), plus a slow poll for the rest.
    const tick = () => {
      measure();
      frame = performance.now() < followUntil ? requestAnimationFrame(tick) : 0;
    };
    const follow = () => {
      followUntil = performance.now() + FOLLOW_AFTER_CHANGE_MS;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    measure();
    follow();
    const poll = window.setInterval(() => {
      if (!frame) measure();
    }, POLL_MS);
    const resizes = new ResizeObserver(follow);
    resizes.observe(slot.element);
    for (const clipper of clippers) resizes.observe(clipper);
    resizes.observe(document.documentElement);
    // Only what can carry the slot along: the page or one of its containers
    // (the lyrics scroll and transition constantly, and don't).
    const onMove = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node) || target === document || target.contains(slot.element)) follow();
    };
    const moveEvents = ["scroll", "transitionrun", "animationstart"] as const;
    for (const type of moveEvents) window.addEventListener(type, onMove, { capture: true, passive: true });
    window.addEventListener("resize", follow);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(poll);
      resizes.disconnect();
      for (const type of moveEvents) window.removeEventListener(type, onMove, { capture: true });
      window.removeEventListener("resize", follow);
    };
  }, [slot]);

  return (
    <div
      ref={hostRef}
      className="fixed left-0 top-0 z-20 overflow-hidden bg-black"
      style={{ visibility: "hidden", width: 0, height: 0 }}
    >
      {/* Room controls are authoritative, so the embedded player itself isn't clickable —
          except while Safari waits for a tap on it before it allows sound. */}
      <div
        ref={containerRef}
        className={`absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full ${tapVideoToStart ? "" : "pointer-events-none"}`}
      />

      {hasTrack && engineError && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-xs bg-black/80 p-md text-center">
          <Icon name="music_off" className="text-[32px] text-error" />
          <p className="text-body-md text-on-surface">{engineError}</p>
        </div>
      )}

      {hasTrack && !engineError && tapVideoToStart && (
        <span className="pointer-events-none absolute inset-x-0 top-xs mx-auto flex w-fit items-center gap-1.5 rounded-full bg-black/70 px-md py-1 text-body-sm font-semibold text-on-surface">
          <Icon name="touch_app" className="text-[18px] text-[#f472b6]" />
          Chạm vào video để bật tiếng
        </span>
      )}

      {hasTrack && !engineError && needsUserGesture && !tapVideoToStart && (
        <button
          type="button"
          onClick={onUnlock}
          className="absolute inset-0 flex flex-col items-center justify-center gap-xs bg-black/60 text-on-surface backdrop-blur-sm"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#d946ef] shadow-[0_0_32px_rgba(139,92,246,0.5)]">
            <Icon name="headphones" className="text-[26px] text-white" />
          </span>
          <span className="text-headline-sm">Chạm để nghe cùng</span>
          <span className="px-sm text-body-sm text-on-surface-variant">Trình duyệt cần bạn bấm một lần trước khi phát tiếng</span>
        </button>
      )}

      {hasTrack && !engineError && isBuffering && !needsUserGesture && (
        <span className="absolute bottom-xs right-xs flex items-center gap-1 rounded-full bg-black/60 px-sm py-0.5 text-body-sm text-on-surface-variant backdrop-blur-md">
          <Icon name="progress_activity" className="animate-spin text-[14px]" />
          Đang tải…
        </span>
      )}
    </div>
  );
}
