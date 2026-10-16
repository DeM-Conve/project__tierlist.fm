#!/usr/bin/env bash
# Take a backup of the app's Postgres data now: a gzipped plain-SQL pg_dump of
# the running `db` service into <BACKUP_LOCATION>/manual/ (default ./backups; the
# same format the nightly `backup` service writes to daily|weekly|monthly).
# Read-only for the db.
#   scripts/backup.sh            prints the path of the new dump on the last line
# Restore one with scripts/restore.sh <dump>.
set -euo pipefail
cd "$(dirname "$0")/.."
project="${TIERLISTFM_PROJECT:-tierlistfm}"
compose=(docker compose -p "$project" -f docker-compose.yml)

# A setting from the environment, else .env, else the default (like Compose).
env_value() {
  local v="${!1:-}"
  [ -n "$v" ] || v="$(sed -n "s/^$1=//p" .env 2>/dev/null | tail -1 | sed 's/^["'\'']//; s/["'\'']$//')"
  echo "${v:-$2}"
}
backups="$(env_value BACKUP_LOCATION ./backups)"

if [ -z "$("${compose[@]}" ps --status running -q db 2>/dev/null)" ]; then
  echo "!! The db container of project '$project' is not running - nothing to back up" >&2
  exit 1
fi

mkdir -p "$backups/manual"
out="$backups/manual/${project}-$(date +%Y%m%d-%H%M%S).sql.gz"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

echo "==> Backing up the db to $out"
"${compose[@]}" exec -T db sh -c \
  'pg_dump --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip -6 > "$tmp"
gzip -t "$tmp"
grep -q 'PostgreSQL database dump complete' < <(gzip -dc "$tmp") \
  || { echo "!! The dump looks incomplete - not keeping it" >&2; exit 1; }
mv "$tmp" "$out"
echo "==> Backup done ($(du -h "$out" | cut -f1))"
echo "$out"
