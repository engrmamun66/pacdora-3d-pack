#!/bin/sh
# Restore a backup made by backup.sh. DESTRUCTIVE: replaces the database and uploads.
#   sh scripts/restore.sh backups/20261109T100000Z
set -eu
DIR="${1:?usage: restore.sh backups/<timestamp>}"
[ -f "$DIR/db.dump" ] && [ -f "$DIR/uploads.tar" ] || { echo "Not a backup directory: $DIR" >&2; exit 1; }
printf "This REPLACES the current database and uploads with %s. Type 'restore' to continue: " "$DIR"
read -r answer
[ "$answer" = "restore" ] || { echo "Aborted."; exit 1; }
COMPOSE="docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod"
$COMPOSE exec -T db pg_restore -U packaging -d packaging --clean --if-exists --no-owner < "$DIR/db.dump"
$COMPOSE exec -T web tar -C /data -xf - < "$DIR/uploads.tar"
echo "Restored from $DIR"
