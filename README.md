# SoundWithMe

Music connects us wherever you are.

Listen to YouTube music together in real time: shared rooms with a synced
player, a voted queue, chat and reactions, karaoke with live mics, friends
and a personal library. Turborepo monorepo with a Next.js web app and a
NestJS API (MongoDB, Redis, Socket.IO).

## Status

| Area | What works |
| --- | --- |
| Accounts | Email + password (sign-up confirmed by mail), Google sign-in, guest accounts; password reset by mail; refresh-token rotation, log out / log out everywhere |
| Rooms | Public, private (invite link and/or passcode) and friends-only rooms; one live room per host; empty rooms close after 30 min |
| Hosting | Up to 5 DJs, host transfer, mute in chat, kick (a permanent ban from that room) |
| Playback | Server-authoritative synced YouTube player; queue ordered by votes; skip vote at half the listeners |
| Karaoke | 1–4 mics per room, a line for the next mic, mics rotate with each song, voice FX, WebRTC with a server relay fallback; synced lyrics (LRCLIB) |
| Social | Friends and online presence, notification bell, room invites, direct messages (text, songs, room invites) |
| Library | Favorites and playlists |
| Not yet | Mobile app (`apps/mobile`) |

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local MongoDB + Redis)

## Getting started

```bash
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local
```

Fill in `apps/api/.env`. The API won't start without `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
`YOUTUBE_API_KEY` is optional but needed for search (without it, pasted links still work through oEmbed).
`CLOUDFLARE_TURN_*` is optional (karaoke falls back to the server relay).
`SMTP_USER`/`SMTP_PASS` send account mail through Gmail (use an App Password); without them the mails, links included, are printed to the API log.

**Windows, everything at once:**

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1            # Mongo/Redis + API + web (production build) + public tunnel
powershell -ExecutionPolicy Bypass -File .\start.ps1 -Dev       # dev mode with hot reload
powershell -ExecutionPolicy Bypass -File .\start.ps1 -NoTunnel  # local only
powershell -ExecutionPolicy Bypass -File .\start.ps1 -Stop      # stop everything
```

The tunnel prints an `https://….trycloudflare.com` link for phones and other
computers (the mic needs HTTPS). It changes on every run.

**Any OS, by hand:**

```bash
docker compose up -d        # MongoDB + Redis
pnpm install
pnpm dev                    # web + api in parallel via Turborepo
```

- Web: http://localhost:3000 (it proxies `/api/v1` and `/socket.io` to the API)
- API: http://localhost:4000/api/v1
- Health: http://localhost:4000/api/v1/health. Readiness (Mongo + Redis): `/api/v1/ready`

## Deploying

The site runs as one container (web + API) on Render's free plan, with
MongoDB Atlas and Render Key Value. Step-by-step setup: [docs/DEPLOY.md](docs/DEPLOY.md).

## Verifying the setup

```bash
pnpm typecheck
pnpm lint
pnpm test        # API tests need MongoDB + Redis running
```

## Security notes

- Auth cookies are httpOnly and SameSite=Lax. They're Secure everywhere except
  localhost and the LAN. Google sign-in uses OAuth state + PKCE.
- Passwords: 10 tries per email and address per 15 minutes. Room passcodes:
  10 wrong tries per room per hour.
- Sockets close when their login session ends (logout, log out everywhere).
- Sign-up is finished from a mailed link with the password chosen at sign-up,
  and its answer is the same whether or not an email is taken.
- Google sign-in with a verified address takes over an older password
  account whose owner never proved the mailbox (its password is removed);
  other accounts just gain Google.

## Project structure

See `docs/architecture/DECISIONS.md` for the rationale. Short version:

- `apps/web`: Next.js (production runs through `apps/web/server.mjs`)
- `apps/api`: NestJS (REST under `/api/v1`, Socket.IO gateways in `src/realtime`)
- `apps/mobile`: reserved, not started
- `packages/*`: shared types, validation schemas, constants, design tokens,
  realtime event contracts
- `infrastructure/`: Dockerfiles, docker-compose for local dev
- `docs/`: architecture, API, database, realtime, product documentation
