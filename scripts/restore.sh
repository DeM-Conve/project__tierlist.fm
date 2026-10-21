#!/usr/bin/env bash
# Restore Tierlist.fm's whole state (its database) from one backup, replacing
# everything in it.
#   scripts/restore.sh                    the newest backup in BACKUP_LOCATION
#   scripts/restore.sh latest --yes       same, without asking (for scripts)
#   scripts/restore.sh backups/tierlistfm-20261021-030000.sql.gz
#   scripts/restore.sh --list             list the backups, newest first
# Takes a .sql.gz / .sql (scripts/backup.sh or the nightly backup service) or a
# pg_dump custom-format .dump. `latest` looks in BACKUP_LOCATION and its
# daily/weekly/monthly/last folders, and skips the pre-restore safety copies.
# What it does: shows what's in the file and asks; loads it into a fresh
# database next to the live one (a broken file changes nothing); stops the
# backend and the backup service; takes a safety backup of the current data
# (tierlistfm-pre-restore-<time>.sql.gz, so the restore can itself be undone);
# swaps the new database in; starts them again; checks every table holds the
# rows the file has. On a new machine it starts the db by itself.
set -euo pipefail
source "$(dirname "$0")/common.sh"

usage() { sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; }

# Every backup under BACKUP_LOCATION, newest first ("<epoch> <path>" lines).
# Symlinks (the backup service's *-latest.sql.gz) and unfinished files are skipped.
list_backups() {
  [ -d "$backups" ] || return 0
  find "$backups" -type f \( -name '*.sql.gz' -o -name '*.sql' -o -name '*.dump' \) \
    -printf '%T@ %p\n' 2>/dev/null | sort -rn
}

file="" yes=false
while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes) yes=true; shift ;;
    -l|--list)
      list_backups | while read -r _ f; do
        printf '  %s  %6s  %s\n' "$(date -r "$f" '+%Y-%m-%d %H:%M')" "$(du -h "$f" | cut -f1)" "$f"
      done
      exit 0 ;;
    -h|--help) usage; exit 0 ;;
    -*) die "Unknown option: $1 (see scripts/restore.sh --help)" ;;
    *) [ -z "$file" ] || die "One backup at a time (got '$file' and '$1')"; file="$1"; shift ;;
  esac
done
[ "${RESTORE_CONFIRM:-}" = "$project" ] && yes=true   # the older way to say --yes

if [ -z "$file" ] || [ "$file" = latest ]; then
  file="$(list_backups | grep -v -- '-pre-restore-' | head -1 | cut -d' ' -f2- || true)"
  [ -n "$file" ] || die "No backups in $backups (BACKUP_LOCATION) - pass the file to restore:
   scripts/restore.sh /path/to/tierlistfm-YYYYmmdd-HHMMSS.sql.gz"
fi
[ -e "$file" ] || die "No such backup: $file"
file="$(readlink -f "$file")"

case "$file" in
  *.sql.gz) gzip -t "$file" 2>/dev/null || die "$file is not a valid .gz file (damaged or cut short?)" ;;
  *.sql|*.dump) ;;
  *) die "Unknown backup type (want .sql.gz, .sql or .dump): $file" ;;
esac

# --- The db must be up (on a new machine: start just the db) -------------------
if [ -z "$(running db)" ]; then
  log "==> The db of project '$project' isn't running - starting it"
  "${compose[@]}" up -d --wait db >&2
fi
db="$("${compose[@]}" exec -T db printenv POSTGRES_DB)"
tmpdb="${db}_restoring"

# --- Read the backup once, as plain SQL ------------------------------------------
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
sql="$work/restore.sql"
case "$file" in
  *.sql.gz) gzip -dc "$file" > "$sql" ;;
  *.sql)    cat "$file" > "$sql" ;;
  *.dump)   "${compose[@]}" exec -T db pg_restore --no-owner --no-privileges -f - < "$file" > "$sql" ;;
esac
tail -n 5 "$sql" | grep -q 'PostgreSQL database dump complete' \
  || die "$file is incomplete (no end-of-dump marker) - not restoring it"

# Rows per table in the backup: "<table> <rows>" (COPY blocks, one line per row).
awk '/^COPY [^ ]+ .*FROM stdin;$/ { t = $2; n = 0; inside = 1; next }
     inside && $0 == "\\." { print t, n; inside = 0; next }
     inside { n++ }' "$sql" > "$work/expected"
