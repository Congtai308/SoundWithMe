/**
 * The top bar's controls share one shape: 40px tall pills with a hairline
 * frame, so search, chips, icon buttons and room actions line up.
 */
const base =
  "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border text-body-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60";

/** A labelled button or link (an icon and/or text). */
export const barButtonClass = `${base} border-white/[0.1] bg-white/[0.04] px-3.5 text-on-surface-variant hover:border-primary/40 hover:bg-primary/10 hover:text-on-surface`;

/** The same, switched on (a selected chip, an enabled toggle). */
export const barButtonActiveClass = `${base} border-primary/50 bg-primary/15 px-3.5 text-on-surface shadow-[0_0_16px_rgba(160,120,255,0.18)]`;

/** A square-ish icon-only button. */
export const barIconButtonClass = `${base} w-10 border-white/[0.1] bg-white/[0.04] text-on-surface-variant hover:border-primary/40 hover:bg-primary/10 hover:text-on-surface`;

/** Leaving or ending something. */
export const barDangerButtonClass = `${base} border-error/25 bg-error/[0.06] px-3.5 text-error/90 hover:border-error/50 hover:bg-error/15 hover:text-error`;
