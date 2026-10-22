# syntax=docker/dockerfile:1
# Web + API in one container, for hosts that run a single service (Render's
# free plan): the web server proxies /api/v1 and /socket.io to the API on
# localhost, so cookies, sockets and karaoke stay on one origin exactly as in
# development. See docs/DEPLOY.md.
FROM node:20-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# The browser talks to its own origin (no NEXT_PUBLIC_API_URL), see api-client.ts.
RUN pnpm build

FROM node:20-slim AS runner
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo /repo
EXPOSE 3000
CMD ["sh", "infrastructure/scripts/start-app.sh"]
