#!/usr/bin/env bash
# The only way to deploy: every test must pass first, then the containers are
# rebuilt and the served bundle is checked. Any failure stops here - nothing
# is deployed.
#   scripts/deploy.sh            frontend + backend tests, then deploy both
#   scripts/deploy.sh frontend   frontend tests, then redeploy the frontend only
#                                (keeps the backend session - no re-login)
# It acts on the same Compose project as backup.sh / restore.sh
# (COMPOSE_PROJECT_NAME, COMPOSE_FILE, COMPOSE_ENV_FILES - see common.sh), so a
# homelab tool's project and override file are deployed in place.
set -euo pipefail
source "$(dirname "$0")/common.sh"
target="${1:-all}"

echo "==> Frontend: lint, tests, build"
# Built with the same sub-path as the image (the build arg as Compose resolves
# it), so the bundle hashes compare below.
base_path="$("${compose[@]}" config | sed -n 's/^ *BASE_PATH: *//p' | head -1 | sed 's/^["'\'']//; s/["'\'']$//')"
(cd frontend && npx oxlint && npm test && BASE_PATH="$base_path" npx vite build)

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
if [ -n "$(running db)" ]; then
  scripts/backup.sh
fi
if [ "$target" = "frontend" ]; then
  "${compose[@]}" up -d --build --no-deps frontend
else
  "${compose[@]}" up -d --build
fi

sleep 2
built=$(ls frontend/dist/assets | grep -o 'index-[^"]*\.js' | head -1)
# Asked of the new container's own nginx, so it works whether the port is
# published or a reverse proxy sits in front (and whatever sub-path it uses).
served=$("${compose[@]}" exec -T frontend wget -qO- http://localhost/ 2>/dev/null | grep -o 'index-[^"]*\.js' | head -1 || true)
echo "==> Built $built, serving ${served:-nothing}"
[ "$built" = "$served" ] || { echo "!! The served bundle is not the one just built"; exit 1; }
echo "==> Deployed"
