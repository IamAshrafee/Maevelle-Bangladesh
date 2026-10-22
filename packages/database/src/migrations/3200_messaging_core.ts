import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Channel-neutral messaging truth, durable delivery, and replayable staff events. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists messaging;

    create table messaging.channel_connections (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      channel_kind text not null check(channel_kind in ('WEBSITE','FACEBOOK','INSTAGRAM')),
      display_name text not null check(length(trim(display_name)) between 1 and 160),
      status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','DEGRADED','DISCONNECTED','DISABLED')),
      provider_account_id text, integration_account_id uuid,
      capability_snapshot jsonb not null default '{}'::jsonb check(jsonb_typeof(capability_snapshot)='object'),
      configuration jsonb not null default '{}'::jsonb check(jsonb_typeof(configuration)='object'),
      last_healthy_at timestamptz, last_error_at timestamptz, last_error_code text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
      unique(organization_id,id), unique(organization_id,id,channel_kind),
      foreign key(organization_id,integration_account_id) references integrations.integration_accounts(organization_id,id)
    );
    create unique index channel_connections_website on messaging.channel_connections(organization_id,channel_kind) where channel_kind='WEBSITE';
    create unique index channel_connections_provider on messaging.channel_connections(organization_id,channel_kind,provider_account_id) where provider_account_id is not null;
    create unique index channel_connections_meta_account_owner on messaging.channel_connections(channel_kind,provider_account_id)
      where channel_kind in ('FACEBOOK','INSTAGRAM') and provider_account_id is not null and status<>'DISCONNECTED';
    create index channel_connections_status on messaging.channel_connections(organization_id,status,channel_kind);

    create table messaging.facebook_oauth_attempts (
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
    create index facebook_oauth_attempts_actor on messaging.facebook_oauth_attempts(organization_id,membership_id,created_at desc);
    create index facebook_oauth_attempts_expiry on messaging.facebook_oauth_attempts(expires_at,id) where status in ('PENDING','AUTHORIZED');

    create table messaging.facebook_connection_state (
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
    create index facebook_connection_health on messaging.facebook_connection_state(status,last_verified_at nulls first,channel_connection_id);

    create table messaging.contacts (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      display_name text check(display_name is null or length(trim(display_name)) between 1 and 160),
      customer_id uuid, link_status text not null default 'UNLINKED' check(link_status in ('UNLINKED','LINKED','DISPUTED','UNLINKED_BY_POLICY')),
      linked_at timestamptz, linked_by_actor_id uuid,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
      unique(organization_id,id), foreign key(organization_id,customer_id) references customers.customers(organization_id,id),
      check(link_status<>'LINKED' or customer_id is not null)
    );
    create index contacts_customer on messaging.contacts(organization_id,customer_id,updated_at desc) where customer_id is not null;
    create index contacts_name on messaging.contacts(organization_id,lower(display_name)) where display_name is not null;
    create index contacts_name_trgm on messaging.contacts using gin(lower(display_name) gin_trgm_ops) where display_name is not null;

    create table messaging.contact_identities (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), contact_id uuid not null,
      channel_kind text not null check(channel_kind in ('WEBSITE','FACEBOOK','INSTAGRAM')), channel_connection_id uuid not null,
      external_subject_id text not null check(length(external_subject_id) between 1 and 255), display_name text, username text, avatar_url text,
      verification_status text not null default 'UNVERIFIED' check(verification_status in ('CHANNEL_ASSERTED','MAEVELLE_VERIFIED','UNVERIFIED','REVOKED')),
      profile_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(profile_metadata)='object'),
      first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(organization_id,id), unique(organization_id,id,contact_id,channel_connection_id), unique(organization_id,channel_connection_id,external_subject_id),
      foreign key(organization_id,contact_id) references messaging.contacts(organization_id,id),
      foreign key(organization_id,channel_connection_id) references messaging.channel_connections(organization_id,id)
    );
    create index contact_identities_contact on messaging.contact_identities(organization_id,contact_id,last_seen_at desc);
    create index contact_identities_display_trgm on messaging.contact_identities using gin(lower(display_name) gin_trgm_ops) where display_name is not null;
    create index contact_identities_username_trgm on messaging.contact_identities using gin(lower(username) gin_trgm_ops) where username is not null;

    create table messaging.visitor_sessions (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      channel_connection_id uuid not null, contact_identity_id uuid not null,
      credential_digest bytea not null check(octet_length(credential_digest)=32),
      status text not null default 'ACTIVE' check(status in ('ACTIVE','ROTATED','REVOKED','EXPIRED')),
      issued_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
      expires_at timestamptz not null, absolute_expires_at timestamptz not null,
      rotated_to_session_id uuid, revoked_at timestamptz, revocation_reason text,
      created_at timestamptz not null default now(),
      unique(organization_id,id),
      foreign key(organization_id,channel_connection_id) references messaging.channel_connections(organization_id,id),
      foreign key(organization_id,contact_identity_id) references messaging.contact_identities(organization_id,id),
      check(expires_at>issued_at and absolute_expires_at>=expires_at),
      check((status in ('ROTATED','REVOKED'))=(revoked_at is not null)),
      check(status<>'ROTATED' or rotated_to_session_id is not null)
    );
    alter table messaging.visitor_sessions add constraint visitor_sessions_rotation_fk
      foreign key(organization_id,rotated_to_session_id) references messaging.visitor_sessions(organization_id,id);
    create index visitor_sessions_identity on messaging.visitor_sessions(organization_id,contact_identity_id,last_seen_at desc);
    create index visitor_sessions_expiry on messaging.visitor_sessions(expires_at,id) where status='ACTIVE';
    create index visitor_sessions_rotated_to on messaging.visitor_sessions(organization_id,rotated_to_session_id) where rotated_to_session_id is not null;

    create table messaging.contact_customer_link_events (
      id bigint generated always as identity primary key, organization_id uuid not null references platform.organizations(id), contact_id uuid not null, customer_id uuid,
      action text not null check(action in ('LINKED','UNLINKED','REJECTED')), method text not null check(method in ('AUTHENTICATED_ACCOUNT','VERIFIED_EMAIL','VERIFIED_PHONE','STAFF_REVIEW','CUSTOMER_MERGE','PRIVACY_ACTION')),
      actor_type text not null, actor_id uuid, evidence_reference text, reason text, created_at timestamptz not null default now(),
      foreign key(organization_id,contact_id) references messaging.contacts(organization_id,id),
      foreign key(organization_id,customer_id) references customers.customers(organization_id,id)
    );
    create index contact_link_events_contact on messaging.contact_customer_link_events(organization_id,contact_id,created_at desc);
    create index contact_link_events_customer on messaging.contact_customer_link_events(organization_id,customer_id,created_at desc);

    create table messaging.conversations (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), channel_connection_id uuid not null,
      channel_kind text not null check(channel_kind in ('WEBSITE','FACEBOOK','INSTAGRAM')),
      contact_id uuid not null, contact_identity_id uuid not null,
      provider_conversation_id text, status text not null default 'NEW' check(status in ('NEW','OPEN','PENDING','RESOLVED','CLOSED')),
      priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','URGENT')),
      assignee_membership_id uuid, assigned_at timestamptz, assigned_by_membership_id uuid, is_starred boolean not null default false,
      next_message_sequence bigint not null default 1 check(next_message_sequence>0), last_message_sequence bigint not null default 0 check(last_message_sequence>=0), last_message_id uuid,
      last_message_at timestamptz, last_inbound_at timestamptz, last_outbound_at timestamptz, resolved_at timestamptz, closed_at timestamptz, reply_eligible_until timestamptz,
      subject text check(subject is null or length(trim(subject)) between 1 and 240), context jsonb not null default '{}'::jsonb check(jsonb_typeof(context)='object'),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
      unique(organization_id,id), foreign key(organization_id,channel_connection_id,channel_kind) references messaging.channel_connections(organization_id,id,channel_kind),
      foreign key(organization_id,contact_id) references messaging.contacts(organization_id,id), foreign key(organization_id,contact_identity_id) references messaging.contact_identities(organization_id,id),
      foreign key(organization_id,contact_identity_id,contact_id,channel_connection_id) references messaging.contact_identities(organization_id,id,contact_id,channel_connection_id),
      foreign key(organization_id,assignee_membership_id) references iam.organization_memberships(organization_id,id),
      foreign key(organization_id,assigned_by_membership_id) references iam.organization_memberships(organization_id,id),
      check((status='RESOLVED')=(resolved_at is not null)), check((status='CLOSED')=(closed_at is not null))
    );
    create unique index conversations_provider on messaging.conversations(organization_id,channel_connection_id,provider_conversation_id) where provider_conversation_id is not null;
    create index conversations_inbox on messaging.conversations(organization_id,status,last_message_at desc nulls last,id desc);
    create index conversations_mine on messaging.conversations(organization_id,assignee_membership_id,status,last_message_at desc nulls last,id desc);
    create index conversations_unassigned on messaging.conversations(organization_id,last_message_at desc nulls last,id desc) where assignee_membership_id is null and status in ('NEW','OPEN','PENDING');
    create index conversations_channel on messaging.conversations(organization_id,channel_connection_id,status,last_message_at desc nulls last,id desc);
    create index conversations_contact on messaging.conversations(organization_id,contact_id,last_message_at desc nulls last);
    create index conversations_identity on messaging.conversations(organization_id,contact_identity_id);
    create index conversations_assigned_by on messaging.conversations(organization_id,assigned_by_membership_id) where assigned_by_membership_id is not null;
    create unique index conversations_website_active on messaging.conversations(organization_id,channel_connection_id,contact_identity_id)
      where channel_kind='WEBSITE' and status in ('NEW','OPEN','PENDING','RESOLVED');
    create unique index conversations_facebook_active on messaging.conversations(organization_id,channel_connection_id,contact_identity_id)
      where channel_kind='FACEBOOK' and status in ('NEW','OPEN','PENDING','RESOLVED');

    create table messaging.conversation_context_events (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id), conversation_id uuid not null,
      contact_identity_id uuid not null,
      context_type text not null check(context_type in ('HOME','PRODUCT','CATEGORY','CART','CHECKOUT','OTHER')),
      url_path text not null check(length(url_path) between 1 and 500 and left(url_path,1)='/'),
      product_id uuid, variant_id uuid, product_title text check(product_title is null or length(product_title)<=240),
      metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
      created_at timestamptz not null default now(),
      foreign key(organization_id,conversation_id) references messaging.conversations(organization_id,id),
      foreign key(organization_id,contact_identity_id) references messaging.contact_identities(organization_id,id),
      foreign key(organization_id,product_id) references catalog.products(organization_id,id),
      foreign key(organization_id,product_id,variant_id) references catalog.product_variants(organization_id,product_id,id),
      check(variant_id is null or product_id is not null)
    );
    create index conversation_context_history on messaging.conversation_context_events(organization_id,conversation_id,created_at desc,id desc);

    create table messaging.messages (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), conversation_id uuid not null, sequence bigint not null check(sequence>0),
      direction text not null check(direction in ('INBOUND','OUTBOUND','INTERNAL')), sender_type text not null check(sender_type in ('CONTACT','STAFF','SYSTEM','PROVIDER')),
      sender_membership_id uuid, sender_contact_identity_id uuid, message_type text not null check(message_type in ('TEXT','ATTACHMENT','MIXED','SYSTEM_EVENT')),
      text_body text check(text_body is null or length(trim(text_body)) between 1 and 10000), structured_payload jsonb not null default '{}'::jsonb check(jsonb_typeof(structured_payload)='object'),
      provider_message_id text, client_message_id text check(client_message_id is null or length(client_message_id)<=160), reply_to_message_id uuid,
      delivery_state text not null check(delivery_state in ('RECEIVED','QUEUED','SENDING','SENT','DELIVERED','READ','FAILED_TRANSIENT','FAILED_PERMANENT','UNKNOWN')),
      provider_created_at timestamptz, accepted_at timestamptz not null default now(), sent_at timestamptz, delivered_at timestamptz, read_at timestamptz, failed_at timestamptz,
      failure_code text, failure_summary text, edited_at timestamptz, retracted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(organization_id,id), unique(organization_id,conversation_id,id), unique(conversation_id,sequence),
      foreign key(organization_id,conversation_id) references messaging.conversations(organization_id,id),
      foreign key(organization_id,sender_membership_id) references iam.organization_memberships(organization_id,id),
      foreign key(organization_id,sender_contact_identity_id) references messaging.contact_identities(organization_id,id),
      foreign key(organization_id,conversation_id,reply_to_message_id) references messaging.messages(organization_id,conversation_id,id),
      check((sender_type='STAFF')=(sender_membership_id is not null)),
      check((sender_type='CONTACT')=(sender_contact_identity_id is not null)),
      check(message_type='SYSTEM_EVENT' or text_body is not null or message_type in ('ATTACHMENT','MIXED'))
    );
    create unique index messages_client on messaging.messages(organization_id,conversation_id,client_message_id) where client_message_id is not null;
    create index messages_history on messaging.messages(organization_id,conversation_id,sequence desc);
    create index messages_sender_membership on messaging.messages(organization_id,sender_membership_id) where sender_membership_id is not null;
    create index messages_sender_identity on messaging.messages(organization_id,sender_contact_identity_id) where sender_contact_identity_id is not null;
    create index messages_reply_to on messaging.messages(organization_id,reply_to_message_id) where reply_to_message_id is not null;
    create index messages_delivery on messaging.messages(organization_id,delivery_state,created_at) where direction='OUTBOUND' and delivery_state in ('QUEUED','SENDING','FAILED_TRANSIENT','UNKNOWN');
    create index messages_search_trgm on messaging.messages using gin(lower(text_body) gin_trgm_ops) where text_body is not null and direction<>'INTERNAL';
    alter table messaging.conversations add constraint conversations_last_message_fk foreign key(organization_id,last_message_id) references messaging.messages(organization_id,id) deferrable initially deferred;

    create table messaging.message_external_references (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), message_id uuid not null, channel_connection_id uuid not null,
      reference_type text not null check(reference_type in ('PROVIDER_MESSAGE','CLIENT_MESSAGE','ECHO_MESSAGE')), external_id text not null, created_at timestamptz not null default now(),
      unique(organization_id,channel_connection_id,reference_type,external_id), unique(message_id,reference_type,external_id),
      foreign key(organization_id,message_id) references messaging.messages(organization_id,id), foreign key(organization_id,channel_connection_id) references messaging.channel_connections(organization_id,id)
    );
    create index message_external_refs_message on messaging.message_external_references(organization_id,message_id);

    create table messaging.message_attachments (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), message_id uuid not null, media_asset_id uuid, position integer not null check(position>=0),
      kind text not null check(kind in ('IMAGE','VIDEO','AUDIO','FILE','STICKER','PROVIDER_SHARE')), filename text, mime_type text, byte_size bigint check(byte_size>=0), width_px integer check(width_px>0), height_px integer check(height_px>0), duration_ms integer check(duration_ms>=0),
      security_status text not null check(security_status in ('UPLOADING','QUARANTINED','AVAILABLE','REJECTED','PURGED','REMOTE_ONLY')), provider_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(provider_metadata)='object'), expires_at timestamptz, purged_at timestamptz, created_at timestamptz not null default now(),
      unique(message_id,position), foreign key(organization_id,message_id) references messaging.messages(organization_id,id), foreign key(organization_id,media_asset_id) references media.media_assets(organization_id,id)
    );
    create index message_attachments_media on messaging.message_attachments(organization_id,media_asset_id) where media_asset_id is not null;
    create index message_attachments_purge on messaging.message_attachments(security_status,expires_at) where expires_at is not null;

    create table messaging.provider_events (
      id bigint generated always as identity primary key,
      organization_id uuid, channel_connection_id uuid, provider text not null check(provider in ('META_MESSENGER')),
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
    create index provider_events_claim on messaging.provider_events(status,available_at,id) where status in ('PENDING','RETRY_WAIT');
    create index provider_events_connection on messaging.provider_events(organization_id,channel_connection_id,received_at desc) where organization_id is not null;
    create index provider_events_expiry on messaging.provider_events(expires_at,id);

    create table messaging.facebook_sync_jobs (
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
    create unique index facebook_sync_one_active on messaging.facebook_sync_jobs(organization_id,channel_connection_id) where status in ('PENDING','PROCESSING','PAUSED');
    create index facebook_sync_claim on messaging.facebook_sync_jobs(status,available_at,id) where status in ('PENDING','PROCESSING');

    create table messaging.website_attachment_uploads (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      conversation_id uuid not null, contact_identity_id uuid not null, media_asset_id uuid not null,
      media_upload_session_id uuid not null, file_name text not null check(length(file_name) between 1 and 255),
      mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
      byte_size bigint not null check(byte_size between 1 and 5242880), sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
      status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','AVAILABLE','REJECTED','EXPIRED','ATTACHED')),
      expires_at timestamptz not null, attached_message_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(organization_id,id), unique(organization_id,media_asset_id), unique(organization_id,media_upload_session_id),
      foreign key(organization_id,conversation_id) references messaging.conversations(organization_id,id),
      foreign key(organization_id,contact_identity_id) references messaging.contact_identities(organization_id,id),
      foreign key(organization_id,media_asset_id) references media.media_assets(organization_id,id),
      foreign key(organization_id,media_upload_session_id) references media.media_upload_sessions(organization_id,id),
      foreign key(organization_id,attached_message_id) references messaging.messages(organization_id,id),
      check((status='ATTACHED')=(attached_message_id is not null))
    );
    create index website_attachment_uploads_owner on messaging.website_attachment_uploads(organization_id,contact_identity_id,created_at desc);
    create index website_attachment_uploads_cleanup on messaging.website_attachment_uploads(status,expires_at) where status in ('PENDING','PROCESSING','AVAILABLE');

    create table messaging.realtime_streams (
      organization_id uuid primary key references platform.organizations(id), next_sequence bigint not null default 1 check(next_sequence>0), retained_from_sequence bigint not null default 1 check(retained_from_sequence>0), updated_at timestamptz not null default now()
    );
    create table messaging.realtime_events (
      id bigint generated always as identity primary key, event_id uuid not null unique default uuidv7(), organization_id uuid not null references platform.organizations(id), stream_sequence bigint not null check(stream_sequence>0),
      audience_type text not null check(audience_type in ('CONVERSATION','MEMBERSHIP','ORGANIZATION','VISITOR')), audience_id uuid, conversation_id uuid,
      event_type text not null, event_version integer not null default 1 check(event_version>0), aggregate_id uuid not null, aggregate_version bigint not null check(aggregate_version>=0), payload jsonb not null check(jsonb_typeof(payload)='object'),
      created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days', unique(organization_id,stream_sequence),
      foreign key(organization_id,conversation_id) references messaging.conversations(organization_id,id),
      check((audience_type='ORGANIZATION' and audience_id is null) or (audience_type<>'ORGANIZATION' and audience_id is not null))
    );
    create index realtime_events_replay on messaging.realtime_events(organization_id,stream_sequence);
    create index realtime_events_audience on messaging.realtime_events(organization_id,audience_type,audience_id,stream_sequence);
    create index realtime_events_expiry on messaging.realtime_events(expires_at);
    create index realtime_events_conversation on messaging.realtime_events(organization_id,conversation_id,stream_sequence) where conversation_id is not null;

    create table messaging.delivery_intents (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), message_id uuid not null, channel_connection_id uuid not null,
      status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','RETRY_WAIT','SUCCEEDED','FAILED_FINAL','RECONCILIATION_REQUIRED')),
      available_at timestamptz not null default now(), lease_owner text, lease_expires_at timestamptz, attempt_count integer not null default 0 check(attempt_count>=0), max_attempts integer not null default 8 check(max_attempts between 1 and 50),
      last_error_code text, provider_request_key text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
      unique(message_id), unique(organization_id,id), foreign key(organization_id,message_id) references messaging.messages(organization_id,id), foreign key(organization_id,channel_connection_id) references messaging.channel_connections(organization_id,id)
    );
    create index delivery_intents_claim on messaging.delivery_intents(status,available_at,id) where status in ('PENDING','RETRY_WAIT');
    create index delivery_intents_expired on messaging.delivery_intents(lease_expires_at,id) where status='PROCESSING';
    create index delivery_intents_connection on messaging.delivery_intents(organization_id,channel_connection_id,created_at desc);
    create table messaging.delivery_attempts (
      id bigint generated always as identity primary key, organization_id uuid not null references platform.organizations(id), intent_id uuid not null, message_id uuid not null, attempt_number integer not null check(attempt_number>0),
      outcome text not null check(outcome in ('ACCEPTED','TRANSIENT_FAILURE','PERMANENT_FAILURE','UNKNOWN')), provider_status text, provider_code text, provider_request_id text, sanitized_error text,
      started_at timestamptz not null, completed_at timestamptz not null, latency_ms integer not null check(latency_ms>=0), response_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(response_metadata)='object'),
      unique(intent_id,attempt_number), foreign key(organization_id,intent_id) references messaging.delivery_intents(organization_id,id), foreign key(organization_id,message_id) references messaging.messages(organization_id,id)
    );
    create index delivery_attempts_message on messaging.delivery_attempts(organization_id,message_id,attempt_number desc);

    -- Pulled forward from Phase 04 because the Phase 01 read API and unread projection require durable per-agent state.
    create table messaging.conversation_read_cursors (
      organization_id uuid not null, conversation_id uuid not null, reader_type text not null check(reader_type in ('MEMBERSHIP','CONTACT_IDENTITY')), reader_id uuid not null,
      last_read_sequence bigint not null default 0 check(last_read_sequence>=0), updated_at timestamptz not null default now(), primary key(organization_id,conversation_id,reader_type,reader_id),
      foreign key(organization_id,conversation_id) references messaging.conversations(organization_id,id)
    );
    create index conversation_read_cursors_reader on messaging.conversation_read_cursors(organization_id,reader_type,reader_id,updated_at desc);

    create table messaging.conversation_assignment_events (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id), conversation_id uuid not null,
      previous_assignee_membership_id uuid, new_assignee_membership_id uuid, actor_membership_id uuid not null,
      assignment_source text not null default 'MANUAL' check(assignment_source in ('CLAIM','MANUAL','RULE')),
      reason text check(reason is null or length(trim(reason)) between 1 and 500),
      conversation_version bigint not null check(conversation_version>0), created_at timestamptz not null default now(),
      foreign key(organization_id,conversation_id) references messaging.conversations(organization_id,id),
      foreign key(organization_id,previous_assignee_membership_id) references iam.organization_memberships(organization_id,id),
      foreign key(organization_id,new_assignee_membership_id) references iam.organization_memberships(organization_id,id),
      foreign key(organization_id,actor_membership_id) references iam.organization_memberships(organization_id,id)
    );
    create index conversation_assignment_history on messaging.conversation_assignment_events(organization_id,conversation_id,created_at desc,id desc);
    create index conversation_assignment_assignee on messaging.conversation_assignment_events(organization_id,new_assignee_membership_id,created_at desc) where new_assignee_membership_id is not null;

    create table messaging.conversation_events (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id), conversation_id uuid not null,
      event_type text not null check(length(event_type) between 1 and 100), actor_membership_id uuid,
      from_value jsonb, to_value jsonb, reason text check(reason is null or length(trim(reason)) between 1 and 500),
      created_at timestamptz not null default now(),
      foreign key(organization_id,conversation_id) references messaging.conversations(organization_id,id),
      foreign key(organization_id,actor_membership_id) references iam.organization_memberships(organization_id,id),
      check(from_value is null or jsonb_typeof(from_value) in ('object','string','number','boolean')),
      check(to_value is null or jsonb_typeof(to_value) in ('object','string','number','boolean'))
    );
    create index conversation_events_timeline on messaging.conversation_events(organization_id,conversation_id,created_at desc,id desc);
    create index conversation_events_reporting on messaging.conversation_events(organization_id,event_type,created_at desc);

    create table messaging.internal_notes (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      conversation_id uuid not null, author_membership_id uuid not null,
      body text not null check(length(trim(body)) between 1 and 10000), revision integer not null default 1 check(revision>0),
      superseded_by_note_id uuid, deleted_at timestamptz, deleted_by_membership_id uuid,
      deletion_reason text check(deletion_reason is null or length(trim(deletion_reason)) between 1 and 500),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(organization_id,id),
      foreign key(organization_id,conversation_id) references messaging.conversations(organization_id,id),
      foreign key(organization_id,author_membership_id) references iam.organization_memberships(organization_id,id),
      foreign key(organization_id,deleted_by_membership_id) references iam.organization_memberships(organization_id,id),
      check((deleted_at is null)=(deleted_by_membership_id is null))
    );
    alter table messaging.internal_notes add constraint internal_notes_superseded_fk
      foreign key(organization_id,superseded_by_note_id) references messaging.internal_notes(organization_id,id);
    create index internal_notes_conversation on messaging.internal_notes(organization_id,conversation_id,created_at desc,id desc);

    create table messaging.tags (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      label text not null check(length(trim(label)) between 1 and 80), normalized_label text generated always as (lower(trim(label))) stored,
      color_token text check(color_token is null or color_token ~ '^[a-z][a-z0-9_-]{0,39}$'),
      status text not null default 'ACTIVE' check(status in ('ACTIVE','ARCHIVED')),
      created_by_membership_id uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      version bigint not null default 1 check(version>0), unique(organization_id,id), unique(organization_id,normalized_label),
      foreign key(organization_id,created_by_membership_id) references iam.organization_memberships(organization_id,id)
    );
    create index messaging_tags_active on messaging.tags(organization_id,status,label);
    create table messaging.conversation_tag_assignments (
      organization_id uuid not null, conversation_id uuid not null, tag_id uuid not null,
      assigned_by_membership_id uuid not null, assigned_at timestamptz not null default now(),
      primary key(organization_id,conversation_id,tag_id),
      foreign key(organization_id,conversation_id) references messaging.conversations(organization_id,id),
      foreign key(organization_id,tag_id) references messaging.tags(organization_id,id),
      foreign key(organization_id,assigned_by_membership_id) references iam.organization_memberships(organization_id,id)
    );
    create index conversation_tag_by_tag on messaging.conversation_tag_assignments(organization_id,tag_id,assigned_at desc);

    create table messaging.saved_replies (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      title text not null check(length(trim(title)) between 1 and 160), body text not null check(length(trim(body)) between 1 and 10000),
      shortcut text check(shortcut is null or shortcut ~ '^[a-z0-9_-]{1,80}$'), category text check(category is null or length(trim(category)) between 1 and 80),
      status text not null default 'ACTIVE' check(status in ('ACTIVE','ARCHIVED')),
      created_by_membership_id uuid not null, updated_by_membership_id uuid not null,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
      unique(organization_id,id),
      foreign key(organization_id,created_by_membership_id) references iam.organization_memberships(organization_id,id),
      foreign key(organization_id,updated_by_membership_id) references iam.organization_memberships(organization_id,id)
    );
    create unique index saved_replies_active_shortcut on messaging.saved_replies(organization_id,shortcut) where shortcut is not null and status='ACTIVE';
    create index saved_replies_lookup on messaging.saved_replies(organization_id,status,lower(title),id);
    create table messaging.saved_reply_scopes (
      organization_id uuid not null, saved_reply_id uuid not null,
      scope_type text not null check(scope_type in ('CHANNEL_KIND','CONNECTION')), scope_id text not null,
      primary key(organization_id,saved_reply_id,scope_type,scope_id),
      foreign key(organization_id,saved_reply_id) references messaging.saved_replies(organization_id,id)
    );

    create table messaging.business_hours (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), connection_id uuid,
      timezone text not null default 'Asia/Dhaka' check(length(timezone) between 1 and 100),
      weekly_schedule jsonb not null default '{}'::jsonb check(jsonb_typeof(weekly_schedule)='object'),
      offline_accepts_messages boolean not null default true, manual_closure_until timestamptz,
      created_by_membership_id uuid not null, updated_by_membership_id uuid not null,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
      unique(organization_id,id), unique nulls not distinct(organization_id,connection_id),
      foreign key(organization_id,connection_id) references messaging.channel_connections(organization_id,id),
      foreign key(organization_id,created_by_membership_id) references iam.organization_memberships(organization_id,id),
      foreign key(organization_id,updated_by_membership_id) references iam.organization_memberships(organization_id,id)
    );
    create table messaging.business_hour_exceptions (
      id uuid primary key default uuidv7(), organization_id uuid not null, business_hours_id uuid not null,
      local_date date not null, intervals jsonb not null default '[]'::jsonb check(jsonb_typeof(intervals)='array'),
      is_closed boolean not null default false, label text check(label is null or length(trim(label)) between 1 and 160),
      created_at timestamptz not null default now(), unique(organization_id,business_hours_id,local_date),
      foreign key(organization_id,business_hours_id) references messaging.business_hours(organization_id,id)
    );

    create table messaging.agent_availability (
      organization_id uuid not null, membership_id uuid not null,
      status text not null default 'OFFLINE' check(status in ('ONLINE','BUSY','AWAY','OFFLINE')),
      capacity integer not null default 100 check(capacity between 0 and 100), manual_override_until timestamptz,
      last_heartbeat_at timestamptz, updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
      primary key(organization_id,membership_id),
      foreign key(organization_id,membership_id) references iam.organization_memberships(organization_id,id)
    );
    create index agent_availability_routing on messaging.agent_availability(organization_id,status,last_heartbeat_at desc);

    create table messaging.assignment_rules (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      name text not null check(length(trim(name)) between 1 and 160), position integer not null check(position>=0), is_enabled boolean not null default true,
      conditions jsonb not null default '{}'::jsonb check(jsonb_typeof(conditions)='object'), actions jsonb not null default '{}'::jsonb check(jsonb_typeof(actions)='object'),
      created_by_membership_id uuid not null, updated_by_membership_id uuid not null,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
      unique(organization_id,id), unique(organization_id,position),
      foreign key(organization_id,created_by_membership_id) references iam.organization_memberships(organization_id,id),
      foreign key(organization_id,updated_by_membership_id) references iam.organization_memberships(organization_id,id)
    );
    create index assignment_rules_enabled on messaging.assignment_rules(organization_id,position) where is_enabled;

    create table messaging.conversation_follow_ups (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      conversation_id uuid not null, responsible_membership_id uuid not null, created_by_membership_id uuid not null,
      due_at timestamptz not null, note text check(note is null or length(trim(note)) between 1 and 2000),
      status text not null default 'PENDING' check(status in ('PENDING','COMPLETED','CANCELLED')),
      completed_at timestamptz, completed_by_membership_id uuid, cancelled_at timestamptz, cancelled_by_membership_id uuid,
      reminder_sent_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      version bigint not null default 1 check(version>0), unique(organization_id,id),
      foreign key(organization_id,conversation_id) references messaging.conversations(organization_id,id),
      foreign key(organization_id,responsible_membership_id) references iam.organization_memberships(organization_id,id),
      foreign key(organization_id,created_by_membership_id) references iam.organization_memberships(organization_id,id),
      foreign key(organization_id,completed_by_membership_id) references iam.organization_memberships(organization_id,id),
      foreign key(organization_id,cancelled_by_membership_id) references iam.organization_memberships(organization_id,id),
      check((status='COMPLETED')=(completed_at is not null)), check((status='CANCELLED')=(cancelled_at is not null))
    );
    create index conversation_follow_ups_conversation on messaging.conversation_follow_ups(organization_id,conversation_id,created_at desc,id desc);
    create index conversation_follow_ups_due on messaging.conversation_follow_ups(due_at,id) where status='PENDING' and reminder_sent_at is null;
    create index conversation_follow_ups_responsible on messaging.conversation_follow_ups(organization_id,responsible_membership_id,due_at) where status='PENDING';

    insert into iam.capability_definitions(capability_code,domain,description,sensitivity,supported_scope_types,status) values
      ('messaging.inbox.view_assigned','messaging','View unassigned and self-assigned messaging conversations.','INTERNAL','{}','ACTIVE'),
      ('messaging.inbox.view_all','messaging','View all organization messaging conversations.','INTERNAL','{}','ACTIVE'),
      ('messaging.reply','messaging','Send replies in accessible messaging conversations.','HIGH','{}','ACTIVE'),
      ('messaging.claim','messaging','Claim unassigned messaging conversations.','HIGH','{}','ACTIVE'),
      ('messaging.status.manage','messaging','Manage messaging conversation status.','HIGH','{}','ACTIVE'),
      ('messaging.assign','messaging','Assign, release, and transfer messaging conversations.','HIGH','{}','ACTIVE'),
      ('messaging.priority.manage','messaging','Manage conversation priority and starred state.','HIGH','{}','ACTIVE'),
      ('messaging.notes.create','messaging','Create and edit own internal conversation notes.','INTERNAL','{}','ACTIVE'),
      ('messaging.notes.manage_all','messaging','Manage all internal conversation notes.','HIGH','{}','ACTIVE'),
      ('messaging.tags.manage','messaging','Manage messaging tags and conversation classifications.','HIGH','{}','ACTIVE'),
      ('messaging.saved_replies.use','messaging','Use organization saved replies.','INTERNAL','{}','ACTIVE'),
      ('messaging.saved_replies.manage','messaging','Manage organization saved replies.','HIGH','{}','ACTIVE'),
      ('messaging.customer_context.view','messaging','View verified linked customer and commerce context.','RESTRICTED','{}','ACTIVE'),
      ('messaging.customer_link.manage','messaging','Link or unlink a messaging contact and customer with evidence.','RESTRICTED','{}','ACTIVE'),
      ('messaging.contacts.search','messaging','Search messaging contacts and verified linked contact points.','RESTRICTED','{}','ACTIVE'),
      ('messaging.availability.view','messaging','View messaging agent availability.','INTERNAL','{}','ACTIVE'),
      ('messaging.settings.manage','messaging','Manage messaging hours, routing and operational settings.','CRITICAL','{}','ACTIVE'),
      ('messaging.follow_ups.manage','messaging','Create and manage conversation follow-ups.','HIGH','{}','ACTIVE'),
      ('messaging.reports.view','messaging','View organization messaging operations reporting.','RESTRICTED','{}','ACTIVE')
      ,('messaging.connections.view','messaging','View provider connection health and diagnostics.','RESTRICTED','{}','ACTIVE')
      ,('messaging.connections.manage','messaging','Authorize, connect, verify, synchronize and disconnect provider accounts.','CRITICAL','{}','ACTIVE')
    on conflict(capability_code) do update set description=excluded.description,status='ACTIVE';
    insert into iam.membership_capability_grants(membership_id,capability_code)
      select m.id,c.code from iam.organization_memberships m cross join(values
        ('messaging.inbox.view_assigned'),('messaging.inbox.view_all'),('messaging.reply'),('messaging.claim'),('messaging.status.manage'),
        ('messaging.assign'),('messaging.priority.manage'),('messaging.notes.create'),('messaging.notes.manage_all'),
        ('messaging.tags.manage'),('messaging.saved_replies.use'),('messaging.saved_replies.manage'),
        ('messaging.customer_context.view'),('messaging.customer_link.manage'),('messaging.contacts.search'),('messaging.availability.view'),
        ('messaging.settings.manage'),('messaging.follow_ups.manage'),('messaging.reports.view'),
        ('messaging.connections.view'),('messaging.connections.manage')
      ) c(code) where m.membership_type='OWNER' and m.status='ACTIVE' on conflict do nothing;
    insert into notifications.notification_policies(notification_type,delivery_requirement,category,default_priority,contains_sensitive_data)
      values('MESSAGING_INBOUND_ATTENTION','REQUIRED_OPERATIONAL','OPERATIONAL','HIGH',false),
      ('MESSAGING_ASSIGNMENT','OPTIONAL','OPERATIONAL','HIGH',false),
      ('MESSAGING_FOLLOW_UP_DUE','OPTIONAL','OPERATIONAL','HIGH',false)
      on conflict(notification_type) do nothing;
    insert into notifications.notification_channel_policies(notification_type,channel,enabled,automatic_enabled,manual_allowed)
      values('MESSAGING_INBOUND_ATTENTION','IN_APP',true,true,false),
      ('MESSAGING_ASSIGNMENT','IN_APP',true,true,false),
      ('MESSAGING_FOLLOW_UP_DUE','IN_APP',true,true,false)
      on conflict(notification_type,channel) do nothing;
  `.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`drop schema if exists messaging cascade`.execute(db);
}
