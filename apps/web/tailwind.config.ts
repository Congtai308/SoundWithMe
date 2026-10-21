import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { colors, palette, spacing, radius, breakpoints, typography } from "@soundwithme/ui";

const toKebab = (value: string): string => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

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
        // Stitch / Material-3 roles: bg-surface-container-low, text-on-surface, ...
        ...Object.fromEntries(
          Object.entries(palette)
            .filter(([key]) => key !== "surface")
            .map(([key, value]) => [toKebab(key), value]),
        ),
        background: colors.background,
        surface: colors.surface,
        "surface-elevated": colors.surfaceElevated,
        border: colors.border,
        "border-highlight": colors.borderHighlight,
        "text-primary": colors.textPrimary,
        "text-secondary": colors.textSecondary,
        "text-muted": colors.textMuted,
        "accent-primary": colors.accentPrimary,
        "accent-live": colors.accentLive,
        "accent-warm": colors.accentWarm,
        danger: colors.danger,
        success: colors.success,
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
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
      fontSize: Object.fromEntries(
        Object.entries(typography.scale).map(([key, value]) => {
          const style: { size: number; lineHeight: number; weight: number; letterSpacing?: string } =
            value;
          const options: { lineHeight: string; fontWeight: string; letterSpacing?: string } = {
            lineHeight: `${style.lineHeight}px`,
            fontWeight: String(style.weight),
          };
          if (style.letterSpacing) options.letterSpacing = style.letterSpacing;
          return [key, [`${style.size}px`, options]] as const;
        }),
      ),
    },
  },
  plugins: [
    // `undock:` = desktop with the nav sidebar hidden by the user (see sidebar-store).
    plugin(({ addVariant }) => {
      addVariant("undock", `@media (min-width: ${breakpoints.desktop}px) { html[data-sidebar="collapsed"] & }`);
    }),
  ],
};

export default config;
