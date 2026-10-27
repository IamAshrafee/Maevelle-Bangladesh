#!/usr/bin/env bash
set -euo pipefail
set +x

usage() {
  echo 'Usage: staging-migrate.sh status|preflight|apply --image ghcr.io/...@sha256:<digest> --env-file /private/staging.env [--confirm maevelle_staging]' >&2
  exit 2
}

ACTION="${1:-}"
[[ "$ACTION" == status || "$ACTION" == preflight || "$ACTION" == apply ]] || usage
shift
IMAGE=''
ENV_FILE=''
CONFIRM=''
while (($#)); do
  case "$1" in
    --image) IMAGE="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --confirm) CONFIRM="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[[ "$IMAGE" =~ ^ghcr\.io/iamashrafee/maevelle-api@sha256:[a-f0-9]{64}$ ]] || usage
[[ "$ENV_FILE" == /home/maevelle/deployment/secrets/staging.env && -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || usage
[[ "$(id -un)" == maevelle ]] || { echo 'Refusing: run as the maevelle deployment user.' >&2; exit 1; }
MODE="$(stat -c %a "$ENV_FILE")"
[[ "$(stat -c %u "$ENV_FILE")" == "$(id -u)" ]] && (( (8#$MODE & 077) == 0 )) || {
  echo 'Refusing: staging.env must be owned by maevelle without group/other access.' >&2
  exit 1
}
[[ "$(podman info --format '{{.Host.Security.Rootless}}')" == true ]] || { echo 'Refusing: Podman must be rootless.' >&2; exit 1; }
podman network exists maevelle-staging || { echo 'Maevelle staging network is missing.' >&2; exit 1; }
podman container exists maevelle-staging-postgres || { echo 'Maevelle staging PostgreSQL container is missing.' >&2; exit 1; }
[[ "$(podman inspect --format '{{.State.Running}}' maevelle-staging-postgres)" == true ]] || { echo 'Maevelle staging PostgreSQL is stopped.' >&2; exit 1; }

LOCK_FILE="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/maevelle-staging-migration.lock"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo 'Another Maevelle migration/deployment operation holds the lock.' >&2; exit 1; }

if [[ "$ACTION" == apply ]]; then
  podman image exists "$IMAGE" || podman pull "$IMAGE" >/dev/null
else
  podman image exists "$IMAGE" || {
    echo 'Selected API image is not present locally; status/preflight will not pull it.' >&2
    exit 1
  }
fi
run_image() {
  podman run --rm --network maevelle-staging --env-file "$ENV_FILE" \
    --entrypoint node "$IMAGE" "$@"
}

# Read the protected env only inside the container. Never print the URL.
run_image -e '
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is missing");
  const url = new URL(raw);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("Expected PostgreSQL URL");
  if (url.hostname !== "maevelle-staging-postgres" || url.pathname !== "/maevelle_staging")
    throw new Error("DATABASE_URL does not target Maevelle staging PostgreSQL");
  console.log("Target identity: maevelle-staging-postgres/maevelle_staging");
'
run_image /app/scripts/check-migration-history.mjs
echo 'Migration ledger:'
run_image /app/packages/database/dist/src/migrate-cli.js --status
if [[ "$ACTION" == preflight ]]; then
  echo 'Preflight complete; no migration applied.'
fi

if [[ "$ACTION" == apply ]]; then
  [[ "$CONFIRM" == maevelle_staging ]] || { echo 'Apply requires --confirm maevelle_staging.' >&2; exit 2; }
  echo 'Applying pending migrations once from the selected digest.'
  run_image /app/packages/database/dist/src/migrate-cli.js || {
    echo 'Migration failed. Application units were not changed; inspect the database and job logs before retry.' >&2
    exit 1
  }
  run_image /app/packages/database/dist/src/migrate-cli.js --status
fi
