# syntax=docker/dockerfile:1.7
#
# Web/SSR frontend (TanStack Start, built with Vite + Nitro).
#
# This app is scaffolded via @lovable.dev/vite-tanstack-config, whose Nitro
# build defaults to Cloudflare's "cloudflare-module" preset (see
# vite.config.ts). NITRO_PRESET=node-server below overrides that so the
# build emits a plain Node.js server at .output/server/index.mjs instead of
# a Cloudflare Worker bundle.
#
# Some server-only code (e.g. src/lib/ai-usage.functions.ts, a TanStack
# Start server function) talks to Postgres directly via Prisma, so this
# image needs its own generated Prisma client and DATABASE_URL at runtime
# even though there is a separate API service.

FROM node:22-alpine AS base
WORKDIR /app
# Prisma's query engine binary needs OpenSSL on Alpine; libc6-compat covers
# prebuilt native deps that expect glibc-ish behavior.
RUN apk add --no-cache openssl libc6-compat

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
ENV NITRO_PRESET=node-server
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
# Full node_modules (not a prod-only reinstall) so the already-generated
# Prisma client/engine binary from the build stage comes along as-is.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/.output ./.output
EXPOSE 3000
USER node
CMD ["node", ".output/server/index.mjs"]
