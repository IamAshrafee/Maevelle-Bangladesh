import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Commercial customers deliberately remain separate from Better Auth identities. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists customers;

    create table customers.customers (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_number text not null,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'BLOCKED', 'MERGED', 'ANONYMIZED')),
      display_name text not null check (length(trim(display_name)) > 0),
      first_name text check (first_name is null or length(trim(first_name)) > 0),
      last_name text check (last_name is null or length(trim(last_name)) > 0),
      preferred_language text check (preferred_language is null or preferred_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
      lifecycle_stage text not null default 'NEW_CONTACT' check (lifecycle_stage in ('NEW_CONTACT','PROSPECT','ENGAGED_PROSPECT','FIRST_TIME_BUYER','REPEAT_CUSTOMER','LOYAL_CUSTOMER','INACTIVE_CUSTOMER','RE_ENGAGED_CUSTOMER')),
      relationship_owner_membership_id uuid,
      relationship_status text not null default 'UNASSIGNED' check (relationship_status in ('UNASSIGNED','ACTIVE','FOLLOW_UP','AT_RISK','DORMANT')),
      profile_image_asset_id uuid,
      profile_provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(profile_provenance) = 'object'),
      last_activity_at timestamptz,
      first_purchase_at timestamptz,
      last_purchase_at timestamptz,
      first_source text not null default 'ADMIN_CREATED'
        check (first_source in ('STOREFRONT', 'MANUAL_ORDER', 'FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'PHONE', 'IMPORT', 'ADMIN_CREATED', 'EXTERNAL_API')),
      latest_source text not null default 'ADMIN_CREATED'
        check (latest_source in ('STOREFRONT', 'MANUAL_ORDER', 'FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'PHONE', 'IMPORT', 'ADMIN_CREATED', 'EXTERNAL_API')),
      canonical_customer_id uuid references customers.customers(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, customer_number),
      unique (organization_id, id),
      foreign key (organization_id, relationship_owner_membership_id) references iam.organization_memberships(organization_id, id),
      foreign key (organization_id, profile_image_asset_id) references media.media_assets(organization_id, id),
      check ((status = 'MERGED') = (canonical_customer_id is not null)),
      check (canonical_customer_id is null or canonical_customer_id <> id),
      check (first_purchase_at is null or last_purchase_at is null or first_purchase_at <= last_purchase_at)
    );
    create index customers_customers_organization_name_index
      on customers.customers (organization_id, lower(display_name), id);
    create index customers_customers_organization_source_index
      on customers.customers (organization_id, first_source, created_at desc);
    create index customers_customers_crm_directory_index
      on customers.customers (organization_id, status, lifecycle_stage, last_activity_at desc nulls last, id);
    create index customers_customers_owner_index
      on customers.customers (organization_id, relationship_owner_membership_id, relationship_status, last_activity_at desc nulls last)
      where relationship_owner_membership_id is not null;

    create table customers.customer_phones (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      raw_value text not null,
      normalized_value text not null,
      country_code text,
      is_primary boolean not null default false,
      verification_status text not null default 'UNVERIFIED' check (verification_status in ('UNVERIFIED', 'VERIFIED', 'BOUNCED')),
      verified_at timestamptz,
      verification_source text check (verification_source is null or verification_source in ('OTP_SMS', 'MANUAL_STAFF', 'CALL_VERIFIED', 'IMPORT', 'ORDER_DELIVERED')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );
    create index customers_phone_lookup_index on customers.customer_phones (organization_id, normalized_value);
    create unique index customers_one_primary_phone_index on customers.customer_phones (customer_id) where is_primary;

    create table customers.customer_emails (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      raw_value text not null,
      normalized_value text not null,
      is_primary boolean not null default false,
      verification_status text not null default 'UNVERIFIED' check (verification_status in ('UNVERIFIED', 'VERIFIED', 'BOUNCED')),
      verified_at timestamptz,
      verification_source text check (verification_source is null or verification_source in ('MAGIC_LINK', 'OTP_EMAIL', 'MANUAL_STAFF', 'IMPORT')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );
    create index customers_email_lookup_index on customers.customer_emails (organization_id, normalized_value);
    create unique index customers_one_primary_email_index on customers.customer_emails (customer_id) where is_primary;

    create table customers.customer_addresses (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      label text,
      recipient_name text not null,
      phone text,
      address_line_1 text not null,
      address_line_2 text,
      geography_node_id uuid references geography.nodes(id),
      area text,
      city text,
      district text,
      postal_code text,
      country_code text not null,
      is_default boolean not null default false,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );
    create index customers_address_customer_index on customers.customer_addresses (organization_id, customer_id, status);
    create index customers_address_geography_index on customers.customer_addresses (geography_node_id) where geography_node_id is not null;
    create unique index customers_one_default_address_index on customers.customer_addresses (customer_id) where is_default and status = 'ACTIVE';

    create table customers.customer_restrictions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      restriction_type text not null check (restriction_type in ('ORDERING_BLOCKED', 'COD_RESTRICTED', 'ORDER_REVIEW_REQUIRED')),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'LIFTED', 'EXPIRED')),
      reason text not null check (length(trim(reason)) > 0),
      notes text,
      created_by uuid not null,
      expires_at timestamptz,
      lifted_at timestamptz,
      lifted_by uuid,
      lift_reason text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );
    create index customer_restrictions_active_idx on customers.customer_restrictions (organization_id, customer_id, restriction_type) where status = 'ACTIVE';
    create index customer_restrictions_org_status_idx on customers.customer_restrictions (organization_id, status, created_at desc);

    create table customers.customer_accounts (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      user_id uuid not null references iam.users(id),
      link_type text not null check (link_type in ('VERIFIED_PHONE', 'VERIFIED_EMAIL', 'MANUAL_CLAIM', 'INVITATION', 'GUEST_CONVERSION')),
      verified_at timestamptz not null default now(),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'UNLINKED', 'SUSPENDED')),
      unlinked_at timestamptz,
      unlinked_by uuid,
      unlink_reason text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id),
      unique (organization_id, customer_id),
      unique (organization_id, user_id)
    );
    create index customer_accounts_user_idx on customers.customer_accounts (organization_id, user_id, status);
    create index customer_accounts_customer_idx on customers.customer_accounts (organization_id, customer_id, status);

    create table customers.customer_duplicate_candidates (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_a_id uuid not null,
      customer_b_id uuid not null,
      confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
      signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals) = 'array'),
      status text not null default 'OPEN' check (status in ('OPEN', 'DISMISSED', 'CONFIRMED')),
      created_at timestamptz not null default now(),
      resolved_at timestamptz,
      check (customer_a_id < customer_b_id),
      unique (organization_id, customer_a_id, customer_b_id),
      foreign key (organization_id, customer_a_id) references customers.customers(organization_id, id),
      foreign key (organization_id, customer_b_id) references customers.customers(organization_id, id)
    );

    create table customers.customer_merges (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      source_customer_id uuid not null,
      target_customer_id uuid not null,
      reason text,
      conflict_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(conflict_snapshot) = 'object'),
      created_by uuid,
      created_at timestamptz not null default now(),
      check (source_customer_id <> target_customer_id),
      foreign key (organization_id, source_customer_id) references customers.customers(organization_id, id),
      foreign key (organization_id, target_customer_id) references customers.customers(organization_id, id)
    );
    create unique index customers_customer_merges_source_unique on customers.customer_merges (source_customer_id);

    create table customers.customer_anonymizations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      reason_code text not null check (length(trim(reason_code)) > 0),
      reason_text text,
      affected_alias_count integer not null default 0 check (affected_alias_count >= 0),
      created_by uuid not null,
      created_at timestamptz not null default now(),
      unique (organization_id, customer_id),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );

    create table customers.customer_aliases (
      organization_id uuid not null references platform.organizations(id),
      alias_customer_id uuid not null,
      canonical_customer_id uuid not null,
      created_at timestamptz not null default now(),
      primary key (organization_id, alias_customer_id),
      foreign key (organization_id, alias_customer_id) references customers.customers(organization_id, id),
      foreign key (organization_id, canonical_customer_id) references customers.customers(organization_id, id),
      check (alias_customer_id <> canonical_customer_id)
    );

    -- Operator-authored notes attached to a customer record.
    create table customers.customer_notes (
      id              uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id     uuid not null,
      author_actor_id uuid not null,
      body            text not null check (length(trim(body)) > 0),
      is_pinned       boolean not null default false,
      updated_at      timestamptz not null default now(),
      version         bigint not null default 1 check (version > 0),
      created_at      timestamptz not null default now(),
      unique (organization_id, id),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );
    create index customer_notes_customer_idx on customers.customer_notes (customer_id, created_at desc);

    create table customers.customer_note_revisions (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      note_id uuid not null,
      customer_id uuid not null,
      body text not null,
      is_pinned boolean not null,
      version bigint not null check (version > 0),
      changed_by_actor_id uuid not null,
      changed_at timestamptz not null default now(),
      foreign key (organization_id, note_id) references customers.customer_notes(organization_id, id),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id),
      unique (note_id, version)
    );
    create index customer_note_revisions_note_idx on customers.customer_note_revisions (note_id, version desc);

    -- Organisation-level tag registry: tags are shared across customers, not free-form per record.
    -- Shared registry allows filtering, reporting, and consistent naming without typo variants.
    create table customers.customer_tags (
      id              uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      label           text not null check (length(trim(label)) > 0),
      color           text,
      created_at      timestamptz not null default now(),
      unique (organization_id, id)
    );
    create unique index customer_tags_label_unique_idx on customers.customer_tags (organization_id, lower(label));

    -- Many-to-many assignment of org tags to individual customers.
    create table customers.customer_tag_assignments (
      organization_id uuid not null references platform.organizations(id),
      customer_id     uuid not null,
      tag_id          uuid not null,
      created_at      timestamptz not null default now(),
      primary key (organization_id, customer_id, tag_id),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id),
      foreign key (organization_id, tag_id) references customers.customer_tags(organization_id, id)
    );
    create index customer_tag_customer_idx on customers.customer_tag_assignments (customer_id);

    create table customers.customer_custom_field_definitions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
      label text not null check (length(trim(label)) between 1 and 120),
      description text,
      value_type text not null check (value_type in ('TEXT','NUMBER','BOOLEAN','DATE','SINGLE_CHOICE','MULTI_CHOICE')),
      choices jsonb not null default '[]'::jsonb check (jsonb_typeof(choices) = 'array'),
      validation jsonb not null default '{}'::jsonb check (jsonb_typeof(validation) = 'object'),
      is_required boolean not null default false,
      is_searchable boolean not null default false,
      edit_capability text not null default 'customers.manage',
      schema_version bigint not null default 1 check (schema_version > 0),
      status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
      created_by_actor_id uuid not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, id),
      unique (organization_id, field_key),
      check ((value_type in ('SINGLE_CHOICE','MULTI_CHOICE')) or choices = '[]'::jsonb)
    );

    create table customers.customer_custom_field_values (
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      field_definition_id uuid not null,
      schema_version bigint not null check (schema_version > 0),
      value jsonb not null,
      updated_by_actor_id uuid not null,
      updated_at timestamptz not null default now(),
      primary key (organization_id, customer_id, field_definition_id),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id),
      foreign key (organization_id, field_definition_id) references customers.customer_custom_field_definitions(organization_id, id)
    );
    create index customer_custom_values_search_idx on customers.customer_custom_field_values using gin (value jsonb_path_ops);

    create table customers.customer_preferences (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      preference_key text not null check (preference_key ~ '^[a-z][a-z0-9_]{1,63}$'),
      value jsonb not null,
      source text not null check (source in ('CUSTOMER_CONFIRMED','AGENT_RECORDED','COMMERCE_OBSERVED','IMPORTED')),
      confidence text not null default 'CONFIRMED' check (confidence in ('INFERRED','REPORTED','CONFIRMED')),
      evidence_reference text,
      recorded_by_actor_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1 check (version > 0),
      unique (organization_id, id),
      unique (organization_id, customer_id, preference_key),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );
    create index customer_preferences_customer_idx on customers.customer_preferences (organization_id, customer_id, preference_key);

    create table customers.customer_lifecycle_history (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      previous_stage text,
      new_stage text not null check (new_stage in ('NEW_CONTACT','PROSPECT','ENGAGED_PROSPECT','FIRST_TIME_BUYER','REPEAT_CUSTOMER','LOYAL_CUSTOMER','INACTIVE_CUSTOMER','RE_ENGAGED_CUSTOMER')),
      transition_source text not null check (transition_source in ('AUTOMATIC','MANUAL_OVERRIDE','RECALCULATION')),
      rule_version bigint,
      reason text not null check (length(trim(reason)) > 0),
      actor_id uuid,
      occurred_at timestamptz not null default now(),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );
    create index customer_lifecycle_history_customer_idx on customers.customer_lifecycle_history (organization_id, customer_id, occurred_at desc, id desc);

    create table customers.customer_lifecycle_rules (
      organization_id uuid primary key references platform.organizations(id),
      rule_version bigint not null default 1 check (rule_version > 0),
      loyal_completed_order_threshold integer not null default 5 check (loyal_completed_order_threshold >= 2),
      inactive_after_days integer not null default 180 check (inactive_after_days between 30 and 3650),
      updated_by_actor_id uuid not null,
      updated_at timestamptz not null default now()
    );

    create table customers.customer_ownership_history (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      previous_owner_membership_id uuid,
      new_owner_membership_id uuid,
      previous_relationship_status text,
      new_relationship_status text not null check (new_relationship_status in ('UNASSIGNED','ACTIVE','FOLLOW_UP','AT_RISK','DORMANT')),
      reason text not null check (length(trim(reason)) > 0),
      changed_by_actor_id uuid not null,
      changed_at timestamptz not null default now(),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id),
      foreign key (organization_id, previous_owner_membership_id) references iam.organization_memberships(organization_id, id),
      foreign key (organization_id, new_owner_membership_id) references iam.organization_memberships(organization_id, id)
    );
    create index customer_ownership_history_customer_idx on customers.customer_ownership_history (organization_id, customer_id, changed_at desc, id desc);

    create table customers.customer_follow_ups (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      assigned_membership_id uuid not null,
      title text not null check (length(trim(title)) between 1 and 160),
      details text,
      due_at timestamptz not null,
      status text not null default 'OPEN' check (status in ('OPEN','COMPLETED','CANCELLED')),
      completed_at timestamptz,
      completed_by_actor_id uuid,
      created_by_actor_id uuid not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1 check (version > 0),
      unique (organization_id, id),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id),
      foreign key (organization_id, assigned_membership_id) references iam.organization_memberships(organization_id, id),
      check ((status = 'COMPLETED') = (completed_at is not null))
    );
    create index customer_follow_ups_worklist_idx on customers.customer_follow_ups (organization_id, assigned_membership_id, status, due_at, id);
    create index customer_follow_ups_customer_idx on customers.customer_follow_ups (organization_id, customer_id, status, due_at);

    create table customers.customer_segments (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      name text not null check (length(trim(name)) between 1 and 120),
      description text,
      segment_type text not null check (segment_type in ('STATIC','DYNAMIC')),
      rule_definition jsonb not null default '{"all":[]}'::jsonb check (jsonb_typeof(rule_definition) = 'object'),
      status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
      version bigint not null default 1 check (version > 0),
      created_by_actor_id uuid not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, id)
    );
    create unique index customer_segments_name_unique_idx on customers.customer_segments (organization_id, lower(name)) where status = 'ACTIVE';

    create table customers.customer_segment_memberships (
      organization_id uuid not null references platform.organizations(id),
      segment_id uuid not null,
      customer_id uuid not null,
      membership_source text not null check (membership_source in ('MANUAL','RULE_EVALUATION')),
      explanation jsonb not null default '[]'::jsonb check (jsonb_typeof(explanation) = 'array'),
      evaluated_at timestamptz not null default now(),
      primary key (organization_id, segment_id, customer_id),
      foreign key (organization_id, segment_id) references customers.customer_segments(organization_id, id),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );
    create index customer_segment_members_customer_idx on customers.customer_segment_memberships (organization_id, customer_id, segment_id);

    create table customers.customer_saved_views (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      owner_membership_id uuid,
      name text not null check (length(trim(name)) between 1 and 120),
      visibility text not null check (visibility in ('PERSONAL','ORGANIZATION')),
      filters jsonb not null check (jsonb_typeof(filters) = 'object'),
      created_by_actor_id uuid not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1 check (version > 0),
      unique (organization_id, id),
      foreign key (organization_id, owner_membership_id) references iam.organization_memberships(organization_id, id),
      check ((visibility = 'PERSONAL') = (owner_membership_id is not null))
    );
    create unique index customer_saved_views_personal_name_idx on customers.customer_saved_views (organization_id, owner_membership_id, lower(name)) where visibility = 'PERSONAL';
    create unique index customer_saved_views_shared_name_idx on customers.customer_saved_views (organization_id, lower(name)) where visibility = 'ORGANIZATION';

    create table customers.customer_consents (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      purpose text not null check (length(trim(purpose)) between 1 and 80),
      channel text not null check (channel in ('EMAIL','SMS','PHONE','WEBSITE','FACEBOOK','INSTAGRAM','ANY')),
      status text not null check (status in ('GRANTED','DENIED','WITHDRAWN','SUPPRESSED')),
      lawful_basis text check (lawful_basis is null or lawful_basis in ('CONSENT','CONTRACT','LEGAL_OBLIGATION','LEGITIMATE_INTEREST')),
      source text not null,
      evidence_reference text,
      recorded_by_actor_id uuid,
      effective_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );
    create index customer_consents_effective_idx on customers.customer_consents (organization_id, customer_id, purpose, channel, effective_at desc, id desc);

    create table customers.customer_privacy_requests (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      request_type text not null check (request_type in ('ACCESS','EXPORT','CORRECTION','ANONYMIZATION','RESTRICTION')),
      status text not null default 'OPEN' check (status in ('OPEN','IDENTITY_VERIFICATION_REQUIRED','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED')),
      requester_reference text,
      reason text not null check (length(trim(reason)) > 0),
      resolution_notes text,
      assigned_membership_id uuid,
      due_at timestamptz,
      completed_at timestamptz,
      created_by_actor_id uuid not null,
      updated_by_actor_id uuid not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1 check (version > 0),
      unique (organization_id, id),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id),
      foreign key (organization_id, assigned_membership_id) references iam.organization_memberships(organization_id, id)
    );
    create index customer_privacy_requests_worklist_idx on customers.customer_privacy_requests (organization_id, status, due_at nulls last, created_at, id);

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('customers.view',   'customers', 'View customer administration data.', 'HIGH'),
      ('customers.manage', 'customers', 'Create and manage commercial customers, contacts, addresses, notes, and tags.', 'HIGH'),
      ('customers.merge', 'customers', 'Merge duplicate customer identities while preserving historical commerce evidence.', 'HIGH'),
      ('customers.restrict', 'customers', 'Apply and lift commercial restrictions on customers.', 'HIGH'),
      ('customers.anonymize', 'customers', 'Anonymize customer profile data after operational eligibility checks.', 'RESTRICTED'),
      ('customers.sensitive.view', 'customers', 'View unmasked customer contact details and sensitive CRM context.', 'RESTRICTED'),
      ('customers.identity.manage', 'customers', 'Review, link, dispute, and revoke cross-channel customer identities.', 'RESTRICTED'),
      ('customers.relationship.manage', 'customers', 'Assign relationship ownership and manage customer follow-ups.', 'HIGH'),
      ('customers.segments.manage', 'customers', 'Create and evaluate customer segments and saved shared views.', 'HIGH'),
      ('customers.export', 'customers', 'Export authorized customer-owned data.', 'RESTRICTED'),
      ('customers.privacy.manage', 'customers', 'Manage consent, suppression, correction, export, and anonymization requests.', 'RESTRICTED'),
      ('customers.settings.manage', 'customers', 'Manage CRM lifecycle rules and typed custom-field definitions.', 'RESTRICTED')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('customers.view'), ('customers.manage'), ('customers.merge'), ('customers.restrict'), ('customers.anonymize'), ('customers.sensitive.view'), ('customers.identity.manage'), ('customers.relationship.manage'), ('customers.segments.manage'), ('customers.export'), ('customers.privacy.manage'), ('customers.settings.manage')) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Customer records are commercial history and have no automatic down migration.');
}
