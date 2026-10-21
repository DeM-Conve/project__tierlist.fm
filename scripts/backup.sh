#!/usr/bin/env bash
# Take a backup of everything Tierlist.fm keeps, now, while it runs: one
# gzipped plain-SQL pg_dump of the `db` service (the database is the app's
# whole state - there are no uploaded files) written to
#   <BACKUP_LOCATION>/tierlistfm-YYYYmmdd-HHMMSS.sql.gz    (default ./backups)
# The same format the nightly `backup` service writes to daily|weekly|monthly/.
# Read-only for the db; pg_dump reads one consistent snapshot, so no downtime.
#   scripts/backup.sh                   prints the new file's path on the last line
#   scripts/backup.sh --tag pre-restore -> tierlistfm-pre-restore-<time>.sql.gz
# Restore one with scripts/restore.sh [file|latest]. Not in it: .env (secrets).
set -euo pipefail
source "$(dirname "$0")/common.sh"

tag=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tag) tag="${2:?--tag needs a name}"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown argument: $1 (see scripts/backup.sh --help)" ;;
  esac
done

if [ -z "$(running db)" ]; then
  die "The db of project '$project' is not running - nothing to back up.
   Start it first: docker compose up -d db"
fi

# File names in the app's time zone (TZ, as the backup service uses), else the host's.
tz="$(env_value TZ "")"
[ -z "$tz" ] || export TZ="$tz"

mkdir -p "$backups"
out="$backups/$APP${tag:+-$tag}-$(date +%Y%m%d-%H%M%S).sql.gz"
[ -e "$out" ] && die "$out already exists - try again in a second"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

log "==> Backing up project '$project' to $out"
"${compose[@]}" exec -T db sh -c \
  'pg_dump --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip -6 > "$tmp"
gzip -t "$tmp"
gzip -dc "$tmp" | tail -n 5 | grep -q 'PostgreSQL database dump complete' \
  || die "The dump looks incomplete - not keeping it"
mv "$tmp" "$out"
log "==> Backup done ($(du -h "$out" | cut -f1))"
echo "$out"
