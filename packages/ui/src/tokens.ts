/**
 * Design tokens as plain values (Architecture Review §12 / §13).
 * Kept framework-agnostic so both the Tailwind config (web) and a future
 * React Native theme (mobile) can consume the same source values.
 *
 * Source of truth: docs/ui/stitch_soundwithme_social_music_platform/
 * obsidian_audio_atmosphere/DESIGN.md (the "Obsidian Audio Atmosphere"
 * Stitch design system). `palette` mirrors its Material-3 colour roles 1:1
 * so Stitch screens translate directly; `colors` keeps the older semantic
 * names, now pointing at the same palette values.
 */
export const palette = {
  surface: "#121318",
  surfaceBright: "#38393f",
  surfaceContainerLowest: "#0d0e13",
  surfaceContainerLow: "#1a1b21",
  surfaceContainer: "#1e1f25",
  surfaceContainerHigh: "#292a2f",
  surfaceContainerHighest: "#34343a",
  surfaceVariant: "#34343a",
  onSurface: "#e3e1e9",
  onSurfaceVariant: "#cbc3d7",
  outline: "#958ea0",
  outlineVariant: "#494454",
  primary: "#d0bcff",
  onPrimary: "#3c0091",
  primaryContainer: "#a078ff",
  onPrimaryContainer: "#340080",
  primaryFixed: "#e9ddff",
  primaryFixedDim: "#d0bcff",
  secondary: "#4cd7f6",
  onSecondary: "#003640",
  secondaryContainer: "#03b5d3",
  onSecondaryContainer: "#00424e",
  secondaryFixed: "#acedff",
  tertiary: "#ffb2b7",
  tertiaryContainer: "#ff516a",
  onTertiaryContainer: "#5b0017",
  tertiaryFixed: "#ffdadb",
  error: "#ffb4ab",
  errorContainer: "#93000a",
  onErrorContainer: "#ffdad6",
} as const;

export const colors = {
  background: palette.surface,
  surface: palette.surfaceContainerLow,
  surfaceElevated: palette.surfaceContainerHigh,
  border: "rgba(255, 255, 255, 0.08)",
  borderHighlight: "rgba(255, 255, 255, 0.18)",
  textPrimary: palette.onSurface,
  textSecondary: palette.onSurfaceVariant,
  textMuted: palette.outline,
  accentPrimary: palette.primaryContainer, // primary actions, sync state, focus rings
  accentLive: palette.secondary, // live/sync/presence indicators only
  accentWarm: palette.tertiaryContainer, // reactions only, not general UI
  danger: palette.error,
  success: "#34D399",
} as const;

export const spacing = {
  "2xs": 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
} as const;

export const radius = {
  sm: 8, // rows, tags, tooltips
  md: 16, // cards, playlist tiles, chat modules
  lg: 24, // now-playing view, modal viewports, artwork frames
  full: 9999, // pills — play/pause, badges, reaction bubbles
} as const;

interface TypeStyle {
  size: number;
  lineHeight: number;
  weight: number;
  letterSpacing?: string;
}

export const typography = {
  fontFamily: {
    // Plus Jakarta Sans for editorial/navigational content; Space Grotesk
    // reserved for technical/numeric labels (durations, bitrates, sync
    // counters) so they don't jitter during live ticking — loaded via
    // next/font/google in apps/web/app/layout.tsx, exposed as CSS vars.
    sans: "var(--font-sans, system-ui, sans-serif)",
    mono: "var(--font-mono, ui-monospace, monospace)",
  },
  scale: {
    // Stitch type scale (DESIGN.md)
    "display-hero": { size: 48, lineHeight: 56, weight: 700, letterSpacing: "-0.03em" },
    "headline-xl": { size: 32, lineHeight: 40, weight: 700, letterSpacing: "-0.025em" },
    "headline-lg": { size: 24, lineHeight: 32, weight: 600, letterSpacing: "-0.015em" },
    "headline-md": { size: 20, lineHeight: 28, weight: 600, letterSpacing: "-0.01em" },
    "headline-sm": { size: 16, lineHeight: 24, weight: 600 },
    "body-lg": { size: 16, lineHeight: 24, weight: 400, letterSpacing: "-0.005em" },
    "body-md": { size: 14, lineHeight: 20, weight: 400 },
    "body-sm": { size: 12, lineHeight: 16, weight: 400, letterSpacing: "0.01em" },
    "label-mono-md": { size: 13, lineHeight: 18, weight: 500, letterSpacing: "0.03em" },
    "label-mono-sm": { size: 11, lineHeight: 14, weight: 600, letterSpacing: "0.06em" },
    // Legacy aliases still used by older screens
    display: { size: 48, lineHeight: 56, weight: 700 },
    h1: { size: 32, lineHeight: 40, weight: 700 },
    h2: { size: 24, lineHeight: 32, weight: 600 },
    body: { size: 14, lineHeight: 20, weight: 400 },
    caption: { size: 12, lineHeight: 16, weight: 400 },
    label: { size: 11, lineHeight: 14, weight: 600 },
  } satisfies Record<string, TypeStyle>,
} as const;

export const breakpoints = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  largeDesktop: 1440,
} as const;

export const zIndex = {
  base: 0,
  stickyPlayer: 10,
  dropdown: 20,
  modal: 30,
  toast: 40,
} as const;

export const motion = {
  fast: "120ms",
  base: "200ms",
  slow: "320ms",
  easing: "cubic-bezier(0.2, 0, 0, 1)",
} as const;
