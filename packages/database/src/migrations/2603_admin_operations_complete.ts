import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Operational workflows around rebuildable/admin-owned state only. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table platform.saved_views add column status text not null default 'ACTIVE' check(status in ('ACTIVE','ARCHIVED')),
      add column is_default boolean not null default false;
    create unique index saved_views_one_default on platform.saved_views(organization_id,user_id,resource_key) where status='ACTIVE' and is_default;

    alter table platform.import_jobs add column confirmed_at timestamptz, add column attempt_count integer not null default 0 check(attempt_count>=0), add column result_summary jsonb not null default '{}'::jsonb check(jsonb_typeof(result_summary)='object');
    create table platform.import_job_rows (
      id bigint generated always as identity primary key, organization_id uuid not null references platform.organizations(id), import_job_id uuid not null references platform.import_jobs(id), row_number integer not null check(row_number>0),
      source_data jsonb not null check(jsonb_typeof(source_data)='object'), validation_status text not null check(validation_status in ('VALID','INVALID','DUPLICATE')),
      validation_errors jsonb not null default '[]'::jsonb check(jsonb_typeof(validation_errors)='array'), result_resource_id uuid, processed_at timestamptz,
      unique(import_job_id,row_number)
    );
    create index import_jobs_queue on platform.import_jobs(status,created_at) where status in ('CONFIRMED','PROCESSING');
    create table platform.export_jobs (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), requested_by uuid not null references iam.users(id), export_type text not null check(export_type in ('ORDERS','CUSTOMERS','INVENTORY')),
      status text not null check(status in ('PENDING','COMPLETED','FAILED')), filters jsonb not null default '{}'::jsonb check(jsonb_typeof(filters)='object'), row_count integer,
      result_data jsonb check(result_data is null or jsonb_typeof(result_data)='array'), created_at timestamptz not null default now(), completed_at timestamptz
    );
    create table platform.projection_repair_runs (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), projection_type text not null check(projection_type in ('ANALYTICS','REVIEW_RATINGS','SEARCH')),
      resource_id uuid, requested_by uuid not null references iam.users(id), status text not null check(status in ('RUNNING','SUCCEEDED','FAILED')), started_at timestamptz not null default now(), completed_at timestamptz, error_code text
    );
    insert into iam.capability_definitions(capability_code,domain,description,sensitivity) values
      ('admin.integrity.view','admin','View unified integrity findings and safe projection repairs.','HIGH'),
      ('admin.integrity.repair','admin','Run allow-listed rebuildable projection repairs.','HIGH'),
      ('admin.team.view','iam','View organization membership and capability assignments.','HIGH'),
      ('admin.team.manage','iam','Manage non-owner membership lifecycle and capability assignments.','CRITICAL'),
      ('admin.imports.manage','admin','Validate and confirm domain-service imports.','HIGH') on conflict do nothing;
    insert into iam.membership_capability_grants(membership_id,capability_code)
      select m.id,c.capability_code from iam.organization_memberships m cross join(values('admin.integrity.view'),('admin.integrity.repair'),('admin.team.view'),('admin.team.manage'),('admin.imports.manage')) c(capability_code)
      where m.membership_type='OWNER' and m.status='ACTIVE' on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Admin operational history is retained forward-only.');
}
