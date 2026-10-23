import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/**
 * Idempotent forward reconciliation migration.
 *
 * Ensures all messaging tables, columns, indexes, capability definitions, and
 * notification policies are present on databases where migration 3200_messaging_core
 * was already recorded before Meta or staff-upload extensions were introduced.
 */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists messaging;

    create table if not exists messaging.facebook_oauth_attempts (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      actor_id uuid not null references iam.users(id), membership_id uuid not null,
      state_digest text not null unique check(state_digest ~ '^[0-9a-f]{64}$'),
      status text not null default 'PENDING' check(status in ('PENDING','AUTHORIZED','CONSUMED','FAILED','EXPIRED')),
      requested_scopes text[] not null, granted_scopes text[] not null default '{}',
      authorization_ciphertext text, authorization_key_id text,
      eligible_pages jsonb not null default '[]'::jsonb check(jsonb_typeof(eligible_pages)='array'),
      error_code text, expires_at timestamptz not null, authorized_at timestamptz, consumed_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(organization_id,id),
      foreign key(organization_id,membership_id) references iam.organization_memberships(organization_id,id),
      check((authorization_ciphertext is null)=(authorization_key_id is null))
    );
    create index if not exists facebook_oauth_attempts_actor on messaging.facebook_oauth_attempts(organization_id,membership_id,created_at desc);
    create index if not exists facebook_oauth_attempts_expiry on messaging.facebook_oauth_attempts(expires_at,id) where status in ('PENDING','AUTHORIZED');

    create table if not exists messaging.facebook_connection_state (
      organization_id uuid not null references platform.organizations(id), channel_connection_id uuid not null,
      integration_account_id uuid not null, app_id text not null, page_id text not null,
      status text not null check(status in ('AUTHORIZATION_PENDING','CONNECTED','LIMITED_PERMISSIONS','WEBHOOK_INCOMPLETE','ROUTING_UNVERIFIED','NEEDS_REAUTHORIZATION','SUSPENDED','DISCONNECTED','ERROR')),
      graph_api_version text not null check(graph_api_version ~ '^v[0-9]+\\.0$'),
      granted_scopes text[] not null default '{}', required_scopes text[] not null,
      page_tasks text[] not null default '{}', subscribed_fields text[] not null default '{}',
      permission_review_status text not null default 'UNKNOWN' check(permission_review_status in ('UNKNOWN','DEVELOPMENT_ONLY','APP_REVIEW_PENDING','ADVANCED_ACCESS_CONFIRMED')),
      routing_status text not null default 'UNVERIFIED' check(routing_status in ('UNVERIFIED','OWNER_CONFIRMED','CONFLICT')),
      routing_confirmed_at timestamptz, routing_confirmed_by_actor_id uuid references iam.users(id),
      operational_status text not null default 'NOT_RUN' check(operational_status in ('NOT_RUN','PASSED','FAILED')),
      operational_checked_at timestamptz, operational_checked_by_actor_id uuid references iam.users(id),
      webhook_subscription_healthy boolean not null default false, credential_healthy boolean not null default true,
      last_webhook_at timestamptz, last_inbound_at timestamptz, last_outbound_at timestamptz,
      last_verified_at timestamptz, last_error_at timestamptz, last_error_code text,
      disconnected_at timestamptz, disconnected_by_actor_id uuid references iam.users(id),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
      primary key(organization_id,channel_connection_id), unique(channel_connection_id), unique(app_id,page_id),
      foreign key(organization_id,channel_connection_id) references messaging.channel_connections(organization_id,id),
      foreign key(organization_id,integration_account_id) references integrations.integration_accounts(organization_id,id)
    ) with (fillfactor=90);
    create index if not exists facebook_connection_health on messaging.facebook_connection_state(status,last_verified_at nulls first,channel_connection_id);

    create table if not exists messaging.instagram_oauth_attempts (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      actor_id uuid not null references iam.users(id), membership_id uuid not null,
      state_digest text not null unique check(state_digest ~ '^[0-9a-f]{64}$'),
      status text not null default 'PENDING' check(status in ('PENDING','AUTHORIZED','CONSUMED','FAILED','EXPIRED')),
      requested_scopes text[] not null, granted_scopes text[] not null default '{}',
      authorization_ciphertext text, authorization_key_id text,
      eligible_accounts jsonb not null default '[]'::jsonb check(jsonb_typeof(eligible_accounts)='array'),
      error_code text, expires_at timestamptz not null, authorized_at timestamptz, consumed_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(organization_id,id),
      foreign key(organization_id,membership_id) references iam.organization_memberships(organization_id,id),
      check((authorization_ciphertext is null)=(authorization_key_id is null))
    );
    create index if not exists instagram_oauth_attempts_actor on messaging.instagram_oauth_attempts(organization_id,membership_id,created_at desc);
    create index if not exists instagram_oauth_attempts_expiry on messaging.instagram_oauth_attempts(expires_at,id) where status in ('PENDING','AUTHORIZED');

    create table if not exists messaging.instagram_connection_state (
      organization_id uuid not null references platform.organizations(id), channel_connection_id uuid not null,
      integration_account_id uuid not null, app_id text not null, page_id text not null, page_name text not null,
      instagram_account_id text not null, username text, account_type text,
      status text not null check(status in ('AUTHORIZATION_PENDING','CONNECTED','LIMITED_PERMISSIONS','WEBHOOK_INCOMPLETE','NEEDS_REAUTHORIZATION','SUSPENDED','DISCONNECTED','ERROR')),
      authorization_method text not null default 'FACEBOOK_LOGIN' check(authorization_method='FACEBOOK_LOGIN'),
      graph_api_version text not null check(graph_api_version ~ '^v[0-9]+\\.0$'),
      granted_scopes text[] not null default '{}', required_scopes text[] not null,
      page_tasks text[] not null default '{}', subscribed_fields text[] not null default '{}',
      permission_review_status text not null default 'UNKNOWN' check(permission_review_status in ('UNKNOWN','DEVELOPMENT_ONLY','APP_REVIEW_PENDING','ADVANCED_ACCESS_CONFIRMED')),
      webhook_subscription_healthy boolean not null default false, credential_healthy boolean not null default true,
      last_webhook_at timestamptz, last_inbound_at timestamptz, last_outbound_at timestamptz,
      last_verified_at timestamptz, last_error_at timestamptz, last_error_code text,
      disconnected_at timestamptz, disconnected_by_actor_id uuid references iam.users(id),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
      primary key(organization_id,channel_connection_id), unique(channel_connection_id),
      unique(app_id,instagram_account_id),
      foreign key(organization_id,channel_connection_id) references messaging.channel_connections(organization_id,id),
      foreign key(organization_id,integration_account_id) references integrations.integration_accounts(organization_id,id)
    ) with (fillfactor=90);
    create index if not exists instagram_connection_health on messaging.instagram_connection_state(status,last_verified_at nulls first,channel_connection_id);
    create index if not exists instagram_connection_page on messaging.instagram_connection_state(app_id,page_id);

    create table if not exists messaging.provider_events (
      id bigint generated always as identity primary key,
      organization_id uuid, channel_connection_id uuid, provider text not null check(provider in ('META_MESSENGER','META_INSTAGRAM')),
      provider_account_id text not null, event_key text not null, event_type text not null,
      status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','RETRY_WAIT','PROCESSED','IGNORED','FAILED_FINAL')),
      payload jsonb not null check(jsonb_typeof(payload)='object'),
      provider_occurred_at timestamptz, received_at timestamptz not null default now(), available_at timestamptz not null default now(),
      lease_owner text, lease_expires_at timestamptz, attempt_count integer not null default 0 check(attempt_count>=0),
      max_attempts integer not null default 8 check(max_attempts between 1 and 25), last_error_code text,
      processed_at timestamptz, expires_at timestamptz not null default now()+interval '7 days',
      unique(provider,provider_account_id,event_key),
      foreign key(organization_id,channel_connection_id) references messaging.channel_connections(organization_id,id),
      check((organization_id is null)=(channel_connection_id is null))
    );
    create index if not exists provider_events_claim on messaging.provider_events(status,available_at,id) where status in ('PENDING','RETRY_WAIT');
    create index if not exists provider_events_connection on messaging.provider_events(organization_id,channel_connection_id,received_at desc) where organization_id is not null;
    create index if not exists provider_events_expiry on messaging.provider_events(expires_at,id);

    create table if not exists messaging.facebook_sync_jobs (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      channel_connection_id uuid not null, requested_by_membership_id uuid not null,
      status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','PAUSED','COMPLETED','FAILED')),
      cursor text, imported_conversations integer not null default 0 check(imported_conversations>=0),
      imported_messages integer not null default 0 check(imported_messages>=0), duplicate_messages integer not null default 0 check(duplicate_messages>=0),
      attachment_failures integer not null default 0 check(attachment_failures>=0), coverage_status text not null default 'UNKNOWN' check(coverage_status in ('UNKNOWN','PARTIAL','PROVIDER_EXHAUSTED','UNAVAILABLE')),
      error_count integer not null default 0 check(error_count>=0),
      last_error_code text, available_at timestamptz not null default now(), lease_owner text, lease_expires_at timestamptz,
      started_at timestamptz, completed_at timestamptz, last_successful_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(organization_id,id),
      foreign key(organization_id,channel_connection_id) references messaging.channel_connections(organization_id,id),
      foreign key(organization_id,requested_by_membership_id) references iam.organization_memberships(organization_id,id)
    );
    create unique index if not exists facebook_sync_one_active on messaging.facebook_sync_jobs(organization_id,channel_connection_id) where status in ('PENDING','PROCESSING','PAUSED');
    create index if not exists facebook_sync_claim on messaging.facebook_sync_jobs(status,available_at,id) where status in ('PENDING','PROCESSING');

    create table if not exists messaging.instagram_sync_jobs (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      channel_connection_id uuid not null, requested_by_membership_id uuid not null,
      status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','PAUSED','COMPLETED','FAILED')),
      cursor jsonb,
      imported_conversations integer not null default 0 check(imported_conversations>=0),
      imported_messages integer not null default 0 check(imported_messages>=0), duplicate_messages integer not null default 0 check(duplicate_messages>=0),
      attachment_failures integer not null default 0 check(attachment_failures>=0), coverage_status text not null default 'UNKNOWN' check(coverage_status in ('UNKNOWN','PARTIAL','PROVIDER_EXHAUSTED','UNAVAILABLE')),
      error_count integer not null default 0 check(error_count>=0), last_error_code text,
      available_at timestamptz not null default now(), lease_owner text, lease_expires_at timestamptz,
      started_at timestamptz, completed_at timestamptz, last_successful_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(organization_id,id),
      foreign key(organization_id,channel_connection_id) references messaging.channel_connections(organization_id,id),
      foreign key(organization_id,requested_by_membership_id) references iam.organization_memberships(organization_id,id)
    );
    create unique index if not exists instagram_sync_one_active on messaging.instagram_sync_jobs(organization_id,channel_connection_id) where status in ('PENDING','PROCESSING','PAUSED');
    create index if not exists instagram_sync_claim on messaging.instagram_sync_jobs(status,available_at,id) where status in ('PENDING','PROCESSING');

    create table if not exists messaging.staff_attachment_uploads (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      conversation_id uuid not null, actor_id uuid not null references iam.users(id),
      media_asset_id uuid not null, media_upload_session_id uuid not null,
      expires_at timestamptz not null, attached_message_id uuid,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(organization_id,id), unique(organization_id,media_asset_id), unique(organization_id,media_upload_session_id),
      foreign key(organization_id,conversation_id) references messaging.conversations(organization_id,id),
      foreign key(organization_id,media_asset_id) references media.media_assets(organization_id,id),
      foreign key(organization_id,media_upload_session_id) references media.media_upload_sessions(organization_id,id),
      foreign key(organization_id,attached_message_id) references messaging.messages(organization_id,id)
    );
    create index if not exists staff_attachment_uploads_owner on messaging.staff_attachment_uploads(organization_id,actor_id,conversation_id,created_at desc);
    create index if not exists staff_attachment_uploads_cleanup on messaging.staff_attachment_uploads(expires_at,id) where attached_message_id is null;

    insert into iam.capability_definitions(capability_code,domain,description,sensitivity,supported_scope_types,status) values
      ('messaging.connections.view','messaging','View provider connection health and diagnostics.','RESTRICTED','{}','ACTIVE'),
      ('messaging.connections.manage','messaging','Authorize, connect, verify, synchronize and disconnect provider accounts.','CRITICAL','{}','ACTIVE')
    on conflict(capability_code) do update set description=excluded.description,status='ACTIVE';

    insert into iam.membership_capability_grants(membership_id,capability_code)
      select m.id,c.code from iam.organization_memberships m cross join(values
        ('messaging.connections.view'),('messaging.connections.manage')
      ) c(code) where m.membership_type='OWNER' and m.status='ACTIVE' on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  // Reconciliation is non-destructive
}
