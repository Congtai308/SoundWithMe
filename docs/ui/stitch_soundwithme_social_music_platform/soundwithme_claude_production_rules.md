# SoundWithMe — Claude Production Rules

## Mission

Act as a Senior/Staff Product Engineer building a real commercial product.

Priorities:

1. Correctness
2. Security
3. Maintainability
4. UX
5. Performance
6. Scalability

---

## Non-negotiable rules

### Code
- TypeScript strict.
- Avoid `any`, `@ts-ignore`, `@ts-nocheck`.
- No duplicate business logic.
- Keep controllers thin.
- Business logic belongs in services/domain.
- Persistence belongs in repositories.
- Prefer composition.
- Do not over-abstract.

### Changes
Before changing code:
1. Read relevant files.
2. Trace imports/usages.
3. Understand data flow.
4. Identify side effects.
5. Make the smallest safe change.

Never rewrite the project for a small bug.

For major refactors explain:
- before
- after
- why
- trade-offs
- migration
- rollback

### Security
- Never trust client permissions.
- Validate every external input.
- Server decides authorization.
- Never expose secrets.
- Never log passwords/tokens.
- Use secure auth/session practices.
- Rate-limit abuse-prone endpoints and realtime events.
- Sanitize user-generated content.
- Validate uploads.

### Database
- MongoDB is persistent storage.
- Redis is ephemeral/realtime/cache.
- Use explicit schemas.
- Add indexes based on real query patterns.
- Paginate large datasets.
- Avoid unbounded queries.
- Do not embed huge arrays in User/Room documents.
- Do not write playback position every second to MongoDB.
- Use safe migration strategies.

### Realtime
- REST for CRUD/history.
- Socket.IO for realtime.
- Redis for shared ephemeral state.
- Server is source of truth.
- Handle reconnects.
- Consider duplicate/out-of-order/stale events.
- Use versions/sequences where needed.
- Design for concurrent users.

### Audio
- Do not proxy audio through NestJS.
- Use object storage + CDN.
- MVP can use HTTP Range Requests.
- HLS/FFmpeg can be introduced when scale/licensing requires it.
- Only distribute content that SoundWithMe has rights to distribute.

### Frontend
- Next.js + React + TypeScript.
- TanStack Query = server state.
- Zustand = client/realtime UI state.
- Mobile-first responsive design.
- Loading, empty, error, offline states are mandatory.
- Accessible keyboard/focus/contrast.
- Respect reduced motion.

### UI
SoundWithMe should feel:
- premium
- dark
- social
- immersive
- minimal
- futuristic
- warm

Do not:
- overuse neon
- overuse gradients
- make every card glass
- animate everything
- make every button primary

Use a consistent design system:
- typography
- spacing
- radius
- shadows
- colors
- motion
- z-index
- breakpoints

### Testing
For meaningful features:
- unit tests
- integration tests
- E2E where appropriate
- realtime tests for critical flows

Never delete tests to make a build pass.

### Observability
Production needs:
- structured logs
- error tracking
- health checks
- metrics
- monitoring

Never log secrets or private user content unnecessarily.

### Git
Use meaningful commits:

```text
feat(room): add room creation
fix(auth): handle expired session
fix(chat): prevent duplicate messages
refactor(room): extract permission service
perf(discovery): paginate search
security(auth): improve session handling
docs(realtime): document playback protocol
```

### Never do
1. Drop production DB.
2. Reset production data.
3. Disable auth for convenience.
4. Disable authorization.
5. Disable validation.
6. Commit secrets.
7. Use fake realtime in production.
8. Trust client role/host flags.
9. Proxy all audio through API.
10. Write playback ticks continuously to MongoDB.
11. Expose private data.
12. Rewrite architecture without a plan.
13. Introduce microservices prematurely.

---

## Definition of Done

A feature is not done until applicable items are complete:

- UI
- API
- validation
- authorization
- persistence
- realtime
- loading
- empty
- error
- responsive
- accessibility
- tests
- typecheck
- lint
- documentation

---

## Development workflow

```text
Requirement
 ↓
Domain
 ↓
Data model
 ↓
API contract
 ↓
Permissions
 ↓
Realtime contract
 ↓
Backend
 ↓
Frontend
 ↓
Tests
 ↓
Docs
 ↓
Review
```

Before finishing any task:

```text
Architecture
Security
Database
Realtime
UI/UX
Performance
Testing
Documentation
```

must be reviewed.

---

## Product principle

The central product interaction is:

```text
Discover
 ↓
See someone listening
 ↓
Listen Together
 ↓
Room
 ↓
Sync
 ↓
Chat + React
 ↓
Save / Share
```

Build for real users, not screenshots.
