#!/usr/bin/env bash
set -euo pipefail
set +x

: "${CIRCLE_SHA1:?Missing CircleCI revision}"
[[ "$CIRCLE_SHA1" =~ ^[a-f0-9]{40}$ ]] || exit 1
test "$(git rev-parse HEAD)" = "$CIRCLE_SHA1"

SHORT="${CIRCLE_SHA1:0:12}"
SERVICES=(api worker admin storefront)
IMAGE_PREFIX="ghcr.io/iamashrafee/maevelle"

# Build every image before publishing anything.
for SERVICE in "${SERVICES[@]}"; do
  IMAGE="${IMAGE_PREFIX}-${SERVICE}:staging-${SHORT}"

  echo "Building ${SERVICE} from ${CIRCLE_SHA1}"

  docker build \
    --platform linux/amd64 \
    -f "infrastructure/docker/Dockerfile.${SERVICE}" \
    --label "org.opencontainers.image.revision=${CIRCLE_SHA1}" \
    -t "$IMAGE" .

  test "$(docker image inspect \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
    "$IMAGE")" = "$CIRCLE_SHA1"
done

echo "========== API AND WORKER MODULE CHECKS =========="

docker run --rm --network none --entrypoint node \
  "${IMAGE_PREFIX}-api:staging-${SHORT}" \
  --input-type=module -e '
    await import("file:///app/apps/api/dist/src/server.js");
    console.log("API module graph: PASS");
  '

docker run --rm --network none --entrypoint node \
  "${IMAGE_PREFIX}-worker:staging-${SHORT}" \
  --input-type=module -e '
    await import("file:///app/apps/worker/dist/src/server.js");
    console.log("Worker module graph: PASS");
  '

echo "========== FRONTEND IMAGE CHECKS =========="

for SERVICE in admin storefront; do
  IMAGE="${IMAGE_PREFIX}-${SERVICE}:staging-${SHORT}"

  docker run --rm --network none --entrypoint sh "$IMAGE" \
    -ec "test -f /app/apps/${SERVICE}/server.js &&
         test -d /app/apps/${SERVICE}/.next/static"

  docker run --rm --network none --entrypoint node "$IMAGE" \
    --check "/app/apps/${SERVICE}/server.js"

  echo "${SERVICE} image files: PASS"
done

echo "========== DISPOSABLE DATABASE STARTUP TEST =========="

NETWORK="maevelle-ci-${SHORT}"
PG="maevelle-ci-pg-${SHORT}"
API="maevelle-ci-api-${SHORT}"

ENVFILE="$(mktemp)"
chmod 600 "$ENVFILE"

cleanup() {
  docker rm -f "$API" "$PG" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -f "$ENVFILE"
}
trap cleanup EXIT

DB_PASSWORD="$(openssl rand -hex 24)"
AUTH_SECRET="$(openssl rand -hex 32)"
ENCRYPTION_KEY="$(openssl rand -base64 32 | tr -d '\n')"

{
  printf 'DATABASE_URL=postgresql://maevelle_ci:%s@%s:5432/maevelle_ci\n' \
    "$DB_PASSWORD" "$PG"
  printf 'BETTER_AUTH_SECRET=%s\n' "$AUTH_SECRET"
  printf 'AUTH_ENCRYPTION_KEY=%s\n' "$ENCRYPTION_KEY"

  printf '%s\n' \
    'NODE_ENV=production' \
    'LOG_LEVEL=warn' \
    'API_HOST=0.0.0.0' \
    'API_PORT=3000' \
    'DATABASE_POOL_MAX=2' \
    'BETTER_AUTH_URL=http://127.0.0.1:18080/api' \
    'AUTH_TRUSTED_ORIGINS=http://127.0.0.1:18080' \
    'STOREFRONT_BASE_URL=http://127.0.0.1:18080' \
    'STOREFRONT_INTERNAL_API_URL=http://127.0.0.1:3000' \
    'MEDIA_STORAGE_PROVIDER=local' \
    'MEDIA_STORAGE_PATH=/app/var/media' \
    'EMAIL_ENABLED=false' \
    'SMS_ENABLED=false'
} > "$ENVFILE"

unset AUTH_SECRET ENCRYPTION_KEY

docker network create "$NETWORK" >/dev/null

docker run -d \
  --name "$PG" \
  --network "$NETWORK" \
  -e POSTGRES_DB=maevelle_ci \
  -e POSTGRES_USER=maevelle_ci \
  -e "POSTGRES_PASSWORD=$DB_PASSWORD" \
  postgres:18 >/dev/null

unset DB_PASSWORD

READY=0

for attempt in $(seq 1 45); do
  if docker exec "$PG" \
    pg_isready -U maevelle_ci -d maevelle_ci >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done

if [ "$READY" != 1 ]; then
  docker logs --tail 50 "$PG" || true
  echo "FAIL: Disposable PostgreSQL"
  exit 1
fi

echo "========== TEST REAL DATABASE MIGRATIONS =========="

docker run --rm \
  --network "$NETWORK" \
  --env-file "$ENVFILE" \
  --entrypoint node \
  "${IMAGE_PREFIX}-api:staging-${SHORT}" \
  /app/packages/database/dist/src/migrate-cli.js

echo "========== TEST REAL API STARTUP =========="

docker run -d \
  --name "$API" \
  --network "$NETWORK" \
  --memory=768m \
  --cpus=0.75 \
  --env-file "$ENVFILE" \
  "${IMAGE_PREFIX}-api:staging-${SHORT}" >/dev/null

READY=0

for attempt in $(seq 1 30); do
  if [ "$(docker inspect --format '{{.State.Running}}' \
    "$API" 2>/dev/null || true)" != "true" ]; then
    break
  fi

  if docker exec "$API" node -e '
    fetch("http://127.0.0.1:3000/", {
      signal: AbortSignal.timeout(2000)
    })
      .then(response => {
        console.log("API HTTP:", response.status);
        if (response.status >= 500) process.exit(1);
      })
      .catch(() => process.exit(1));
  ' >/dev/null 2>&1; then
    READY=1
    break
  fi

  sleep 2
done

if [ "$READY" != 1 ]; then
  docker logs --tail 70 "$API" || true
  echo "FAIL: API HTTP startup"
  exit 1
fi

echo "PASS: API started against disposable PostgreSQL."

cleanup
trap - EXIT

echo "========== PUBLISH VERIFIED IMAGES =========="

: "${GHCR_USERNAME:?Missing GHCR_USERNAME}"
: "${GHCR_TOKEN:?Missing GHCR_TOKEN}"

printf '%s' "$GHCR_TOKEN" |
  docker login ghcr.io \
    --username "$GHCR_USERNAME" \
    --password-stdin >/dev/null

for SERVICE in "${SERVICES[@]}"; do
  docker push "${IMAGE_PREFIX}-${SERVICE}:staging-${SHORT}"
  echo "Published verified ${SERVICE}: staging-${SHORT}"
done

docker logout ghcr.io >/dev/null

echo "ALL IMAGES VALIDATED AND PUBLISHED: $CIRCLE_SHA1"
