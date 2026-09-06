/**
 * Design tokens as plain values (Architecture Review §12 / §13).
 * Kept framework-agnostic so both the Tailwind config (web) and a future
 * React Native theme (mobile) can consume the same source values.
 *
 * These are a *starting* palette derived from the product docs' direction
 * (dark, premium, immersive, warm accents used sparingly) — treat as a first
 * pass to refine visually once real screens are being designed, not a final
 * locked brand system.
 */
export const colors = {
  background: "#0A0A0F", // near-black, slightly cool
  surface: "#14141C", // card/panel background
  surfaceElevated: "#1C1C27", // modal/popover background
  border: "#2A2A38",
  textPrimary: "#F5F5F7",
  textSecondary: "#A0A0AE",
  textMuted: "#6B6B7A",
  accentPrimary: "#8B5CF6", // electric purple — primary accent, used sparingly
  accentLive: "#22D3EE", // cyan — "live"/active-room indicator only
  accentWarm: "#EC4899", // pink — reserved for reactions/highlights only
  danger: "#F43F5E",
  success: "#34D399",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  full: 9999,
} as const;

export const typography = {
  fontFamily: {
    // Placeholder — final typeface is a design decision to make when
    // building real screens (see frontend-design skill guidance).
    sans: "var(--font-sans, system-ui, sans-serif)",
  },
  scale: {
    display: { size: 40, lineHeight: 48, weight: 700 },
    h1: { size: 28, lineHeight: 36, weight: 700 },
    h2: { size: 22, lineHeight: 30, weight: 600 },
    body: { size: 16, lineHeight: 24, weight: 400 },
    caption: { size: 13, lineHeight: 18, weight: 400 },
  },
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
