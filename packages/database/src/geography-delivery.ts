import { sql, type Kysely } from 'kysely';
import type { CheckoutAreaPageDto } from '@maevelle/contracts';
import type { DatabaseSchema } from './index.js';
import { deliveryCoverageRules } from './orders/delivery-pricing.js';

/** Bounded prefix search over existing data, including aliases; no network/provider lookup. */
export async function searchDeliveryAreas(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; currency: string; query: string; offset: number },
): Promise<CheckoutAreaPageDto> {
  const result = await deliveryAreasQuery(input).execute(db);
  return {
    items: result.rows.slice(0, 20),
    nextOffset: result.rows.length > 20 ? input.offset + 20 : null,
  };
}

/** Shared compiled query also permits focused EXPLAIN verification on synthetic fixtures. */
export function deliveryAreasQuery(input: {
  organizationId: string;
  currency: string;
  query: string;
  offset: number;
}) {
  const needle =
    input.query
      .normalize('NFC')
      .trim()
      .toLocaleLowerCase()
      .replace(/[\\%_]/g, '\\$&') + '%';
  // Keep recursive child reads parameterized by parent even with stale import statistics.
  // The OFFSET 0 barrier prevents a materialized all-nodes nested-loop cross product.
  return sql<CheckoutAreaPageDto['items'][number]>`with recursive policies as materialized (
    select distinct on (r.geography_node_id) r.geography_node_id,r.checkout_serviceability
    from (${deliveryCoverageRules(input)}) r order by r.geography_node_id,r.priority desc,r.id
  ), areas as (
    select n.*,array[n.id] path,0 depth,null::text coverage from geography.nodes n where node_type='COUNTRY' and country_code='BD' and status='ACTIVE' and parent_id is null
    union all
    select n.*,a.path||n.id,a.depth+1,coalesce(p.checkout_serviceability,a.coverage)
      from areas a join lateral (
        select n.* from geography.nodes n where n.parent_id=a.id and n.status='ACTIVE' and n.node_type<>'COUNTRY'
          and not n.id=any(a.path) offset 0
      ) n on true left join policies p on p.geography_node_id=n.id
      where a.depth<32
  ), matches as materialized (
  select a.id,a.canonical_name,a.local_name,a.node_type,a.parent_id from areas a
  where a.node_type in ('DISTRICT','UPAZILA','THANA','CITY_CORPORATION','MUNICIPALITY','UNION','WARD','LOCALITY','VILLAGE')
    and (lower(a.canonical_name) like ${needle} or lower(a.local_name) like ${needle}
      or exists(select 1 from geography.node_aliases x where x.node_id=a.id and x.normalized_alias like ${needle}))
    and a.coverage='SUPPORTED'
    and exists(select 1 from delivery.delivery_methods where organization_id=${input.organizationId} and code='HOME_DELIVERY' and status='ACTIVE' and customer_visibility)
  order by a.canonical_name,a.id limit 21 offset ${input.offset}
  ) select a.id,a.canonical_name name,a.local_name as "localName",a.node_type as "nodeType",p.canonical_name as "parentName"
    from matches a left join geography.nodes p on p.id=a.parent_id order by a.canonical_name,a.id`;
}
