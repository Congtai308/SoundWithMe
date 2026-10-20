"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Places in the top bar a page can fill — the listening room puts its title and actions there. */
export type TopNavSlotName = "start" | "end";

const slotId = (name: TopNavSlotName) => `topnav-slot-${name}`;

/** Rendered by TopNav where page content may appear. Empty slots take no space. */
export function TopNavSlotTarget({ name, className = "" }: { name: TopNavSlotName; className?: string }) {
  return <div id={slotId(name)} className={`empty:hidden ${className}`} />;
}

/** Renders `children` into the TopNav slot (after mount, once the slot exists). */
export function TopNavSlot({ name, children }: { name: TopNavSlotName; children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.getElementById(slotId(name))), [name]);
  return target ? createPortal(children, target) : null;
}
