import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table platform.operational_controls (
      organization_id uuid not null references platform.organizations(id),
      control_key text not null check(control_key in ('checkout_enabled','review_submission_enabled','customer_returns_enabled','email_delivery_enabled','webhook_delivery_enabled')),
      control_type text not null check(control_type in ('FEATURE_FLAG','KILL_SWITCH')),
      enabled boolean not null,
      reason text,
      updated_by uuid references iam.users(id),
      updated_at timestamptz not null default now(),
      primary key(organization_id,control_key)
    );
    insert into iam.capability_definitions(capability_code,domain,description,sensitivity)
    values('settings.rollout.manage','settings','Manage feature flags and operational kill switches.','CRITICAL')
    on conflict(capability_code) do nothing;
    insert into iam.membership_capability_grants(membership_id,capability_code)
      select id,'settings.rollout.manage' from iam.organization_memberships where membership_type='OWNER' and status='ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Operational control history has no automatic down migration.');
}
