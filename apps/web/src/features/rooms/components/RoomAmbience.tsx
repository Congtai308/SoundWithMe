"use client";

import { useEffect } from "react";
import { useRoomEffects } from "../stores/room-effects";
import { SakuraFall } from "./SakuraFall";

/**
 * Soft colour glows drifting behind everything — the room's dreamy haze.
 * Radial gradients are soft already; a CSS blur filter on moving elements
 * would cost every frame (and the lyrics animate every frame).
 */
const GLOWS = [
  {
    className:
      "left-[-15%] top-[-25%] h-[80vh] w-[80vh] bg-[radial-gradient(circle,rgba(139,92,246,0.32),transparent_65%)]",
    duration: 28,
    delay: 0,
  },
  {
    className:
      "right-[-15%] top-[10%] h-[75vh] w-[75vh] bg-[radial-gradient(circle,rgba(236,72,153,0.24),transparent_65%)]",
    duration: 34,
    delay: -9,
  },
  {
    className:
      "bottom-[-35%] left-[25%] h-[85vh] w-[85vh] bg-[radial-gradient(circle,rgba(34,211,238,0.16),transparent_65%)]",
    duration: 40,
    delay: -17,
  },
];

/**
 * The room's backdrop: the current song's artwork, heavily blurred, slow
 * colour glows, plus cherry blossoms falling over everything (SakuraFall).
 * Decorative only — hidden from screen readers. With effects off (the
 * default on phones and low-power devices, or the header toggle) only the
 * static artwork stays: nothing moves, so nothing recomposites per frame.
 *
 * Page content after this must be positioned (`relative`) to paint above it.
 */
export function RoomAmbience({ artworkUrl }: { artworkUrl: string | null }) {
  const enabled = useRoomEffects((s) => s.enabled);
  const hydrate = useRoomEffects((s) => s.hydrate);
  useEffect(hydrate, [hydrate]);

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        {artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- artwork comes from provider CDNs
          <img
            src={artworkUrl}
            alt=""
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-[90px] saturate-150"
          />
        ) : (
          <div className="absolute -top-24 left-1/3 h-96 w-96 rounded-full bg-primary-container/10 blur-[120px]" />
        )}
        {enabled &&
          GLOWS.map((glow, i) => (
            <div
              key={i}
              className={`ambience-drift absolute rounded-full will-change-transform ${glow.className}`}
              style={{
                animationDuration: `${glow.duration}s`,
                animationDelay: `${glow.delay}s`,
              }}
            />
          ))}
        {/* One layer for the shade and the vignette (keeps the edges dark so the centre feels lit). */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%),linear-gradient(to_bottom,rgba(18,19,24,0.6),rgba(18,19,24,0.25),rgba(18,19,24,0.7))]" />
      </div>
      {enabled && <SakuraFall />}
    </>
  );
}
