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
  (cd backend && mvn -q verify)
fi

echo "==> All tests passed - deploying"
if [ "$target" = "frontend" ]; then
  docker compose -f docker-compose.yml up -d --build --no-deps frontend
else
  docker compose -f docker-compose.yml up -d --build
fi

sleep 2
built=$(ls frontend/dist/assets | grep -o 'index-[^"]*\.js' | head -1)
served=$(curl -s http://localhost:80 | grep -o 'index-[^"]*\.js' | head -1 || true)
echo "==> Built $built, serving ${served:-nothing}"
[ "$built" = "$served" ] || { echo "!! The served bundle is not the one just built"; exit 1; }
echo "==> Deployed"
