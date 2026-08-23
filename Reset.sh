#!/usr/bin/env bash
# Deletes all local Docker-managed Maevelle data, then prepares a brand-new development environment.
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

if [[ "${1:-}" != "--yes" ]]; then
  echo "WARNING: This permanently deletes all local Maevelle Docker data:"
  echo "  - PostgreSQL databases, including users, orders, inventory, and migrations"
  echo "  - locally uploaded media"
  echo "  - Caddy's local state"
  echo
  read -r -p "Type RESET to continue: " confirmation
  if [[ "$confirmation" != "RESET" ]]; then
    echo "Reset cancelled."
    exit 0
  fi
fi

echo "Removing the local Maevelle Docker environment and its named volumes..."
docker compose down --volumes --remove-orphans

echo "Creating a fresh local environment..."
exec "$project_root/Prepare.sh"
