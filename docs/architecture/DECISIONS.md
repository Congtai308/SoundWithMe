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

## OPEN DECISIONS (not yet made — tracked here per Master Prompt §79)

1. **Auth provider**: Clerk vs. in-house. Bootstrap includes an
   `AuthProvider`-shaped seam (not yet implemented) so either choice slots
   in without touching business logic elsewhere.
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
corresponding module (`auth`, `music`, `queue`, audio delivery) is built.
