import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** User-scoped operational convenience data; never a replacement for domain truth. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists settings;
    create table settings.organization_profiles (
      organization_id uuid primary key references platform.organizations(id),
      schema_version integer not null default 1 check(schema_version=1),
      business_profile jsonb not null default '{}'::jsonb check(jsonb_typeof(business_profile)='object'),
      storefront_profile jsonb not null default '{}'::jsonb check(jsonb_typeof(storefront_profile)='object'),
      updated_at timestamptz not null default now(), updated_by uuid
    );
    create table platform.saved_views (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), user_id uuid not null references iam.users(id),
      resource_key text not null check(resource_key in ('orders','inventory','customers','payments','deliveries','returns','purchases','shipments')),
      name text not null check(length(trim(name)) between 1 and 100), filters jsonb not null default '{}'::jsonb check(jsonb_typeof(filters)='object'),
      sort jsonb not null default '[]'::jsonb check(jsonb_typeof(sort)='array'), columns jsonb not null default '[]'::jsonb check(jsonb_typeof(columns)='array'),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,user_id,resource_key,name)
    );
    create table platform.feature_flags (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), flag_key text not null,
      enabled boolean not null default false, rollout jsonb not null default '{}'::jsonb check(jsonb_typeof(rollout)='object'), updated_at timestamptz not null default now(), updated_by uuid,
      unique(organization_id,flag_key)
    );
    create table platform.import_jobs (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), requested_by uuid not null references iam.users(id),
      import_type text not null check(import_type in ('CATALOG_PRODUCTS')), status text not null check(status in ('UPLOADED','VALIDATED','CONFIRMED','PROCESSING','COMPLETED','FAILED')),
      source_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(source_metadata)='object'), validation_result jsonb not null default '{}'::jsonb check(jsonb_typeof(validation_result)='object'),
      created_at timestamptz not null default now(), completed_at timestamptz
    );
    insert into iam.capability_definitions(capability_code,domain,description,sensitivity) values
      ('admin.operations.view','admin','View operational dashboard, queues, and integrity summaries.','INTERNAL'),
      ('settings.view','settings','View organization configuration.','INTERNAL'),
      ('settings.organization.manage','settings','Manage typed organization and storefront settings.','HIGH'),
      ('admin.saved_views.manage','admin','Manage personal saved list views.','INTERNAL'),
      ('admin.exports.view','admin','Export permission-scoped operational list data.','HIGH') on conflict do nothing;
    insert into iam.membership_capability_grants(membership_id,capability_code)
      select membership.id,capability.capability_code from iam.organization_memberships membership cross join(values('admin.operations.view'),('settings.view'),('settings.organization.manage'),('admin.saved_views.manage'),('admin.exports.view')) capability(capability_code)
      where membership.membership_type='OWNER' and membership.status='ACTIVE' on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Admin operational records are retained forward-only.');
}
