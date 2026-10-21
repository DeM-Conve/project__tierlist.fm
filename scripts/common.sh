# Shared by scripts/backup.sh and scripts/restore.sh - sourced, not run.
#
# Which Compose project the scripts act on, like `docker compose` itself:
#   - COMPOSE_PROJECT_NAME (or the older TIERLISTFM_PROJECT) picks the project,
#     else the compose file's `name: tierlistfm`;
#   - COMPOSE_FILE picks the compose files (e.g. a homelab tool's override on top,
#     `docker-compose.yml:/path/override.yml`), else ./docker-compose.yml;
#   - COMPOSE_ENV_FILES picks the env files (comma-separated), else ./.env.
# Settings (BACKUP_LOCATION, ...) come from the environment, else those env
# files, else the default - the same order Compose uses.

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ -z "${COMPOSE_PROJECT_NAME:-}" ] && [ -n "${TIERLISTFM_PROJECT:-}" ]; then
  export COMPOSE_PROJECT_NAME="$TIERLISTFM_PROJECT"
fi

# The file names start with this, whatever the project is called.
APP=tierlistfm

compose=(docker compose)
if [ -z "${COMPOSE_FILE:-}" ]; then
  compose+=(-f docker-compose.yml)
fi

env_files=()
if [ -n "${COMPOSE_ENV_FILES:-}" ]; then
  IFS=, read -r -a env_files <<<"$COMPOSE_ENV_FILES"
elif [ -f .env ]; then
  env_files=(.env)
fi

# A setting from the environment, else the env files (later ones win), else $2.
env_value() {
  local v="${!1:-}" f line
  if [ -z "$v" ]; then
    for f in "${env_files[@]}"; do
      [ -f "$f" ] || continue
      line="$(sed -n "s/^[[:space:]]*\(export[[:space:]]\+\)\?$1=//p" "$f" | tail -1)"
      [ -n "$line" ] || continue
      line="${line%%[[:space:]]#*}"
      line="$(sed 's/^["'\'']//; s/["'\'']$//' <<<"$line")"
      [ -n "$line" ] && v="$line"
    done
  fi
  echo "${v:-$2}"
}

project="$(env_value COMPOSE_PROJECT_NAME tierlistfm)"
backups="$(env_value BACKUP_LOCATION ./backups)"

log() { echo "$*" >&2; }
die() { echo "!! $*" >&2; exit 1; }

# The id of a running container of a service, or nothing.
running() { "${compose[@]}" ps --status running -q "$1" 2>/dev/null || true; }

# psql in the db container, as the app's user, on the app's database (or $1).
db_psql() {
  local db="${1:-}"
  "${compose[@]}" exec -T -e PGDB="$db" -e PGOPTIONS='-c client_min_messages=warning' db sh -c \
    'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${PGDB:-$POSTGRES_DB}" "$@"' sh "${@:2}"
}
