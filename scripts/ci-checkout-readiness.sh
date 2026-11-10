#!/usr/bin/env bash
# Linux CI only: no login, push, release marker, SSH or shared deployment command.
set -euo pipefail
set +x
: "${CIRCLE_SHA1:?CircleCI revision required}"
[[ "$CIRCLE_SHA1" =~ ^[a-f0-9]{40}$ ]] || exit 1
test "$(git rev-parse HEAD)" = "$CIRCLE_SHA1"
PG="maevelle-rc-${CIRCLE_SHA1:0:12}-$$"
RUNNER="${PG}-checks"
cleanup() { docker rm -f "$RUNNER" "$PG" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Authentication is trust only on this disposable, loopback-bound CI database.
docker run -d --name "$PG" -p 127.0.0.1:5548:5432 \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=maevelle_test postgres:18 >/dev/null
ready=0
for attempt in $(seq 1 30); do
  if docker exec "$PG" pg_isready -U postgres -d maevelle_test >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
docker run --rm --name "$RUNNER" --network host \
  --mount "type=bind,src=$PWD,dst=/workspace" --workdir /workspace \
  -e TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5548/maevelle_test \
  -e CHECKOUT_RC_LOCAL_ALLOW=1 -e NEXT_TELEMETRY_DISABLED=1 \
  -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/workspace \
  node:24-bookworm bash -euc 'corepack enable; pnpm install --frozen-lockfile; node scripts/checkout-release-checks.mjs'
