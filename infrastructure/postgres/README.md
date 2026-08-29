# Local PostgreSQL

Start the PostgreSQL 18 development service with:

```sh
pnpm db:up
```

The service listens only on `127.0.0.1:${POSTGRES_PORT:-5434}`. Its default
databases are `maevelle_dev` and `maevelle_test`; connection-string examples
are in the root `.env.example`.

The named `postgres_data` volume preserves data across normal container
recreation. To intentionally erase all local PostgreSQL data, run
`docker compose down --volumes` from the repository root, then start the
service again. This is destructive and must never be used for production.

During the current solo heavy-development phase, the migration set is a mutable
schema baseline. Prefer updating the relevant existing domain migration and
rebuilding this disposable volume instead of writing incremental migrations
whose only purpose is to preserve local development data. See the repository
[development working policy](../../docs/development-working-policy.md). This
exception ends when any real or shared dataset must survive schema upgrades.

`pg_stat_statements` is preloaded at the server level so TASK-018 can create
the extension through its migration. This baseline creates no extensions,
schemas, tables, or Maevelle migrations.
