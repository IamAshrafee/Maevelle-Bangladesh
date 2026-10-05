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
      access_version bigint not null default 1 check (access_version > 0),
      invited_at timestamptz,
      activated_at timestamptz,
      disabled_at timestamptz,
      removed_at timestamptz,
      lifecycle_reason text,
      lifecycle_changed_by uuid references iam.users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, user_id),
      unique (organization_id, id)
    );
    create unique index organization_single_owner on iam.organization_memberships (organization_id) where membership_type = 'OWNER' and status = 'ACTIVE';
    create index memberships_active_user on iam.organization_memberships (user_id, organization_id) where status = 'ACTIVE';

    create table iam.capability_definitions (
      capability_code text primary key,
      domain text not null,
      description text not null,
      sensitivity text not null check (sensitivity in ('INTERNAL', 'HIGH', 'CRITICAL', 'RESTRICTED')),
      supported_scope_types text[] not null default '{}',
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DEPRECATED')),
      check (capability_code ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$')
    );
    insert into iam.capability_definitions
      (capability_code, domain, description, sensitivity, supported_scope_types)
    values
      ('admin.team.view', 'identity-access', 'View organization memberships, invitations, and access assignments.', 'INTERNAL', '{}'),
      ('admin.team.invite', 'identity-access', 'Invite a person and resend or revoke pending invitations.', 'HIGH', '{}'),
      ('admin.team.permissions.manage', 'identity-access', 'Replace a member''s direct capabilities and resource scopes.', 'CRITICAL', '{}'),
      ('admin.team.lifecycle.manage', 'identity-access', 'Suspend, restore, or remove non-Owner memberships.', 'CRITICAL', '{}'),
      ('admin.team.owner.transfer', 'identity-access', 'Transfer the protected primary Owner relationship.', 'CRITICAL', '{}'),
      ('admin.team.sessions.revoke', 'identity-access', 'Revoke active administrator sessions.', 'HIGH', '{}'),
      ('admin.team.two_factor.reset', 'identity-access', 'Reset a non-Owner member''s authenticator enrollment after strong verification.', 'RESTRICTED', '{}'),
      ('admin.security.two_factor_policy.manage', 'identity-access', 'Change organization-wide authenticator enrollment requirements.', 'RESTRICTED', '{}'),
      ('admin.team.manage', 'identity-access', 'Deprecated broad team-management capability retained for migration visibility.', 'CRITICAL', '{}');
    update iam.capability_definitions set status = 'DEPRECATED' where capability_code = 'admin.team.manage';
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
      scope_type text not null check (scope_type in ('LOCATION')),
      scope_id uuid not null,
      created_at timestamptz not null default now(),
      unique nulls not distinct (membership_id, capability_code, scope_type, scope_id),
      foreign key (organization_id, membership_id) references iam.organization_memberships(organization_id, id)
    );
    create index membership_scopes_lookup on iam.membership_scopes (membership_id, capability_code, scope_type, scope_id);

    create table iam.organization_two_factor_policies (
      organization_id uuid primary key references platform.organizations(id) on delete cascade,
      enforcement_mode text not null default 'OPTIONAL'
        check (enforcement_mode in ('OPTIONAL', 'CRITICAL_CAPABILITIES', 'ALL_MEMBERS')),
      grace_period_hours integer not null default 168 check (grace_period_hours between 0 and 720),
      enforcement_started_at timestamptz,
      updated_by_actor_id uuid references iam.users(id),
      updated_at timestamptz not null default now(),
      version bigint not null default 1 check (version > 0),
      check ((enforcement_mode = 'OPTIONAL') = (enforcement_started_at is null))
    );

    create table iam.membership_invitations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      email text not null,
      email_normalized text not null,
      display_name text not null,
      token_hash text not null unique,
      token_prefix text not null,
      encrypted_delivery_token text,
      idempotency_key text,
      request_fingerprint text,
      status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
      invited_by_membership_id uuid not null,
      accepted_by_user_id uuid references iam.users(id),
      accepted_membership_id uuid references iam.organization_memberships(id),
      expires_at timestamptz not null,
      last_sent_at timestamptz,
      delivery_attempt_count integer not null default 0 check (delivery_attempt_count >= 0),
      delivery_lease_until timestamptz,
      last_delivery_error_code text,
      accepted_at timestamptz,
      revoked_at timestamptz,
      revoked_by_membership_id uuid references iam.organization_memberships(id),
      revoke_reason text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1 check (version > 0),
      foreign key (organization_id, invited_by_membership_id) references iam.organization_memberships(organization_id, id),
      check (expires_at > created_at),
      check ((status = 'ACCEPTED') = (accepted_at is not null)),
      check ((status = 'REVOKED') = (revoked_at is not null))
    );
    create unique index membership_invitations_pending_email
      on iam.membership_invitations (organization_id, email_normalized) where status = 'PENDING';
    create unique index membership_invitations_idempotency
      on iam.membership_invitations (organization_id, invited_by_membership_id, idempotency_key)
      where idempotency_key is not null;
    create index membership_invitations_pending_delivery
      on iam.membership_invitations (delivery_lease_until, created_at, id) where status = 'PENDING' and encrypted_delivery_token is not null;
    create index membership_invitations_expiry
      on iam.membership_invitations (expires_at, id) where status = 'PENDING';
    create table iam.membership_invitation_capabilities (
      invitation_id uuid not null references iam.membership_invitations(id) on delete cascade,
      capability_code text not null references iam.capability_definitions(capability_code),
      primary key (invitation_id, capability_code)
    );
    create table iam.membership_invitation_scopes (
      id uuid primary key default uuidv7(),
      invitation_id uuid not null references iam.membership_invitations(id) on delete cascade,
      capability_code text references iam.capability_definitions(capability_code),
      scope_type text not null check (scope_type in ('LOCATION')),
      scope_id uuid not null,
      unique nulls not distinct (invitation_id, capability_code, scope_type, scope_id)
    );
    create table iam.membership_invitation_delivery_attempts (
      id bigint generated always as identity primary key,
      invitation_id uuid not null references iam.membership_invitations(id),
      attempt_number integer not null check (attempt_number > 0),
      provider text not null,
      status text not null check (status in ('SENT', 'FAILED')),
      provider_reference text,
      error_code text,
      attempted_at timestamptz not null default now(),
      unique (invitation_id, attempt_number)
    );

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
      user_id uuid not null unique references iam.users(id) on delete cascade,
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
