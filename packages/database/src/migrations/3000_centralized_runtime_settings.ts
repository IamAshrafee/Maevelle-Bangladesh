import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists settings;

    create table if not exists settings.runtime_settings (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id) on delete cascade,
      module text not null,
      setting_key text not null,
      scope_type text not null default 'ORGANIZATION' check (scope_type in ('ORGANIZATION', 'SYSTEM')),
      value_json jsonb not null,
      is_secret boolean not null default false,
      version bigint not null default 1,
      updated_by uuid references iam.users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint runtime_settings_org_key_unique unique (organization_id, setting_key)
    );

    create index if not exists runtime_settings_org_module_idx
      on settings.runtime_settings (organization_id, module, setting_key);

    create table if not exists settings.integration_secrets (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id) on delete cascade,
      provider_code text not null,
      secret_key_name text not null,
      secret_ciphertext text not null,
      secret_key_id text not null,
      version bigint not null default 1,
      updated_by uuid references iam.users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint integration_secrets_org_provider_key_unique unique (organization_id, provider_code, secret_key_name)
    );

    create index if not exists integration_secrets_org_provider_idx
      on settings.integration_secrets (organization_id, provider_code);

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity)
    values
      ('settings.manage', 'settings', 'Manage general application settings.', 'HIGH'),
      ('settings.email.manage', 'settings', 'Manage transactional email configuration and provider policies.', 'HIGH'),
      ('settings.sms.manage', 'settings', 'Manage transactional SMS business settings and sender preferences.', 'HIGH'),
      ('settings.media.manage', 'settings', 'Manage media upload size, storage policies, and asset retention.', 'HIGH'),
      ('settings.storefront.manage', 'settings', 'Manage storefront public branding, URLs, and communication metadata.', 'INTERNAL'),
      ('settings.integrations.manage', 'settings', 'Manage external service integration secrets and credentials.', 'CRITICAL')
    on conflict (capability_code) do update set
      description = excluded.description,
      sensitivity = excluded.sensitivity;

    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (
        values
          ('settings.manage'),
          ('settings.email.manage'),
          ('settings.sms.manage'),
          ('settings.media.manage'),
          ('settings.storefront.manage'),
          ('settings.integrations.manage')
      ) as capability(capability_code)
      where membership.membership_type = 'OWNER'
        and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Settings baseline is forward-only development history and has no automatic down migration.');
}
