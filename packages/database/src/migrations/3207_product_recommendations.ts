import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema recommendations;
    create table recommendations.placements (
      organization_id uuid not null references platform.organizations(id),
      code text not null check(code in ('pdp_similar','pdp_complementary')),
      enabled boolean not null default true,
      target_count integer not null check(target_count between 1 and 12),
      candidate_limit integer not null default 96 check(candidate_limit between 12 and 200),
      minimum_score integer not null default 30 check(minimum_score between 0 and 100),
      strategy_key text not null default 'contextual_v1',
      strategy_version integer not null default 1 check(strategy_version > 0),
      version bigint not null default 1,
      updated_by uuid,
      updated_at timestamptz not null default now(),
      primary key(organization_id,code)
    );
    insert into recommendations.placements(organization_id,code,target_count,minimum_score)
      select id,'pdp_similar',4,30 from platform.organizations
      union all select id,'pdp_complementary',3,35 from platform.organizations;

    create table recommendations.product_settings (
      organization_id uuid not null,
      source_product_id uuid not null,
      placement_code text not null,
      mode text not null default 'HYBRID' check(mode in ('AUTOMATIC','HYBRID','MANUAL')),
      enabled boolean,
      target_count integer check(target_count between 1 and 12),
      minimum_score integer check(minimum_score between 0 and 100),
      version bigint not null default 1,
      updated_by uuid,
      updated_at timestamptz not null default now(),
      primary key(organization_id,source_product_id,placement_code),
      foreign key(organization_id,source_product_id) references catalog.products(organization_id,id),
      foreign key(organization_id,placement_code) references recommendations.placements(organization_id,code)
    );
    create table recommendations.product_actions (
      organization_id uuid not null,
      source_product_id uuid not null,
      placement_code text not null,
      target_product_id uuid not null,
      action text not null check(action in ('PIN','BOOST','EXCLUDE')),
      pin_position integer check(pin_position between 1 and 100),
      boost integer check(boost between 1 and 30),
      created_by uuid,
      updated_at timestamptz not null default now(),
      primary key(organization_id,source_product_id,placement_code,target_product_id),
      foreign key(organization_id,source_product_id) references catalog.products(organization_id,id),
      foreign key(organization_id,target_product_id) references catalog.products(organization_id,id),
      foreign key(organization_id,placement_code) references recommendations.placements(organization_id,code),
      check(source_product_id<>target_product_id),
      check((action='PIN' and pin_position is not null and boost is null)
        or (action='BOOST' and pin_position is null and boost is not null)
        or (action='EXCLUDE' and pin_position is null and boost is null))
    );
    create unique index recommendation_pin_position on recommendations.product_actions
      (organization_id,source_product_id,placement_code,pin_position) where action='PIN';
    create index recommendation_target_lookup on recommendations.product_actions
      (organization_id,target_product_id);
    create table recommendations.compatibility_rules (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      source_product_type_id uuid not null,
      target_product_type_id uuid not null,
      strength integer not null default 45 check(strength between 1 and 100),
      enabled boolean not null default true,
      version bigint not null default 1,
      updated_by uuid,
      updated_at timestamptz not null default now(),
      unique(organization_id,id),
      unique(organization_id,source_product_type_id,target_product_type_id),
      foreign key(organization_id,source_product_type_id) references catalog.product_types(organization_id,id),
      foreign key(organization_id,target_product_type_id) references catalog.product_types(organization_id,id)
    );
    create index recommendation_compatibility_source on recommendations.compatibility_rules
      (organization_id,source_product_type_id,target_product_type_id) where enabled;
    insert into iam.capability_definitions(capability_code,domain,description,sensitivity) values
      ('recommendations.view','recommendations','View product recommendation configuration.','INTERNAL'),
      ('recommendations.curate','recommendations','Curate product recommendation placements.','HIGH'),
      ('recommendations.manage','recommendations','Manage global recommendation strategy and compatibility.','HIGH')
    on conflict do nothing;
    insert into iam.membership_capability_grants(membership_id,capability_code)
      select m.id,c.code from iam.organization_memberships m
      cross join(values('recommendations.view'),('recommendations.curate'),('recommendations.manage')) c(code)
      where m.membership_type='OWNER' and m.status='ACTIVE' on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Recommendation configuration has no automatic down migration.');
}
