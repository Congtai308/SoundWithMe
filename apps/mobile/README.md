# SoundWithMe Mobile (React Native / Expo)

**Not started.** Per the roadmap (Master Prompt §2, Phase 4), mobile begins
after Web + API have a stable Phase 1–2 foundation.

This folder is reserved so the monorepo's shape already reflects where
mobile will live, without scaffolding a fake/empty Expo app ahead of time
(Master Prompt §45 — no placeholder implementation).

When mobile work starts, it should consume the same shared packages the
web app uses:

- `@soundwithme/types`
- `@soundwithme/validation`
- `@soundwithme/constants`
- `@soundwithme/realtime-contracts`
- `@soundwithme/ui` (design tokens only — RN components are separate from
  the web `packages/ui` primitives, but the token values are shared)

See Architecture Review §13 for the compatibility requirements this
depends on (auth must support bearer tokens, not just cookies, etc.).
