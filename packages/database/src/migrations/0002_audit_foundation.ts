import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists audit;
    create table audit.audit_events (
      id bigint generated always as identity primary key,
      event_id uuid not null unique default uuidv7(),
      organization_id uuid,
      actor_type text not null,
      actor_id uuid,
      membership_id uuid,
      action text not null,
      target_type text,
      target_id uuid,
      request_id text,
      reason text,
      before_diff jsonb,
      after_diff jsonb,
      metadata jsonb,
      created_at timestamptz not null default now()
    );
    create index audit_events_organization_created_at on audit.audit_events (organization_id, created_at desc);
    create index audit_events_organization_target_created_at on audit.audit_events (organization_id, target_type, target_id, created_at desc);
    create index audit_events_organization_actor_created_at on audit.audit_events (organization_id, actor_id, created_at desc);
    create index audit_events_organization_action_created_at on audit.audit_events (organization_id, action, created_at desc);
    revoke update, delete on audit.audit_events from public;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Audit history must not be removed automatically.');
}
