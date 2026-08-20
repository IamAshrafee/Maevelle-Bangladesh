import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists platform;

    create table platform.organizations (
      id uuid primary key default uuidv7(),
      code text not null unique,
      display_name text not null,
      legal_name text,
      country_code char(2),
      timezone text not null,
      default_locale text not null,
      default_currency char(3) not null,
      status text not null check (status in ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
      configuration_version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1
    );

    create table platform.number_sequences (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      sequence_type text not null,
      prefix text not null,
      counter_value bigint not null check (counter_value >= 0),
      reset_policy text not null check (reset_policy in ('NEVER', 'YEARLY')),
      sequence_year integer,
      padding integer not null check (padding between 1 and 20),
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check ((reset_policy = 'YEARLY' and sequence_year is not null) or (reset_policy = 'NEVER' and sequence_year is null))
    );
    create unique index number_sequences_unique_yearly on platform.number_sequences (organization_id, sequence_type, sequence_year) where sequence_year is not null;
    create unique index number_sequences_unique_never on platform.number_sequences (organization_id, sequence_type) where sequence_year is null;

    create table platform.configuration_values (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      configuration_key text not null,
      scope_type text not null,
      scope_id uuid,
      value_json jsonb not null,
      definition_version integer not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1
    );
    create unique index configuration_values_unique_global on platform.configuration_values (organization_id, configuration_key, scope_type) where scope_id is null;
    create unique index configuration_values_unique_scoped on platform.configuration_values (organization_id, configuration_key, scope_type, scope_id) where scope_id is not null;

    create table platform.configuration_change_sets (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      actor_type text not null,
      actor_id uuid,
      reason text,
      created_at timestamptz not null default now()
    );
    create table platform.configuration_changes (
      id bigint generated always as identity primary key,
      change_set_id uuid not null references platform.configuration_change_sets(id),
      configuration_key text not null,
      scope_type text not null,
      scope_id uuid,
      old_value jsonb,
      new_value jsonb,
      created_at timestamptz not null default now()
    );

    create table platform.idempotency_records (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      principal_type text not null,
      principal_id uuid,
      operation_type text not null,
      idempotency_key text not null,
      request_fingerprint text not null,
      status text not null check (status in ('IN_PROGRESS', 'SUCCEEDED', 'FAILED_FINAL')),
      result_entity_type text,
      result_entity_id uuid,
      safe_response jsonb,
      created_at timestamptz not null default now(),
      completed_at timestamptz,
      expires_at timestamptz
    );
    create unique index idempotency_records_unique_request on platform.idempotency_records (organization_id, principal_type, principal_id, operation_type, idempotency_key) nulls not distinct;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Platform core is append-only migration history and has no automatic down migration.',
  );
}
