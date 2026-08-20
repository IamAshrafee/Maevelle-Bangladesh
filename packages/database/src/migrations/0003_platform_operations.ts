import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table platform.outbox_events (
      id bigint generated always as identity primary key,
      event_id uuid not null unique default uuidv7(),
      organization_id uuid references platform.organizations(id),
      event_type text not null,
      event_version integer not null,
      aggregate_type text not null,
      aggregate_id uuid not null,
      aggregate_version bigint,
      payload jsonb not null,
      occurred_at timestamptz not null,
      created_at timestamptz not null default now()
    );
    create table platform.event_consumer_receipts (
      id bigint generated always as identity primary key,
      outbox_event_id bigint not null references platform.outbox_events(id),
      consumer_name text not null,
      status text not null check (status in ('PENDING', 'PROCESSING', 'RETRY_WAIT', 'COMPLETED', 'DEAD_LETTER')),
      attempt_count integer not null default 0 check (attempt_count >= 0),
      last_attempt_at timestamptz,
      next_retry_at timestamptz,
      processed_at timestamptz,
      last_error_code text,
      unique (outbox_event_id, consumer_name)
    );
    create table platform.integrity_issues (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      domain text not null,
      issue_type text not null,
      severity text not null check (severity in ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
      entity_type text,
      entity_id uuid,
      status text not null check (status in ('OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED_WITH_REASON')),
      summary text not null,
      details jsonb,
      detected_at timestamptz not null default now(),
      resolved_at timestamptz,
      resolved_by uuid,
      repair_reference text,
      version bigint not null default 1
    );
    create table platform.operational_holds (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      hold_type text not null,
      domain text not null,
      resource_type text not null,
      resource_id uuid not null,
      reason_code text not null,
      reason_text text,
      status text not null check (status in ('ACTIVE', 'RELEASED')),
      created_by_actor_type text not null,
      created_by_actor_id uuid,
      created_at timestamptz not null default now(),
      released_at timestamptz,
      released_by_actor_id uuid
    );
    create index operational_holds_active_resource on platform.operational_holds (organization_id, resource_type, resource_id) where status = 'ACTIVE';
    create table platform.jobs (
      id uuid primary key default uuidv7(),
      organization_id uuid references platform.organizations(id),
      queue_name text not null check (queue_name in ('critical', 'default', 'media', 'analytics')),
      job_type text not null,
      payload_version integer not null,
      payload jsonb not null,
      priority integer not null default 0,
      status text not null check (status in ('PENDING', 'RUNNING', 'RETRY_WAIT', 'COMPLETED', 'DEAD_LETTER')),
      initiator_type text not null,
      initiator_id uuid,
      authorization_mode text not null check (authorization_mode in ('SYSTEM', 'REVALIDATE_INITIATOR')),
      available_at timestamptz not null default now(),
      lease_owner text,
      lease_expires_at timestamptz,
      attempt_count integer not null default 0 check (attempt_count >= 0),
      max_attempts integer not null default 5 check (max_attempts > 0),
      created_at timestamptz not null default now(),
      started_at timestamptz,
      completed_at timestamptz,
      last_error_code text
    );
    create index jobs_claimable on platform.jobs (queue_name, priority desc, available_at, id) where status in ('PENDING', 'RETRY_WAIT');
    create index jobs_expired_leases on platform.jobs (lease_expires_at, id) where status = 'RUNNING';
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Operational state is not dropped automatically.');
}
