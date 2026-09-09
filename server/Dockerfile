# Multi-stage build so the shipped image only carries production
# dependencies + compiled JS — same Dockerfile builds and runs identically
# on Render today and on AWS (ECS/Fargate, App Runner, EC2, Lightsail —
# anything that runs a container) later. Nothing host-specific lives here.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 4000
CMD ["node", "dist/index.js"]
