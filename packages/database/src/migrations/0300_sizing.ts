import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Structured, revisioned sizing foundation; it is intentionally independent of clothing-only labels. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists sizing;

    create table sizing.sizing_domains (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      code text not null,
      name text not null,
      subject_type text not null check (subject_type in ('BODY', 'GARMENT', 'PRODUCT')),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      unique (organization_id, code)
    );
    create table sizing.size_systems (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      sizing_domain_id uuid not null references sizing.sizing_domains(id),
      code text not null,
      name text not null,
      region_code text,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      unique (organization_id, code)
    );
    create table sizing.size_definitions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      size_system_id uuid not null references sizing.size_systems(id),
      code text not null,
      label text not null,
      sort_order integer not null default 0,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      unique (size_system_id, code)
    );
    create table sizing.measurement_definitions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      sizing_domain_id uuid not null references sizing.sizing_domains(id),
      code text not null,
      name text not null,
      description text,
      instructions text,
      sort_order integer not null default 0,
      subject_type text not null check (subject_type in ('BODY', 'GARMENT', 'PRODUCT')),
      default_unit text not null check (default_unit in ('cm', 'inch')),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      unique (sizing_domain_id, code)
    );
    create table sizing.size_guides (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      name text not null,
      description text,
      sizing_domain_id uuid not null references sizing.sizing_domains(id),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      current_published_revision_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1
    );
    create table sizing.size_guide_revisions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      size_guide_id uuid not null references sizing.size_guides(id),
      revision_number integer not null,
      status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
      instructions text,
      fit_notes text,
      created_at timestamptz not null default now(),
      published_at timestamptz,
      created_by uuid references iam.users(id),
      unique (size_guide_id, revision_number),
      check ((status = 'PUBLISHED' and published_at is not null) or status <> 'PUBLISHED')
    );
    alter table sizing.size_guides add constraint size_guides_current_revision_fk foreign key (current_published_revision_id) references sizing.size_guide_revisions(id);
    create table sizing.size_guide_rows (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      revision_id uuid not null references sizing.size_guide_revisions(id),
      size_definition_id uuid references sizing.size_definitions(id),
      display_label text not null,
      position integer not null default 0
    );
    create index size_guide_rows_revision_position on sizing.size_guide_rows (revision_id, position, id);
    create table sizing.size_guide_measurements (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      row_id uuid not null references sizing.size_guide_rows(id),
      measurement_definition_id uuid not null references sizing.measurement_definitions(id),
      value_type text not null check (value_type in ('EXACT', 'RANGE')),
      value_exact numeric(20,6),
      value_min numeric(20,6),
      value_max numeric(20,6),
      unit_code text not null check (unit_code in ('cm', 'inch')),
      is_approximate boolean not null default false,
      check ((value_type = 'EXACT' and value_exact is not null and value_min is null and value_max is null) or (value_type = 'RANGE' and value_exact is null and value_min is not null and value_max is not null and value_min <= value_max)),
      unique (row_id, measurement_definition_id)
    );
    create table sizing.product_size_configurations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      product_id uuid not null references catalog.products(id),
      size_system_id uuid not null references sizing.size_systems(id),
      size_guide_id uuid references sizing.size_guides(id),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      unique (product_id)
    );
    alter table catalog.product_option_values add constraint product_option_values_size_definition_fk foreign key (size_definition_id) references sizing.size_definitions(id);

    -- Performance indexes for efficient guide management and storefront queries
    create index size_guide_revisions_guide_status on sizing.size_guide_revisions (size_guide_id, status);
    create index product_size_configurations_org_status on sizing.product_size_configurations (organization_id, status);
    create index measurement_definitions_domain_sort on sizing.measurement_definitions (sizing_domain_id, sort_order, id);
    create index size_definitions_system_sort on sizing.size_definitions (size_system_id, sort_order, id);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Size guide revisions remain historical and have no automatic down migration.');
}
