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
      unique(organization_id,id), foreign key(organization_id,integration_account_id) references integrations.integration_accounts(organization_id,id)
    );
    create unique index channel_connections_provider on messaging.channel_connections(organization_id,channel_kind,provider_account_id) where provider_account_id is not null;
    create index channel_connections_status on messaging.channel_connections(organization_id,status,channel_kind);

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
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), channel_connection_id uuid not null, contact_id uuid not null, contact_identity_id uuid not null,
      provider_conversation_id text, status text not null default 'NEW' check(status in ('NEW','OPEN','PENDING','RESOLVED','CLOSED')),
      priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','URGENT')),
      assignee_membership_id uuid, assigned_at timestamptz, assigned_by_membership_id uuid, is_starred boolean not null default false,
      next_message_sequence bigint not null default 1 check(next_message_sequence>0), last_message_sequence bigint not null default 0 check(last_message_sequence>=0), last_message_id uuid,
      last_message_at timestamptz, last_inbound_at timestamptz, last_outbound_at timestamptz, resolved_at timestamptz, closed_at timestamptz, reply_eligible_until timestamptz,
      subject text check(subject is null or length(trim(subject)) between 1 and 240), context jsonb not null default '{}'::jsonb check(jsonb_typeof(context)='object'),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
      unique(organization_id,id), foreign key(organization_id,channel_connection_id) references messaging.channel_connections(organization_id,id),
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

    insert into iam.capability_definitions(capability_code,domain,description,sensitivity,supported_scope_types,status) values
      ('messaging.inbox.view_assigned','messaging','View unassigned and self-assigned messaging conversations.','INTERNAL','{}','ACTIVE'),
      ('messaging.inbox.view_all','messaging','View all organization messaging conversations.','INTERNAL','{}','ACTIVE'),
      ('messaging.reply','messaging','Send replies in accessible messaging conversations.','HIGH','{}','ACTIVE'),
      ('messaging.claim','messaging','Claim unassigned messaging conversations.','HIGH','{}','ACTIVE'),
      ('messaging.status.manage','messaging','Manage messaging conversation status.','HIGH','{}','ACTIVE')
    on conflict(capability_code) do update set description=excluded.description,status='ACTIVE';
    insert into iam.membership_capability_grants(membership_id,capability_code)
      select m.id,c.code from iam.organization_memberships m cross join(values
        ('messaging.inbox.view_assigned'),('messaging.inbox.view_all'),('messaging.reply'),('messaging.claim'),('messaging.status.manage')
      ) c(code) where m.membership_type='OWNER' and m.status='ACTIVE' on conflict do nothing;
    insert into notifications.notification_policies(notification_type,delivery_requirement,category,default_priority,contains_sensitive_data)
      values('MESSAGING_INBOUND_ATTENTION','REQUIRED_OPERATIONAL','OPERATIONAL','HIGH',false)
      on conflict(notification_type) do nothing;
    insert into notifications.notification_channel_policies(notification_type,channel,enabled,automatic_enabled,manual_allowed)
      values('MESSAGING_INBOUND_ATTENTION','IN_APP',true,true,false)
      on conflict(notification_type,channel) do nothing;
  `.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`drop schema if exists messaging cascade`.execute(db);
}
