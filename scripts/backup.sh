#!/bin/sh
# Backup: Postgres dump + uploaded files, into ./backups/<timestamp>/ . Run from the repo root on the server.
#   sh scripts/backup.sh            # keeps the newest 14 backups
set -eu
COMPOSE="docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DIR="backups/$STAMP"
mkdir -p "$DIR"
$COMPOSE exec -T db pg_dump -U packaging -d packaging --format=custom > "$DIR/db.dump"
$COMPOSE exec -T web tar -C /data -cf - storage > "$DIR/uploads.tar"
[ -s "$DIR/db.dump" ] || { echo "Backup failed: empty database dump" >&2; exit 1; }
echo "Backup written to $DIR ($(du -sh "$DIR" | cut -f1))"
# Keep the newest 14. Only directories matching our timestamp pattern are touched.
ls -1d backups/2*T*Z 2>/dev/null | sort | head -n -14 | while read -r old; do rm -rf -- "$old"; done