[ -s "$work/expected" ] || die "$file holds no tables - is it a Tierlist.fm backup?"

cat >&2 <<INFO

  Restore project '$project' (database '$db') from:
    $file
    $(du -h "$file" | cut -f1), taken $(date -r "$file" '+%Y-%m-%d %H:%M')
  It holds $(wc -l < "$work/expected") tables, $(awk '{ s += $2 } END { print s }' "$work/expected") rows in all, e.g.:
$(grep -E '\.(app_user|user_settings|duel_session|duel_decision) ' "$work/expected" | awk '{ printf "    %-28s %s rows\n", $1, $2 }')

  This REPLACES ALL DATA in the database. A safety backup of the current data
  is taken first. The backend restarts, so everyone is logged out.

INFO
if ! $yes; then
  [ -t 0 ] || die "Not a terminal - pass --yes to restore without asking"
  read -r -p "Restore? [y/N] " answer
  case "$answer" in [yY]|[yY][eE][sS]) ;; *) echo "Aborted - nothing was changed." >&2; exit 1 ;; esac
fi

# --- Load into a fresh database next to the live one (the app keeps running) --------
writers=()
tmpdb_made=false
cleanup() {
  restart_writers
  if $tmpdb_made; then
    db_psql postgres -c "DROP DATABASE IF EXISTS \"$tmpdb\" WITH (FORCE)" >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
restart_writers() {
  [ ${#writers[@]} -gt 0 ] || return 0
  log "==> Starting ${writers[*]} again"
  if docker compose start --help 2>/dev/null | grep -q -- '--wait'; then
    "${compose[@]}" start --wait --wait-timeout 300 "${writers[@]}" >&2 \
      || log "!! ${writers[*]} didn't come up healthy - check: docker compose logs ${writers[*]}"
  else
    "${compose[@]}" start "${writers[@]}" >&2
  fi
  writers=()
}
trap cleanup EXIT

log "==> Loading the backup into a fresh database"
db_psql postgres -c "DROP DATABASE IF EXISTS \"$tmpdb\" WITH (FORCE)" -c "CREATE DATABASE \"$tmpdb\"" >/dev/null
tmpdb_made=true
db_psql "$tmpdb" --single-transaction < "$sql" >/dev/null \
  || die "Loading $file failed - nothing was changed"

# --- Stop the services that write, then a safety backup of the current data ----------
for s in backend backup; do
  if [ -n "$(running "$s")" ]; then writers+=("$s"); fi
done
if [ ${#writers[@]} -gt 0 ]; then
  log "==> Stopping ${writers[*]}"
  "${compose[@]}" stop "${writers[@]}" >&2
fi
safety=""
tables_now="$(db_psql "" -At -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
if [ "$tables_now" -gt 0 ]; then
  log "==> Safety backup of the current data"
  safety="$(scripts/backup.sh --tag pre-restore | tail -1)"
else
  log "==> The database is empty - no safety backup needed"
fi

# --- Swap the restored database in ------------------------------------------------------
log "==> Swapping it in for the old database"
db_psql postgres -c "DROP DATABASE \"$db\" WITH (FORCE)" -c "ALTER DATABASE \"$tmpdb\" RENAME TO \"$db\"" >/dev/null
tmpdb_made=false

# --- Check: every table has the rows the backup has --------------------------------
query="$(awk '{ printf "%sSELECT %s, count(*) FROM %s", (NR > 1 ? " UNION ALL " : ""), "'\''" $1 "'\''", $1 }' "$work/expected")"
db_psql "" -At -F' ' -c "$query" > "$work/actual"
restart_writers

echo >&2
printf '  %-34s %10s %10s\n' table "in backup" restored >&2
bad=0
while read -r t want; do
  got="$(awk -v t="$t" '$1 == t { print $2 }' "$work/actual")"
  mark=""; [ "$got" = "$want" ] || { mark="  <-- MISMATCH"; bad=1; }
  printf '  %-34s %10s %10s%s\n' "$t" "$want" "${got:-?}" "$mark" >&2
done < "$work/expected"
echo >&2
[ "$bad" = 0 ] || die "Some tables don't match the backup - see above${safety:+. Your previous data: $safety}"

log "==> Restored project '$project' from $file"
[ -n "$safety" ] && log "    Undo with: scripts/restore.sh $safety"
if [ -z "$(running backend)" ]; then
  log "    The app isn't running - start it: docker compose up -d"
fi
