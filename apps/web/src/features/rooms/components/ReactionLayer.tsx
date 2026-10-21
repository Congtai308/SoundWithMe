"use client";

import { useRoomLiveStore } from "../stores/room-live-store";

/** Spreads bubbles across the stage deterministically per reaction. */
function horizontalOffset(key: number): number {
  return 12 + ((key * 37) % 76);
}

/** Buoyant reaction bubbles rising over the stage; purely decorative for screen readers. */
export function ReactionLayer() {
  const reactions = useRoomLiveStore((s) => s.reactions);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 top-0 z-[21] overflow-hidden">
      {reactions.map((reaction) => (
        <span
          key={reaction.key}
          className="reaction-rise absolute bottom-md flex items-center gap-1 rounded-full border border-[rgba(244,63,94,0.3)] bg-[rgba(18,24,38,0.85)] py-1 pl-1 pr-2 shadow-lg backdrop-blur-md motion-reduce:hidden"
          style={{ left: `${horizontalOffset(reaction.key)}%` }}
        >
          <span className="text-[22px] leading-none">{reaction.emoji}</span>
          <span className="max-w-[80px] truncate text-[11px] font-medium text-on-surface-variant">
            {reaction.displayName}
          </span>
        </span>
      ))}
    </div>
  );
}
