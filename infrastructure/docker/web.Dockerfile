# syntax=docker/dockerfile:1
# Only needed for non-Vercel deployment targets. The MVP deployment
# recommendation (Architecture Review §15) is Vercel, where this file is
# unused — kept here so a container-based deploy is available if needed.
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter=@soundwithme/web...

FROM deps AS build
COPY apps/web ./apps/web
RUN pnpm --filter=@soundwithme/web build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next ./apps/web/.next
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY --from=build /repo/apps/web/package.json ./apps/web/package.json
COPY --from=deps /repo/node_modules ./node_modules
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
