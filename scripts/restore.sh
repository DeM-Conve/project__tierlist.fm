#!/usr/bin/env bash
# Restore a dump into the app's Postgres db, replacing everything in it.
#   scripts/restore.sh backups/daily/yt-20261011.sql.gz
# Takes a .sql.gz / .sql (scripts/backup.sh or the nightly backup service) or a
# pg_dump custom-format .dump. Before touching anything it asks you to type the
# project name, then takes a fresh backup (scripts/backup.sh) so the restore can
# itself be undone. The backend is stopped while the dump loads and started
# again afterwards (that logs everyone out). The load runs in one transaction:
# if any statement fails, the db is left exactly as it was.
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

dump="${1:-}"
if [ -z "$dump" ]; then
  echo "Usage: scripts/restore.sh <dump>   (.sql.gz, .sql or .dump)" >&2
  echo "Recent dumps:" >&2
  find "$backups" -type f \( -name '*.sql.gz' -o -name '*.sql' -o -name '*.dump' \) \
    -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -10 | cut -d' ' -f2- | sed 's/^/  /' >&2
  exit 2
fi
dump="$(readlink -f "$dump")"   # the services' *-latest.sql.gz are symlinks
[ -f "$dump" ] || { echo "!! No such dump: $1" >&2; exit 1; }

case "$dump" in
  *.sql.gz) gzip -t "$dump"; read_dump() { gzip -dc "$dump"; } ;;
  *.sql)    read_dump() { cat "$dump"; } ;;
  *.dump)   read_dump() { "${compose[@]}" exec -T db pg_restore --no-owner --no-privileges -f - < "$dump"; } ;;
  *) echo "!! Unknown dump type (want .sql.gz, .sql or .dump): $dump" >&2; exit 1 ;;
esac

if [ -z "$("${compose[@]}" ps --status running -q db 2>/dev/null)" ]; then
  echo "!! The db container of project '$project' is not running - start it first:" >&2
  echo "   docker compose -f docker-compose.yml up -d db" >&2
  exit 1
fi

cat <<WARN

  This REPLACES ALL DATA in the '$project' database with:
    $dump ($(du -h "$dump" | cut -f1), $(date -r "$dump" '+%Y-%m-%d %H:%M'))
  Every change made since that dump is lost (a fresh backup is taken first).
  The backend is stopped during the restore; everyone is logged out.

WARN
if [ ! -t 0 ] && [ "${RESTORE_CONFIRM:-}" != "$project" ]; then
  echo "!! Not a terminal - refusing to restore without confirmation" >&2
  echo "   (set RESTORE_CONFIRM=$project to confirm non-interactively)" >&2
  exit 1
fi
answer="${RESTORE_CONFIRM:-}"
if [ "$answer" != "$project" ]; then
  read -r -p "Type the project name ($project) to continue: " answer
fi
[ "$answer" = "$project" ] || { echo "Aborted - nothing was changed."; exit 1; }

echo "==> Taking a fresh backup first"
scripts/backup.sh

backend_was_running=$("${compose[@]}" ps --status running -q backend 2>/dev/null || true)
restart_backend() {
  if [ -n "$backend_was_running" ]; then
    echo "==> Starting the backend again"
    "${compose[@]}" start backend
  fi
}
trap restart_backend EXIT
if [ -n "$backend_was_running" ]; then
  echo "==> Stopping the backend"
  "${compose[@]}" stop backend
fi

echo "==> Restoring (one transaction - all or nothing)"
{
  echo 'DROP SCHEMA IF EXISTS public CASCADE;'
  echo 'CREATE SCHEMA public;'
  read_dump
} | "${compose[@]}" exec -T db sh -c \
  'psql -q -X --single-transaction -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null

echo "==> Restored from $dump"
