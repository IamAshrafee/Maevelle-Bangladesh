#!/bin/sh
set -eu

if [ "$POSTGRES_DB" = "$POSTGRES_TEST_DB" ]; then
  echo 'POSTGRES_TEST_DB must differ from POSTGRES_DB.' >&2
  exit 1
fi

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set ON_ERROR_STOP=1 \
  --set test_database="$POSTGRES_TEST_DB" <<'SQL'
SELECT format('CREATE DATABASE %I', :'test_database')
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = :'test_database'
) \gexec
SQL
