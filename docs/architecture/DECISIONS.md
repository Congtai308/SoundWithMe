# Architecture Decision Records

## ADR-001: Modular monolith over microservices for MVP

**Context**: SoundWithMe needs to ship an MVP quickly while remaining able
to scale later.

**Decision**: Single NestJS application with clearly separated modules
(`modules/rooms`, `modules/playback`, etc.), not separate deployable
services.

**Alternatives**: Microservices per domain from day one.

**Trade-offs**: Slightly less deployment isolation; significantly less
operational overhead and faster iteration speed while the product is
unvalidated.

**Consequences**: Module boundaries must still be respected in code
(no reaching into another module's repository directly) so a future
extraction, if ever needed, is a refactor rather than a rewrite.

---

## ADR-002: Redis for realtime/ephemeral state, MongoDB for persistence

**Context**: Playback state changes far more frequently than the product
can afford to persist to a durable database.

**Decision**: Redis holds `room:{roomId}:state` and presence sets; MongoDB
holds everything that must survive a restart (rooms, messages, queue,
sessions).

**Alternatives**: Writing playback state directly to MongoDB with heavy
debouncing.

**Trade-offs**: Redis data is lossy on flush/restart — acceptable because
`listeningSessions` in MongoDB captures the durable facts (a session
happened, what was played), not fine-grained position.

**Consequences**: Any new realtime feature must classify its data as
ephemeral (Redis) or durable (MongoDB) before implementation — see
Architecture Review §5.

---

## ADR-003: Socket.IO Redis adapter wired at bootstrap, dormant until multi-instance

**Context**: Scaling to multiple API instances requires cross-instance
broadcast, which plain Socket.IO does not provide.

**Decision**: Wire `@socket.io/redis-adapter` into `main.ts` from the first
commit, even though it's a no-op at single-instance scale.

**Trade-offs**: Marginal added complexity now, in exchange for scaling
being a deploy config change rather than a code change later.

---

## ADR-004: In-house auth with three methods (password, Google OAuth, guest); stateful refresh-token rotation

**Context**: Product requires three login paths at Phase 1: email/password,
Google sign-in, and a frictionless guest mode (display name only, no
credential). Guest mode in particular does not map cleanly onto most
managed-auth providers' primary use case (persistent verified identities),
which was the deciding factor between Clerk and in-house.

**Decision**: Build auth in-house behind a stable internal boundary
(`modules/auth` + `modules/users`), rather than adopting Clerk. Access
tokens are short-lived JWTs (stateless, not persisted); refresh tokens are
long-lived and tracked server-side by **hash** (never the raw token) in the
`refreshTokens` collection, with rotation on every use — using a token
invalidates it and issues a new one. Reuse of an already-rotated refresh
token (a strong signal of theft) revokes the entire token chain for that
session.

**Alternatives**:

- Clerk or another managed provider — faster to ship, but guest mode would
  need to be bolted on awkwardly outside Clerk's own user model, defeating
  much of the point of using a managed provider for identity.
- Pure stateless JWT refresh tokens with no server-side record — simpler,
  but forecloses "log out everywhere" / individual session revocation,
  which was an explicitly open question and is now resolved by this ADR:
  **yes, sessions are individually revocable**, because the tracked-hash
  approach costs little and materially improves the security posture for a
  social product where account takeover directly threatens other users
  (spam, impersonation in rooms).

**Trade-offs**: One extra collection and a lookup on every token refresh
(not on every request — access-token verification stays stateless). Slightly
more implementation complexity than pure stateless JWT.

**Consequences**: Guest accounts are scoped to `authMethods: ["guest"]` and
are not link-able to a real identity by design — this keeps them low-stakes
and disposable rather than a permanent account users forget is unsecured.
`MusicProvider` and queue-concurrency decisions remain open per below.

---

## OPEN DECISIONS (not yet made — tracked here per Master Prompt §79)

1. ~~**Auth provider**~~ — **Resolved, see ADR-004.**
2. **Music/metadata provider**: `MusicProvider` interface exists in
   `@soundwithme/types`; no concrete implementation is wired yet. Blocks
   real Discover/Search/Player work.
3. **Queue concurrency strategy**: `QueueItem.position` is typed as a
   fractional/lexicographic string key (recommended approach), but the
   actual reorder algorithm is not implemented yet.
4. **Audio catalog licensing**: unresolved — see Architecture Review §17
   risk #5. Affects whether Range-Request delivery is legally sufficient
   or an embedded-player requirement applies instead.

Each should be resolved (or explicitly deferred with a reason) before the
corresponding module (`music`, `queue`, audio delivery) is built.
