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

`pg_stat_statements` is preloaded at the server level so TASK-018 can create
the extension through its migration. This baseline creates no extensions,
schemas, tables, or Maevelle migrations.
