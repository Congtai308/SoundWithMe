# Realtime layer

`adapters/` is populated now (Socket.IO Redis adapter — infra wiring only).

`gateways/`, `events/`, and `guards/` are intentionally **empty** at this
bootstrap stage. Per the project rules (Master Prompt §45 — no placeholder
implementation), we do not scaffold fake gateway/guard files ahead of the
features that give them real behavior.

They get populated alongside the modules that need them, in this order:

1. `auth` module → `guards/ws-auth.guard.ts` (verifies the socket's session)
2. `rooms` + `room-members` → `gateways/room.gateway.ts`, `events/room.events.ts`
3. `playback` → `events/playback.events.ts` (PLAY/PAUSE/SEEK/NEXT/CHANGE_TRACK)
4. `queue` → `events/queue.events.ts`
5. `chat` → `gateways/chat.gateway.ts`, `events/chat.events.ts`
6. `reactions` → folded into `events/reaction.events.ts`

Event name constants already exist in `@soundwithme/constants` and payload
types in `@soundwithme/realtime-contracts` — gateways should import from
there rather than redefining event names/shapes locally.
