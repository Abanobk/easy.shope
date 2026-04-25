#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
FILE="${BACKUP_DIR}/easy-shope-${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$FILE"

echo "Backup written to $FILE"
