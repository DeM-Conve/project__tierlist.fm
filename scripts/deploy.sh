#!/usr/bin/env bash
# The only way to deploy: every test must pass first, then the containers are
# rebuilt and the served bundle is checked. Any failure stops here - nothing
# is deployed.
#   scripts/deploy.sh            frontend + backend tests, then deploy both
#   scripts/deploy.sh frontend   frontend tests, then redeploy the frontend only
#                                (keeps the backend session - no re-login)
set -euo pipefail
cd "$(dirname "$0")/.."
target="${1:-all}"

echo "==> Frontend: lint, tests, build"
(cd frontend && npx oxlint && npm test && npx vite build)

if [ "$target" != "frontend" ]; then
  echo "==> Backend: unit + integration tests with coverage gate (needs Docker)"
  if command -v mvn >/dev/null && command -v javac >/dev/null; then
    (cd backend && mvn -q verify)
  else
    # No local JDK + Maven: the same `mvn verify` in the image the backend's
    # Dockerfile builds with, given Docker for the Testcontainers ITs.
    docker run --rm -u "$(id -u):$(id -g)" --group-add "$(stat -c %g /var/run/docker.sock)" --network host \
      -e HOME=/tmp -e TESTCONTAINERS_RYUK_DISABLED=true -v /var/run/docker.sock:/var/run/docker.sock \
      -v "$PWD/backend:/app" -v "$HOME/.m2:/tmp/m2" -w /app maven:3.9-eclipse-temurin-21 \
      mvn -q -B -Dmaven.repo.local=/tmp/m2/repository verify
    docker ps -aq --filter label=org.testcontainers=true | xargs -r docker rm -f >/dev/null
  fi
fi

echo "==> All tests passed - deploying"
# Every deploy gets a restore point (scripts/restore.sh <dump> to go back).
if [ -n "$(docker compose -p tierlistfm -f docker-compose.yml ps --status running -q db 2>/dev/null)" ]; then
  scripts/backup.sh
fi
if [ "$target" = "frontend" ]; then
  docker compose -f docker-compose.yml up -d --build --no-deps frontend
else
  docker compose -f docker-compose.yml up -d --build
fi

sleep 2
built=$(ls frontend/dist/assets | grep -o 'index-[^"]*\.js' | head -1)
# A setting from the environment, else .env, else the default (like Compose).
env_value() {
  local v="${!1:-}"
  [ -n "$v" ] || v="$(sed -n "s/^$1=//p" .env 2>/dev/null | tail -1 | sed 's/^["'\'']//; s/["'\'']$//')"
  echo "${v:-$2}"
}
port="$(env_value TIERLIST_PORT "$(env_value FRONTEND_PORT 80)")"
served=$(curl -s "http://localhost:$port" | grep -o 'index-[^"]*\.js' | head -1 || true)
echo "==> Built $built, serving ${served:-nothing}"
[ "$built" = "$served" ] || { echo "!! The served bundle is not the one just built"; exit 1; }
echo "==> Deployed"
