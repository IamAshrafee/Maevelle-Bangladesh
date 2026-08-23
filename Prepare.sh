#!/usr/bin/env bash
# Starts a ready-to-use local Maevelle environment, including migrations and the development Owner.
set -Eeuo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_root"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Desktop and make sure it is running." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Update it if you want different local development credentials."
fi

echo "Building and starting Maevelle..."
# Recreate one-shot migration/bootstrap containers so new migrations and development data are applied.
docker compose up -d --build --force-recreate

echo "Waiting for the routed application to become available..."
for attempt in {1..30}; do
  if curl --fail --silent --show-error http://localhost:8080/admin/login >/dev/null; then
    echo
    echo "Maevelle is ready."
    echo "Storefront:   http://localhost:8080/"
    echo "Admin login: http://localhost:8080/admin/login"
    echo "Development Owner credentials are in .env (BOOTSTRAP_OWNER_EMAIL and BOOTSTRAP_OWNER_PASSWORD)."
    exit 0
  fi
  sleep 2
done

echo "Maevelle did not become ready in time. Inspect the service status and logs with:" >&2
echo "  docker compose ps" >&2
echo "  docker compose logs --tail=100" >&2
exit 1
