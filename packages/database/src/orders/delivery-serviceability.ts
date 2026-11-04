import { sql, type Kysely } from 'kysely';
import { hashToken } from '@maevelle/security';
import type { CheckoutDeliveryEligibilityDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { deliveryPricingSelection, deliveryCoverageSelection } from './delivery-pricing.js';

/** One statement gives a coherent nonfinal policy observation; final quotes must reevaluate. */
export async function deliveryServiceability(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; currency: string; geographyNodeId: string },
): Promise<CheckoutDeliveryEligibilityDto> {
  const result = await sql<{
    valid: boolean;
    covered: boolean;
    method_active: boolean;
    provenance: unknown;
    rule_id: string | null;
    rule_revision: string | null;
    amount: string | null;
  }>`with recursive ancestry as (
    select n.*,0 depth,array[n.id] path from geography.nodes n where id=${input.geographyNodeId}
    union all
    select n.*,a.depth+1,a.path||n.id from geography.nodes n join ancestry a on n.id=a.parent_id
      where a.depth<32 and not n.id=any(a.path)
  ), selected as (${deliveryPricingSelection({ ...input, countryCode: 'BD' })})
  select
    (exists(select 1 from ancestry where depth=0 and node_type in
      ('DISTRICT','UPAZILA','THANA','CITY_CORPORATION','MUNICIPALITY','UNION','WARD','LOCALITY','VILLAGE'))
     and exists(select 1 from ancestry where node_type='COUNTRY' and country_code='BD' and parent_id is null)
     and (select count(*) from ancestry where node_type='COUNTRY')=1
     and not exists(select 1 from ancestry where status<>'ACTIVE')) valid,
    (${deliveryCoverageSelection(input)})='SUPPORTED' covered,
    exists(select 1 from delivery.delivery_methods where organization_id=${input.organizationId}
      and code='HOME_DELIVERY' and status='ACTIVE' and customer_visibility) method_active,
    jsonb_build_object('geography',(select jsonb_agg(jsonb_build_array(id,version::text,status,parent_id,country_code,node_type) order by depth) from ancestry),
      'tariffs',(select jsonb_agg(jsonb_build_array(id,version::text,status,priority,flat_amount::text,geography_node_id,checkout_serviceability) order by id)
        from orders.delivery_pricing_rules where organization_id=${input.organizationId} and country_code='BD'
          and currency_code=${input.currency} and (geography_node_id is null or geography_node_id in(select id from ancestry))),
      'methods',(select jsonb_agg(jsonb_build_array(id,version::text,status,customer_visibility,configuration) order by id)
        from delivery.delivery_methods where organization_id=${input.organizationId} and code='HOME_DELIVERY')) provenance,
    (select id from selected) rule_id,(select version from selected) rule_revision,
    (select flat_amount from selected) amount`.execute(db);
  const row = result.rows[0]!;
  const status =
    !row.valid || !row.covered
      ? 'UNSUPPORTED_AREA'
      : !row.method_active || !row.rule_id
        ? 'DELIVERY_UNAVAILABLE'
        : 'ELIGIBLE';
  return {
    status,
    configurationRevision: hashToken(JSON.stringify(row.provenance)),
    tariff:
      status === 'ELIGIBLE'
        ? {
            ruleId: row.rule_id!,
            revision: row.rule_revision!,
            amount: row.amount!,
            currency: input.currency,
            final: false,
          }
        : null,
    courierCompatibility: 'NOT_EVALUATED',
  };
}
