# SoundWithMe

Music connects us wherever you are.

This is the foundation bootstrap — Turborepo monorepo, shared contracts,
NestJS API skeleton (health checks, Mongo/Redis wiring, Socket.IO Redis
adapter), and a Next.js web skeleton that verifies API connectivity.
**No product features are implemented yet.** See `docs/architecture/DECISIONS.md`
for what's intentionally deferred and why.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local MongoDB + Redis)

## Getting started

```bash
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local

docker compose up -d        # starts MongoDB + Redis
pnpm install
pnpm dev                    # runs web + api in parallel via Turborepo
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1
- API health: http://localhost:4000/health
- API readiness (checks Mongo + Redis): http://localhost:4000/ready

## Verifying the setup

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Project structure

See `SOUNDWITHME_ARCHITECTURE_FLOW.md` (project docs) and
`docs/architecture/DECISIONS.md` for the full rationale. Short version:

- `apps/web` — Next.js
- `apps/api` — NestJS
- `apps/mobile` — reserved, not started (Phase 4)
- `packages/*` — shared types, validation schemas, constants, design tokens,
  realtime event contracts
- `infrastructure/` — Dockerfiles, docker-compose for local dev
- `docs/` — architecture, API, database, realtime, product documentation

## What's next

Per Master Prompt §42, the next step after this bootstrap is **Phase 1:
Authentication** — see `docs/architecture/DECISIONS.md` "Open Decisions"
for what needs to be confirmed first (auth provider, music provider).

# SoundWithMe

