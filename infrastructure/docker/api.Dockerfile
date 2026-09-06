# syntax=docker/dockerfile:1
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter=@soundwithme/api...

FROM deps AS build
COPY apps/api ./apps/api
RUN pnpm --filter=@soundwithme/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=deps /repo/node_modules ./node_modules
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
