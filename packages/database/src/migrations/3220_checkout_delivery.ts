import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table orders.delivery_pricing_rules add column checkout_serviceability text not null default 'UNVERIFIED'
      check (checkout_serviceability in ('UNVERIFIED','SUPPORTED','UNSUPPORTED'));
    alter table geography.nodes add column country_code text
      check (country_code is null or (node_type='COUNTRY' and country_code ~ '^[A-Z]{2}$'));
    -- Only explicit ISO source identifiers can be mapped without inventing geography.
    update geography.nodes set country_code='BD' where node_type='COUNTRY' and source_code='BD';
    alter table customers.customer_addresses add column delivery_instructions text
      check (delivery_instructions is null or length(delivery_instructions)<=500);
    alter table customers.customer_addresses add constraint customer_address_tenant_identity unique(organization_id,customer_id,id);
    alter table orders.checkout_drafts add constraint checkout_delivery_customer_identity unique(organization_id,id,owner_customer_id);
    create table orders.checkout_draft_delivery (
      draft_id uuid primary key,
      organization_id uuid not null,
      recipient_name text not null check (length(recipient_name) between 1 and 120),
      mobile text not null check (mobile ~ '^\\+8801[3-9][0-9]{8}$'),
      geography_node_id uuid not null references geography.nodes(id) on delete restrict,
      country_code text not null check (country_code='BD'),
      address_line_1 text not null check (length(address_line_1) between 1 and 500),
      address_line_2 text check (length(address_line_2)<=300),
      instructions text check (length(instructions)<=500),
      saved_address_id uuid,
      saved_customer_id uuid,
      saved_address_revision bigint,
      configuration_revision text not null check (length(configuration_revision)=43),
      foreign key (organization_id,draft_id) references orders.checkout_drafts(organization_id,id) on delete cascade,
      foreign key (organization_id,draft_id,saved_customer_id)
        references orders.checkout_drafts(organization_id,id,owner_customer_id) on delete cascade,
      foreign key (organization_id,saved_customer_id,saved_address_id)
        references customers.customer_addresses(organization_id,customer_id,id) on delete restrict,
      check ((saved_address_id is null and saved_customer_id is null and saved_address_revision is null)
        or (saved_address_id is not null and saved_customer_id is not null and saved_address_revision is not null and saved_address_revision>0))
    );
    create index checkout_delivery_geo on orders.checkout_draft_delivery(geography_node_id);
    create index checkout_delivery_address on orders.checkout_draft_delivery(organization_id,saved_customer_id,saved_address_id);
    create index checkout_coverage_resolution on orders.delivery_pricing_rules(organization_id,geography_node_id,currency_code,priority desc,id)
      include(checkout_serviceability) where status='ACTIVE';
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error('Checkout delivery requires forward repair.');
}
