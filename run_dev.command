#!/bin/bash
set -Eeuo pipefail
cd "$(dirname "$0")"

# Check if Docker is available
if ! docker compose version > /dev/null 2>&1; then
  echo "Docker Compose v2 is required. Start Docker Desktop, then try again."
  exit 1
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example."
fi

# Ensure BETTER_AUTH_URL points to the local Node.js server instead of Caddy
if grep -q "BETTER_AUTH_URL=http://localhost:8080" .env; then
  sed -i '' 's/BETTER_AUTH_URL=http:\/\/localhost:8080/BETTER_AUTH_URL=http:\/\/localhost:3000/g' .env
  echo "Updated BETTER_AUTH_URL in .env to use port 3000."
fi

echo "Starting database in Docker and running local dev servers..."
exec pnpm dev
