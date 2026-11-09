# syntax=docker/dockerfile:1
# Production image for the web app (monorepo: workspace packages are compiled by Next.js).

FROM node:22.12.0-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Public value (it is sent to every browser), inlined into the client bundle at build time.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
COPY . .
# prisma generate (postinstall) only needs the variable to exist; no connection is made.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm ci
# The app validates its environment on import (secrets are not needed to build). These placeholders only let the
# build run; real values are supplied at runtime and never baked into the image.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    BETTER_AUTH_SECRET="build-time-placeholder-not-a-secret-000000" \
    BETTER_AUTH_URL="http://localhost:3100" \
    SMTP_HOST="localhost" SMTP_PORT="25" MAIL_FROM="build@localhost" \
    TURNSTILE_SECRET_KEY="build" \
    npm run build -w web

FROM node:22.12.0-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3100 STORAGE_DIR=/data/storage
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3100
CMD ["sh", "apps/web/docker-entrypoint.sh"]
