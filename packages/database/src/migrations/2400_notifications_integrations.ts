import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Delivery and provider state are append-oriented operational facts, never business truth. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists notifications;
    create schema if not exists integrations;

    create table notifications.notification_policies (
      notification_type text primary key,
      delivery_requirement text not null check (delivery_requirement in ('REQUIRED_OPERATIONAL','OPTIONAL')),
      channels text[] not null check (cardinality(channels)>0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table notifications.notification_templates (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      notification_type text not null, channel text not null check(channel in ('IN_APP','EMAIL')), name text not null,
      status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','ARCHIVED')), current_revision_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique(organization_id, notification_type, channel, name), unique(organization_id,id)
    );
    create table notifications.template_revisions (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      template_id uuid not null references notifications.notification_templates(id), revision_number integer not null,
      subject_template text, body_template text not null, variable_schema jsonb not null default '{}'::jsonb check(jsonb_typeof(variable_schema)='object'),
      status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','SUPERSEDED')), created_at timestamptz not null default now(), published_at timestamptz,
      unique(template_id, revision_number), unique(organization_id,id), foreign key(organization_id,template_id) references notifications.notification_templates(organization_id,id)
    );
    alter table notifications.notification_templates add constraint notification_templates_current_revision_fk foreign key(current_revision_id) references notifications.template_revisions(id);
    create table notifications.preferences (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), recipient_type text not null check(recipient_type in ('MEMBERSHIP','CUSTOMER')), recipient_id uuid not null,
      notification_type text not null, channel text not null check(channel in ('IN_APP','EMAIL')), enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(organization_id,recipient_type,recipient_id,notification_type,channel)
    );
    create table notifications.notifications (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), notification_type text not null,
      recipient_type text not null check(recipient_type in ('MEMBERSHIP','CUSTOMER')), customer_id uuid references customers.customers(id), membership_id uuid references iam.organization_memberships(id),
      channel text not null check(channel in ('IN_APP','EMAIL')), template_revision_id uuid references notifications.template_revisions(id), rendered_subject text, rendered_body text not null,
      status text not null check(status in ('PENDING','SENT','FAILED','SUPPRESSED','READ')), source_event_id uuid references platform.outbox_events(event_id), source_domain text not null, source_id uuid not null,
      created_at timestamptz not null default now(), read_at timestamptz, sent_at timestamptz,
      check((recipient_type='CUSTOMER' and customer_id is not null and membership_id is null) or (recipient_type='MEMBERSHIP' and membership_id is not null and customer_id is null)),
      unique(organization_id,id)
    );
    create unique index notifications_source_recipient_channel on notifications.notifications(source_event_id,recipient_type,coalesce(customer_id,membership_id),channel) where source_event_id is not null;
    create index notifications_inbox on notifications.notifications(organization_id,membership_id,created_at desc) where channel='IN_APP';
    create table notifications.delivery_attempts (
      id bigint generated always as identity primary key, organization_id uuid not null references platform.organizations(id), notification_id uuid not null references notifications.notifications(id),
      attempt_number integer not null check(attempt_number>0), provider text not null, provider_message_id text, status text not null check(status in ('PENDING','SENT','FAILED','RETRY_WAIT','PERMANENT_FAILURE')),
      started_at timestamptz not null default now(), completed_at timestamptz, next_retry_at timestamptz, error_code text, error_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(error_metadata)='object'), unique(notification_id,attempt_number)
    );

    create table integrations.integrations (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), provider_code text not null, integration_type text not null, name text not null,
      status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','DISABLED')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique(organization_id,provider_code,integration_type), unique(organization_id,id)
    );
    create table integrations.integration_accounts (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), integration_id uuid not null references integrations.integrations(id), external_account_id text, name text not null,
      status text not null default 'ACTIVE' check(status in ('ACTIVE','DISABLED')), non_secret_config jsonb not null default '{}'::jsonb check(jsonb_typeof(non_secret_config)='object'), secret_reference text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique(organization_id,id), foreign key(organization_id,integration_id) references integrations.integrations(organization_id,id)
    );
    create table integrations.external_entity_mappings (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), integration_account_id uuid not null references integrations.integration_accounts(id),
      local_entity_type text not null, local_entity_id uuid not null, external_entity_type text not null, external_entity_id text not null, created_at timestamptz not null default now(),
      unique(integration_account_id,external_entity_type,external_entity_id), unique(integration_account_id,local_entity_type,local_entity_id)
    );
    create table integrations.integration_operations (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), integration_account_id uuid not null references integrations.integration_accounts(id), operation_type text not null, operation_key text not null,
      local_entity_type text not null, local_entity_id uuid not null, request_fingerprint text not null, status text not null default 'PENDING' check(status in ('PENDING','SENT','CONFIRMED_SUCCESS','CONFIRMED_FAILURE','UNKNOWN_OUTCOME','RECONCILIATION_REQUIRED')),
      external_reference text, attempt_count integer not null default 0 check(attempt_count>=0), last_attempt_at timestamptz, reconcile_after timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique(integration_account_id,operation_type,operation_key), unique(organization_id,id)
    );
    create table integrations.integration_exceptions (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), integration_account_id uuid not null references integrations.integration_accounts(id), integration_operation_id uuid references integrations.integration_operations(id),
      exception_type text not null, severity text not null check(severity in ('INFO','WARNING','ERROR','CRITICAL')), status text not null default 'OPEN' check(status in ('OPEN','RESOLVED','IGNORED_WITH_REASON')),
      summary text not null, details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'), created_at timestamptz not null default now(), resolved_at timestamptz, version bigint not null default 1
    );
    create table integrations.inbound_provider_events (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), integration_account_id uuid not null references integrations.integration_accounts(id), provider_event_id text,
      event_type text not null, provider_status text, payload_hash text not null, raw_payload jsonb not null check(jsonb_typeof(raw_payload)='object'), authentication_status text not null check(authentication_status in ('VERIFIED','FAILED','NOT_APPLICABLE')),
      processing_status text not null default 'PENDING' check(processing_status in ('PENDING','PROCESSED','FAILED','IGNORED')), provider_occurred_at timestamptz, received_at timestamptz not null default now(), processed_at timestamptz,
      unique(integration_account_id,provider_event_id), unique(integration_account_id,payload_hash)
    );
    create table integrations.webhook_endpoints (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), name text not null, endpoint_url text not null, status text not null default 'ACTIVE' check(status in ('ACTIVE','PAUSED','DISABLED','FAILING')),
      secret_ciphertext text not null, secret_key_id text not null, api_version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique(organization_id,name), unique(organization_id,id)
    );
    create table integrations.webhook_subscriptions (webhook_endpoint_id uuid not null references integrations.webhook_endpoints(id), event_type text not null, event_version integer not null default 1, primary key(webhook_endpoint_id,event_type,event_version));
    create table integrations.webhook_events (
      id uuid primary key default uuidv7(), event_id uuid not null unique default uuidv7(), organization_id uuid not null references platform.organizations(id), event_type text not null, event_version integer not null,
      resource_type text not null, resource_id uuid not null, resource_version bigint, payload jsonb not null check(jsonb_typeof(payload)='object'), occurred_at timestamptz not null, created_at timestamptz not null default now(), unique(organization_id,id)
    );
    create table integrations.webhook_deliveries (
      id bigint generated always as identity primary key, organization_id uuid not null references platform.organizations(id), webhook_event_id uuid not null references integrations.webhook_events(id), webhook_endpoint_id uuid not null references integrations.webhook_endpoints(id),
      attempt_number integer not null check(attempt_number>0), status text not null check(status in ('PENDING','SENT','FAILED','RETRY_WAIT','PERMANENT_FAILURE')), response_status integer, response_excerpt text, started_at timestamptz not null default now(), completed_at timestamptz, next_retry_at timestamptz, failure_code text,
      unique(webhook_event_id,webhook_endpoint_id,attempt_number)
    );
    create index integration_operations_health on integrations.integration_operations(organization_id,status,updated_at desc);
    create index inbound_provider_events_backlog on integrations.inbound_provider_events(organization_id,processing_status,received_at);
    create index webhook_deliveries_retry on integrations.webhook_deliveries(status,next_retry_at) where status in ('PENDING','RETRY_WAIT');

    insert into iam.capability_definitions(capability_code,domain,description,sensitivity) values
      ('notifications.view','notifications','View organization notification inbox and delivery state.','INTERNAL'),
      ('notifications.manage','notifications','Manage notification templates and preferences.','HIGH'),
      ('integrations.view','integrations','View integration health and reconciliation state.','INTERNAL'),
      ('integrations.manage','integrations','Manage integration accounts and reconciliation.','HIGH'),
      ('webhooks.manage','integrations','Manage signed outbound webhook endpoints.','HIGH') on conflict(capability_code) do nothing;
    insert into iam.membership_capability_grants(membership_id,capability_code)
      select m.id,c.capability_code from iam.organization_memberships m cross join(values('notifications.view'),('notifications.manage'),('integrations.view'),('integrations.manage'),('webhooks.manage')) c(capability_code)
      where m.membership_type='OWNER' and m.status='ACTIVE' on conflict do nothing;
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error('Notification and integration history is append-only.');
}
