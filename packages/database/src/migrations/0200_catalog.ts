import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Catalog truth: identity, taxonomy, options, variants, and structured product content only. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists catalog;

    create table catalog.product_types (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      code text not null,
      name text not null,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, code)
    );
    create index product_types_organization_status on catalog.product_types (organization_id, status);

    create table catalog.categories (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      parent_category_id uuid references catalog.categories(id),
      handle text not null,
      name text not null,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      position integer not null default 0,
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (parent_category_id is null or parent_category_id <> id),
      unique (organization_id, handle)
    );
    create index categories_organization_parent_position on catalog.categories (organization_id, parent_category_id, position, id);

    create table catalog.attribute_definitions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      code text not null,
      name text not null,
      value_type text not null check (value_type in ('TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'REFERENCE')),
      scope text not null check (scope in ('PRODUCT', 'VARIANT')),
      is_filterable boolean not null default false,
      is_searchable boolean not null default false,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      validation_config jsonb,
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, code),
      check (validation_config is null or jsonb_typeof(validation_config) = 'object')
    );
    create table catalog.product_type_attributes (
      product_type_id uuid not null references catalog.product_types(id),
      attribute_definition_id uuid not null references catalog.attribute_definitions(id),
      is_required boolean not null default false,
      primary key (product_type_id, attribute_definition_id)
    );

    create table catalog.products (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      product_type_id uuid not null references catalog.product_types(id),
      handle text not null,
      title text not null check (length(trim(title)) > 0),
      description text,
      status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED')),
      publication_status text not null default 'UNPUBLISHED' check (publication_status in ('UNPUBLISHED', 'PUBLISHED')),
      primary_category_id uuid references catalog.categories(id),
      published_at timestamptz,
      seo_title text,
      seo_description text,
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, handle),
      check (handle ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
      check ((publication_status = 'PUBLISHED' and status = 'ACTIVE' and published_at is not null) or (publication_status = 'UNPUBLISHED'))
    );
    create index products_storefront_lookup on catalog.products (organization_id, handle) where status = 'ACTIVE' and publication_status = 'PUBLISHED';
    create index products_admin_list on catalog.products (organization_id, status, publication_status, updated_at desc);

    create table catalog.product_handle_history (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      product_id uuid not null references catalog.products(id),
      old_handle text not null,
      changed_at timestamptz not null default now(),
      unique (organization_id, old_handle)
    );

    create table catalog.product_option_axes (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      product_id uuid not null references catalog.products(id),
      code text not null,
      name text not null,
      position integer not null default 0,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      unique (product_id, code)
    );
    create index product_option_axes_product_position on catalog.product_option_axes (product_id, position, id);

    create table catalog.colors (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      code text not null,
      name text not null,
      hex_value text,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      unique (organization_id, code),
      check (hex_value is null or hex_value ~ '^#[0-9a-fA-F]{6}$')
    );

    create table catalog.product_option_values (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      option_axis_id uuid not null references catalog.product_option_axes(id),
      code text not null,
      display_value text not null,
      color_id uuid references catalog.colors(id),
      size_definition_id uuid,
      position integer not null default 0,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      unique (option_axis_id, code)
    );
    create index product_option_values_axis_position on catalog.product_option_values (option_axis_id, position, id);

    create table catalog.product_variants (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      product_id uuid not null references catalog.products(id),
      sku text not null,
      sku_normalized text not null,
      barcode text,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      weight_value numeric(20,6),
      weight_unit text,
      length_value numeric(20,6),
      width_value numeric(20,6),
      height_value numeric(20,6),
      dimension_unit text,
      option_signature text not null,
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, sku_normalized),
      unique (product_id, option_signature)
    );
    create index product_variants_product_status on catalog.product_variants (product_id, status);

    create table catalog.variant_option_values (
      organization_id uuid not null references platform.organizations(id),
      variant_id uuid not null references catalog.product_variants(id),
      option_axis_id uuid not null references catalog.product_option_axes(id),
      option_value_id uuid not null references catalog.product_option_values(id),
      primary key (variant_id, option_axis_id),
      unique (variant_id, option_value_id)
    );
    create index variant_option_values_option_value on catalog.variant_option_values (option_value_id, variant_id);

    create table catalog.variant_colors (
      organization_id uuid not null references platform.organizations(id),
      variant_id uuid not null references catalog.product_variants(id),
      color_id uuid not null references catalog.colors(id),
      role text not null check (role in ('PRIMARY', 'ASSOCIATED')),
      position integer not null default 0,
      primary key (variant_id, color_id, role)
    );
    create unique index variant_colors_one_primary on catalog.variant_colors (variant_id) where role = 'PRIMARY';

    create table catalog.product_categories (
      organization_id uuid not null references platform.organizations(id),
      product_id uuid not null references catalog.products(id),
      category_id uuid not null references catalog.categories(id),
      primary key (product_id, category_id)
    );
    create index product_categories_category_product on catalog.product_categories (category_id, product_id);

    create table catalog.product_attribute_values (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      product_id uuid not null references catalog.products(id),
      attribute_definition_id uuid not null references catalog.attribute_definitions(id),
      value_text text,
      value_integer bigint,
      value_decimal numeric(28,12),
      value_boolean boolean,
      value_date date,
      value_reference_id uuid,
      unique (product_id, attribute_definition_id),
      check (num_nonnulls(value_text, value_integer, value_decimal, value_boolean, value_date, value_reference_id) = 1)
    );
    create table catalog.variant_attribute_values (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      variant_id uuid not null references catalog.product_variants(id),
      attribute_definition_id uuid not null references catalog.attribute_definitions(id),
      value_text text,
      value_integer bigint,
      value_decimal numeric(28,12),
      value_boolean boolean,
      value_date date,
      value_reference_id uuid,
      unique (variant_id, attribute_definition_id),
      check (num_nonnulls(value_text, value_integer, value_decimal, value_boolean, value_date, value_reference_id) = 1)
    );

    create table catalog.product_information_groups (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      product_id uuid not null references catalog.products(id),
      title text not null,
      position integer not null default 0
    );
    create table catalog.product_information_items (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      group_id uuid not null references catalog.product_information_groups(id),
      label text not null,
      value_text text not null,
      position integer not null default 0
    );
    create table catalog.product_faqs (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      product_id uuid not null references catalog.products(id),
      question text not null,
      answer text not null,
      position integer not null default 0
    );

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('catalog.view', 'catalog', 'View catalog administration data.', 'INTERNAL'),
      ('catalog.manage', 'catalog', 'Create and manage catalog products, categories, and variants.', 'HIGH'),
      ('catalog.publish', 'catalog', 'Publish and unpublish catalog products.', 'HIGH'),
      ('media.view', 'media', 'View media administration data.', 'INTERNAL'),
      ('media.manage', 'media', 'Upload and attach media assets.', 'HIGH'),
      ('sizing.view', 'sizing', 'View sizing administration data.', 'INTERNAL'),
      ('sizing.manage', 'sizing', 'Create and manage size guides.', 'HIGH')
    on conflict (capability_code) do nothing;

    insert into iam.membership_capability_grants (membership_id, capability_code)
    select membership.id, capability.capability_code
    from iam.organization_memberships membership
    cross join (values
      ('catalog.view'), ('catalog.manage'), ('catalog.publish'),
      ('media.view'), ('media.manage'), ('sizing.view'), ('sizing.manage')
    ) as capability(capability_code)
    where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Catalog data is historical business truth and has no automatic down migration.');
}
