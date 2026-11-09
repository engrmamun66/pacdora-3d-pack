#!/bin/sh
# Apply pending database migrations, then start the server.
set -eu
cd /app/apps/web
npx prisma migrate deploy
exec npx next start --port "${PORT:-3100}"
