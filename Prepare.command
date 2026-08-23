#!/bin/bash
set -Eeuo pipefail
cd "$(dirname "$0")"
exec node scripts/local-environment.mjs prepare "$@"
