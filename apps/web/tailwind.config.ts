import type { Config } from "tailwindcss";
import { colors, spacing, radius, breakpoints } from "@soundwithme/ui";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    screens: {
      sm: `${breakpoints.tablet}px`,
      md: `${breakpoints.desktop}px`,
      lg: `${breakpoints.largeDesktop}px`,
    },
    extend: {
      colors: {
        background: colors.background,
        surface: colors.surface,
        "surface-elevated": colors.surfaceElevated,
        border: colors.border,
        "text-primary": colors.textPrimary,
        "text-secondary": colors.textSecondary,
        "text-muted": colors.textMuted,
        "accent-primary": colors.accentPrimary,
        "accent-live": colors.accentLive,
        "accent-warm": colors.accentWarm,
        danger: colors.danger,
        success: colors.success,
      },
      spacing: Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [key, `${value}px`]),
      ),
      borderRadius: Object.fromEntries(
        Object.entries(radius).map(([key, value]) => [
          key,
          typeof value === "number" ? `${value}px` : value,
        ]),
      ),
    },
  },
  plugins: [],
};

export default config;
