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
    create table platform.integrity_runs (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      trigger_type text not null check (trigger_type in ('SCHEDULED', 'MANUAL', 'TARGETED', 'VERIFICATION')),
      scope_type text not null check (scope_type in ('ORGANIZATION', 'MODULE', 'ENTITY')),
      scope_module text,
      scope_entity_type text,
      scope_entity_id uuid,
      selected_check_ids text[] not null default '{}'::text[],
      execution_key text not null,
      status text not null default 'QUEUED' check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'INTERRUPTED')),
      requested_by uuid,
      parent_repair_run_id uuid,
      started_at timestamptz,
      completed_at timestamptz,
      lease_owner text,
      lease_expires_at timestamptz,
      checks_total integer not null default 0 check (checks_total >= 0),
      checks_completed integer not null default 0 check (checks_completed >= 0),
      checks_failed integer not null default 0 check (checks_failed >= 0),
      records_inspected bigint not null default 0 check (records_inspected >= 0),
      findings_detected integer not null default 0 check (findings_detected >= 0),
      error_summary text,
      created_at timestamptz not null default now()
    );
    create unique index integrity_runs_active_scope
      on platform.integrity_runs (organization_id, execution_key)
      where status in ('QUEUED', 'RUNNING');
    create index integrity_runs_history
      on platform.integrity_runs (organization_id, created_at desc, id desc);
    create index integrity_runs_claimable
      on platform.integrity_runs (created_at, id) where status = 'QUEUED';
    create index integrity_runs_expired_leases
      on platform.integrity_runs (lease_expires_at, id) where status = 'RUNNING';

    create table platform.integrity_run_checks (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      run_id uuid not null references platform.integrity_runs(id),
      check_id text not null,
      check_version integer not null check (check_version > 0),
      status text not null check (status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED')),
      records_inspected bigint not null default 0 check (records_inspected >= 0),
      findings_detected integer not null default 0 check (findings_detected >= 0),
      started_at timestamptz,
      completed_at timestamptz,
      duration_ms bigint check (duration_ms is null or duration_ms >= 0),
      error_code text,
      error_summary text,
      unique (run_id, check_id)
    );
    create index integrity_run_checks_run on platform.integrity_run_checks (organization_id, run_id, id);

    create table platform.integrity_issues (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      check_id text not null,
      check_version integer not null check (check_version > 0),
      fingerprint text not null,
      domain text not null,
      category text not null check (category in ('DATA', 'BUSINESS', 'FINANCIAL', 'OPERATIONAL', 'PROJECTION', 'STORAGE', 'SECURITY_CONFIGURATION')),
      issue_type text not null,
      severity text not null check (severity in ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
      confidence text not null check (confidence in ('LOW', 'MEDIUM', 'HIGH')),
      entity_type text,
      entity_id uuid,
      status text not null check (status in ('OPEN', 'INVESTIGATING', 'REPAIR_PENDING', 'REPAIRING', 'RESOLVED', 'ACCEPTED')),
      summary text not null,
      details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
      first_detected_at timestamptz not null default now(),
      last_detected_at timestamptz not null default now(),
      last_seen_run_id uuid references platform.integrity_runs(id),
      occurrence_count integer not null default 1 check (occurrence_count > 0),
      resolved_at timestamptz,
      resolved_by uuid,
      accepted_reason text,
      repair_reference text,
      version bigint not null default 1,
      unique (organization_id, fingerprint)
    );
    create index integrity_issues_worklist
      on platform.integrity_issues (organization_id, status, severity, last_detected_at desc, id desc);
    create index integrity_issues_entity
      on platform.integrity_issues (organization_id, entity_type, entity_id, last_detected_at desc)
      where entity_id is not null;

    create table platform.integrity_finding_events (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      finding_id uuid not null references platform.integrity_issues(id),
      run_id uuid references platform.integrity_runs(id),
      event_type text not null check (event_type in ('DETECTED', 'RECURRED', 'STATUS_CHANGED', 'REPAIR_PREVIEWED', 'REPAIR_STARTED', 'REPAIR_SUCCEEDED', 'REPAIR_FAILED', 'VERIFIED_RESOLVED', 'REOPENED')),
      actor_id uuid,
      from_status text,
      to_status text,
      metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
      created_at timestamptz not null default now()
    );
    create index integrity_finding_events_timeline
      on platform.integrity_finding_events (organization_id, finding_id, created_at, id);

    create table platform.integrity_repair_runs (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      finding_id uuid not null references platform.integrity_issues(id),
      repair_key text not null,
      idempotency_key text not null,
      request_fingerprint text not null,
      requested_by uuid not null,
      status text not null check (status in ('PREVIEWED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'STALE_PRECONDITION', 'VERIFICATION_FAILED')),
      preview jsonb not null check (jsonb_typeof(preview) = 'object'),
      result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
      verification_run_id uuid references platform.integrity_runs(id),
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      unique (organization_id, idempotency_key)
    );
    create index integrity_repair_runs_finding
      on platform.integrity_repair_runs (organization_id, finding_id, created_at desc, id desc);
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

    create table platform.import_batches (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      source_system text not null,
      source_kind text not null,
      source_file_name text not null,
      source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
      source_exported_at timestamptz,
      status text not null check (status in ('STAGED', 'APPLYING', 'PARTIALLY_APPLIED', 'COMPLETED', 'FAILED')),
      summary_json jsonb not null default '{}'::jsonb check (jsonb_typeof(summary_json) = 'object'),
      created_by_actor_id uuid,
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      updated_at timestamptz not null default now(),
      unique (organization_id, source_system, source_sha256),
      unique (organization_id, id)
    );
    create index import_batches_organization_status
      on platform.import_batches (organization_id, status, started_at desc, id desc);

    create table platform.import_records (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      import_batch_id uuid not null references platform.import_batches(id),
      source_record_type text not null,
      source_record_id text not null,
      source_row_number integer not null check (source_row_number > 0),
      import_status text not null check (import_status in ('STAGED', 'IMPORTED', 'DEFERRED', 'FAILED')),
      payload_json jsonb not null check (jsonb_typeof(payload_json) = 'object'),
      issue_codes text[] not null default '{}'::text[],
      target_entity_type text,
      target_entity_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (import_batch_id, source_record_type, source_record_id),
      foreign key (organization_id, import_batch_id)
        references platform.import_batches(organization_id, id)
    );
    create index import_records_batch_status
      on platform.import_records (organization_id, import_batch_id, import_status, source_record_type, id);

    create table platform.external_entity_links (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      source_system text not null,
      source_entity_type text not null,
      source_entity_id text not null,
      target_entity_type text not null,
      target_entity_id uuid not null,
      import_batch_id uuid references platform.import_batches(id),
      metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, source_system, source_entity_type, source_entity_id),
      unique (organization_id, id),
      foreign key (organization_id, import_batch_id)
        references platform.import_batches(organization_id, id)
    );
    create index external_entity_links_target
      on platform.external_entity_links (organization_id, target_entity_type, target_entity_id);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Operational state is not dropped automatically.');
}
