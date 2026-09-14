import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/**
 * Production-grade, revisioned sizing foundation.
 *
 * Repository policy treats this migration as a mutable heavy-development
 * baseline. Keep this file aligned with packages/database/src/sizing.ts rather
 * than creating follow-up migrations for baseline-only sizing changes.
 *
 * Design goals:
 * - tenant-safe relationships inside the sizing schema
 * - optional guide -> size-system binding
 * - immutable published revisions with optimistic draft versioning
 * - one editable draft per guide
 * - safe row reordering and row deletion
 * - historical published-guide preservation
 * - product/category/option-value integration
 */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists sizing;

    -- -----------------------------------------------------------------------
    -- Sizing domains
    -- -----------------------------------------------------------------------

    create table sizing.sizing_domains (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      code text not null,
      name text not null,
      subject_type text not null check (subject_type in ('BODY', 'GARMENT', 'PRODUCT')),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),

      unique (organization_id, code),
      unique (id, organization_id)
    );

    -- -----------------------------------------------------------------------
    -- Size systems
    -- -----------------------------------------------------------------------

    create table sizing.size_systems (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      sizing_domain_id uuid not null,
      code text not null,
      name text not null,
      region_code text,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),

      unique (organization_id, code),
      unique (id, organization_id),
      unique (id, organization_id, sizing_domain_id),

      constraint size_systems_domain_fk
        foreign key (sizing_domain_id, organization_id)
        references sizing.sizing_domains (id, organization_id)
        on delete restrict
    );

    -- -----------------------------------------------------------------------
    -- Size definitions
    -- -----------------------------------------------------------------------

    create table sizing.size_definitions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      size_system_id uuid not null,
      code text not null,
      label text not null,
      sort_order integer not null default 0 check (sort_order >= 0),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),

      unique (size_system_id, code),
      unique (id, organization_id),

      constraint size_definitions_system_fk
        foreign key (size_system_id, organization_id)
        references sizing.size_systems (id, organization_id)
        on delete restrict
    );

    -- -----------------------------------------------------------------------
    -- Measurement definitions
    -- -----------------------------------------------------------------------

    create table sizing.measurement_definitions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      sizing_domain_id uuid not null,
      code text not null,
      name text not null,
      description text,
      instructions text,
      sort_order integer not null default 0 check (sort_order >= 0),
      subject_type text not null check (subject_type in ('BODY', 'GARMENT', 'PRODUCT')),
      default_unit text not null check (default_unit in ('cm', 'inch', 'kg')),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),

      unique (sizing_domain_id, code),
      unique (id, organization_id),

      constraint measurement_definitions_domain_fk
        foreign key (sizing_domain_id, organization_id)
        references sizing.sizing_domains (id, organization_id)
        on delete restrict
    );

    -- -----------------------------------------------------------------------
    -- Size-guide head
    -- -----------------------------------------------------------------------

    create table sizing.size_guides (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      name text not null,
      description text,
      sizing_domain_id uuid not null,

      -- Optional because a guide may begin as a custom-label chart. Once
      -- size-definition rows are mapped, sizing.ts requires a concrete system.
      size_system_id uuid,

      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      current_published_revision_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1 check (version >= 1),

      unique (id, organization_id),

      constraint size_guides_domain_fk
        foreign key (sizing_domain_id, organization_id)
        references sizing.sizing_domains (id, organization_id)
        on delete restrict,

      -- When a guide is system-bound, PostgreSQL itself guarantees that the
      -- system belongs to the same tenant and the same sizing domain.
      constraint size_guides_system_domain_fk
        foreign key (size_system_id, organization_id, sizing_domain_id)
        references sizing.size_systems (id, organization_id, sizing_domain_id)
        on delete restrict
    );

    -- -----------------------------------------------------------------------
    -- Guide revisions
    -- -----------------------------------------------------------------------

    create table sizing.size_guide_revisions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      size_guide_id uuid not null,
      revision_number integer not null check (revision_number >= 1),
      status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),

      -- Optimistic concurrency token for every draft mutation.
      version bigint not null default 0 check (version >= 0),

      instructions text,
      fit_notes text,
      created_at timestamptz not null default now(),
      published_at timestamptz,
      created_by uuid references iam.users(id),

      unique (size_guide_id, revision_number),
      unique (id, organization_id),
      unique (id, size_guide_id, organization_id),

      constraint size_guide_revisions_guide_fk
        foreign key (size_guide_id, organization_id)
        references sizing.size_guides (id, organization_id)
        on delete restrict,

      constraint size_guide_revisions_publish_state_check
        check (
          (status = 'PUBLISHED' and published_at is not null)
          or status <> 'PUBLISHED'
        )
    );

    -- The current revision must belong to this exact guide and tenant, not
    -- merely be an arbitrary revision UUID from another guide.
    alter table sizing.size_guides
      add constraint size_guides_current_revision_fk
      foreign key (current_published_revision_id, id, organization_id)
      references sizing.size_guide_revisions (id, size_guide_id, organization_id)
      on delete restrict;

    -- There may be many historical published revisions, but only one editable
    -- draft revision per guide at a time.
    create unique index size_guide_revisions_one_draft_per_guide
      on sizing.size_guide_revisions (size_guide_id)
      where status = 'DRAFT';

    -- -----------------------------------------------------------------------
    -- Revision rows
    -- -----------------------------------------------------------------------

    create table sizing.size_guide_rows (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      revision_id uuid not null,
      size_definition_id uuid,
      display_label text not null,

      -- Do not add position >= 0 as a database check. reorderSizeGuideRows()
      -- deliberately uses temporary negative positions inside its transaction
      -- before writing the final non-negative order.
      position integer not null default 0,

      unique (id, organization_id),
      unique (revision_id, position),
      unique (revision_id, size_definition_id),

      constraint size_guide_rows_revision_fk
        foreign key (revision_id, organization_id)
        references sizing.size_guide_revisions (id, organization_id)
        on delete restrict,

      constraint size_guide_rows_definition_fk
        foreign key (size_definition_id, organization_id)
        references sizing.size_definitions (id, organization_id)
        on delete restrict
    );

    -- -----------------------------------------------------------------------
    -- Revision measurement matrix
    -- -----------------------------------------------------------------------

    create table sizing.size_guide_measurements (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      row_id uuid not null,
      measurement_definition_id uuid not null,
      value_type text not null check (value_type in ('EXACT', 'RANGE')),
      value_exact numeric(20,3),
      value_min numeric(20,3),
      value_max numeric(20,3),
      unit_code text not null check (unit_code in ('cm', 'inch', 'kg')),
      is_approximate boolean not null default false,

      unique (row_id, measurement_definition_id),

      constraint size_guide_measurements_row_fk
        foreign key (row_id, organization_id)
        references sizing.size_guide_rows (id, organization_id)
        on delete cascade,

      constraint size_guide_measurements_definition_fk
        foreign key (measurement_definition_id, organization_id)
        references sizing.measurement_definitions (id, organization_id)
        on delete restrict,

      constraint size_guide_measurements_value_shape_check
        check (
          (
            value_type = 'EXACT'
            and value_exact is not null
            and value_min is null
            and value_max is null
          )
          or
          (
            value_type = 'RANGE'
            and value_exact is null
            and value_min is not null
            and value_max is not null
            and value_min <= value_max
          )
        ),

      constraint size_guide_measurements_non_negative_check
        check (
          (value_exact is null or value_exact >= 0)
          and (value_min is null or value_min >= 0)
          and (value_max is null or value_max >= 0)
        )
    );

    -- -----------------------------------------------------------------------
    -- Product sizing configuration
    -- -----------------------------------------------------------------------

    create table sizing.product_size_configurations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      product_id uuid not null references catalog.products(id) on delete restrict,
      size_system_id uuid not null,
      size_guide_id uuid,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),

      unique (product_id),

      constraint product_size_configurations_system_fk
        foreign key (size_system_id, organization_id)
        references sizing.size_systems (id, organization_id)
        on delete restrict,

      constraint product_size_configurations_guide_fk
        foreign key (size_guide_id, organization_id)
        references sizing.size_guides (id, organization_id)
        on delete restrict
    );

    -- -----------------------------------------------------------------------
    -- Catalog integration
    -- -----------------------------------------------------------------------

    -- product_option_values.size_definition_id exists before this migration;
    -- this composite FK also prevents cross-tenant size-definition links.
    alter table catalog.product_option_values
      add constraint product_option_values_size_definition_fk
      foreign key (size_definition_id, organization_id)
      references sizing.size_definitions (id, organization_id)
      on delete restrict;

    -- -----------------------------------------------------------------------
    -- Performance / workflow indexes
    -- -----------------------------------------------------------------------

    create index sizing_domains_org_status
      on sizing.sizing_domains (organization_id, status, name, id);

    create index size_systems_domain_status
      on sizing.size_systems (organization_id, sizing_domain_id, status, name, id);

    create index size_definitions_system_sort
      on sizing.size_definitions (organization_id, size_system_id, status, sort_order, label, id);

    create index measurement_definitions_domain_sort
      on sizing.measurement_definitions (
        organization_id,
        sizing_domain_id,
        status,
        sort_order,
        name,
        id
      );

    create index size_guides_org_status_updated
      on sizing.size_guides (organization_id, status, updated_at desc, id);

    create index size_guides_domain_status
      on sizing.size_guides (organization_id, sizing_domain_id, status, updated_at desc, id);

    create index size_guides_system_status
      on sizing.size_guides (organization_id, size_system_id, status, updated_at desc, id)
      where size_system_id is not null;

    create index size_guide_revisions_guide_status
      on sizing.size_guide_revisions (
        organization_id,
        size_guide_id,
        status,
        revision_number desc,
        id
      );

    -- unique(revision_id, position) already supplies the row-order lookup index.

    create index size_guide_measurements_definition
      on sizing.size_guide_measurements (
        organization_id,
        measurement_definition_id,
        row_id
      );

    create index product_size_configurations_org_status
      on sizing.product_size_configurations (organization_id, status, product_id);

    create index product_size_configurations_guide_status
      on sizing.product_size_configurations (organization_id, size_guide_id, status, product_id)
      where size_guide_id is not null;

    create index product_size_configurations_system_status
      on sizing.product_size_configurations (organization_id, size_system_id, status, product_id);

    create index product_option_values_size_definition
      on catalog.product_option_values (organization_id, size_definition_id)
      where size_definition_id is not null;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Size guide revisions remain historical and have no automatic down migration.');
}
