import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/**
 * Better Auth 1.6.25 reconciliation. We use its field/model mapping to the
 * canonical iam namespace; migrations remain Maevelle-owned and SQL-first.
 */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists iam;
    create table iam.users (
      id uuid primary key default uuidv7(),
      name text not null,
      email text not null,
      email_normalized text not null unique,
      email_verified boolean not null default false,
      image text,
      password_hash text,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED', 'LOCKED')),
      last_login_at timestamptz,
      two_factor_enabled boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1
    );
    create unique index users_email_unique on iam.users (email_normalized);

    create table iam.organization_memberships (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      user_id uuid not null references iam.users(id),
      membership_type text not null check (membership_type in ('OWNER', 'STANDARD')),
      status text not null check (status in ('INVITED', 'ACTIVE', 'DISABLED', 'EXPIRED_INVITE', 'REMOVED')),
      display_name text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, user_id)
    );
    create unique index organization_single_owner on iam.organization_memberships (organization_id) where membership_type = 'OWNER' and status = 'ACTIVE';
    create index memberships_active_user on iam.organization_memberships (user_id, organization_id) where status = 'ACTIVE';

    create table iam.capability_definitions (
      capability_code text primary key,
      domain text not null,
      description text not null,
      sensitivity text not null
    );
    create table iam.permission_presets (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      name text not null,
      description text,
      is_system_default boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, name)
    );
    create table iam.permission_preset_capabilities (
      preset_id uuid not null references iam.permission_presets(id),
      capability_code text not null references iam.capability_definitions(capability_code),
      primary key (preset_id, capability_code)
    );
    create table iam.membership_capability_grants (
      membership_id uuid not null references iam.organization_memberships(id),
      capability_code text not null references iam.capability_definitions(capability_code),
      created_at timestamptz not null default now(),
      created_by uuid references iam.users(id),
      primary key (membership_id, capability_code)
    );
    create table iam.membership_scopes (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      membership_id uuid not null references iam.organization_memberships(id),
      capability_code text references iam.capability_definitions(capability_code),
      scope_type text not null,
      scope_id uuid not null,
      created_at timestamptz not null default now()
    );
    create index membership_scopes_lookup on iam.membership_scopes (membership_id, capability_code, scope_type, scope_id);

    create table iam.auth_accounts (
      id uuid primary key default uuidv7(),
      account_id text not null,
      provider_id text not null,
      user_id uuid not null references iam.users(id),
      access_token text,
      refresh_token text,
      id_token text,
      access_token_expires_at timestamptz,
      refresh_token_expires_at timestamptz,
      scope text,
      password text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (provider_id, account_id)
    );
    create index auth_accounts_user_id on iam.auth_accounts (user_id);
    create table iam.auth_verifications (
      id uuid primary key default uuidv7(),
      identifier text not null,
      value text not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index auth_verifications_identifier on iam.auth_verifications (identifier);
    create table iam.auth_two_factor (
      id uuid primary key default uuidv7(),
      user_id uuid not null unique references iam.users(id),
      secret text not null,
      backup_codes text not null,
      verified boolean not null default true,
      failed_verification_count integer not null default 0,
      locked_until timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table iam.auth_kv_store (
      key_hash text primary key,
      encrypted_value bytea,
      counter_value bigint,
      expires_at timestamptz,
      key_version smallint not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (encrypted_value is not null or counter_value is not null)
    );
    create index auth_kv_store_expiry on iam.auth_kv_store (expires_at) where expires_at is not null;
    create table iam.sessions (
      id uuid primary key default uuidv7(),
      user_id uuid not null references iam.users(id),
      membership_id uuid references iam.organization_memberships(id),
      token_hash text not null unique,
      authentication_level text not null,
      created_at timestamptz not null default now(),
      last_activity_at timestamptz not null default now(),
      expires_at timestamptz not null,
      revoked_at timestamptz,
      revocation_reason text,
      ip_address text,
      user_agent text
    );
    create index sessions_active_user on iam.sessions (user_id, expires_at) where revoked_at is null;

    create table iam.service_accounts (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      name text not null,
      status text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1
    );
    create table iam.api_credentials (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      service_account_id uuid not null references iam.service_accounts(id),
      credential_prefix text not null,
      secret_hash text not null,
      status text not null,
      expires_at timestamptz,
      last_used_at timestamptz,
      created_at timestamptz not null default now(),
      revoked_at timestamptz
    );
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Identity records are not removed automatically.');
}
