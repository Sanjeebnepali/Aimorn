# Multi-stage build so the shipped image only carries production
# dependencies + compiled JS — same Dockerfile builds and runs identically
# on Render today and on AWS (ECS/Fargate, App Runner, EC2, Lightsail —
# anything that runs a container) later. Nothing host-specific lives here.
#
# openssl: Prisma's query-engine binary needs libssl and, on Debian 12
# ("bookworm" — node:22-slim's current base), the slim image doesn't ship
# it by default. Without this, `prisma generate`/`migrate deploy` fail with
# "Unable to require libssl.so..." — a well-known Prisma+Debian-slim gotcha,
# not something worth discovering via a broken deploy.

FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
# `prisma` (the CLI, not just @prisma/client) is a real `dependencies` entry
# — not devDependencies — specifically so it survives this production
# install: the CMD below needs it to run migrations on every container
# start (see that line's own comment for why "every start", not "every
# deploy").
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 4000
# Render's Docker runtime doesn't support "pre-deploy commands" (that
# feature is only available for its non-Docker web-service/worker runtimes
# — confirmed against Render's own docs before writing this, not assumed),
# so there's no separate migration step to hook into. Running
# `prisma migrate deploy` here instead, right before the server starts,
# covers the same need: it's idempotent (a no-op if the DB is already at
# the latest migration), so running it on every container start/restart —
# not just the first deploy after a schema change — costs a couple of
# seconds and nothing else. `node_modules/prisma/build/index.js` (not
# `npx prisma`) matches this repo's own `prisma:deploy` package.json script.
CMD ["sh", "-c", "node ./node_modules/prisma/build/index.js migrate deploy && node dist/index.js"]
