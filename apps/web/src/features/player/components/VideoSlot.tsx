"use client";

import { useEffect, useRef } from "react";
import { useVideoSlotStore, type VideoSlotKind } from "../stores/video-slot-store";

/** An empty box the shared YouTube player is laid over (see PlayerHost). */
export function VideoSlot({ kind, className = "" }: { kind: VideoSlotKind; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const register = useVideoSlotStore((s) => s.register);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return register({ element, kind });
  }, [kind, register]);

  return <div ref={ref} className={className} />;
}
