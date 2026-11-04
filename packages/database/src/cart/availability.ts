import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { storefrontVariantEligibility } from '../catalog-variant-integrity.js';
import { CartDomainError } from './errors.js';
export async function availableToSell(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  variantId: string,
): Promise<string> {
  return (await availableToSellByVariant(db, organizationId, [variantId])).get(variantId) ?? '0';
}

/** Inventory remains authoritative; Cart reads availability without reserving it. */
export async function availableToSellByVariant(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  variantIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (!variantIds.length) return new Map();
  if (variantIds.length > 100)
    throw new CartDomainError('LIMIT_EXCEEDED', 'Stock evaluation is limited to 100 variants.');
  const result = await sql<{ variant_id: string; available_to_sell: string }>`
    select item.variant_id, coalesce(sum(level.sellable_quantity - level.reserved_quantity), 0)::text as available_to_sell
    from inventory.inventory_items item
    join inventory.inventory_levels level on level.inventory_item_id = item.id and level.organization_id = item.organization_id
    join warehouse.locations location on location.id = level.location_id
      and location.organization_id = level.organization_id and location.status = 'ACTIVE'
    join warehouse.location_capabilities capability on capability.location_id = location.id
      and capability.organization_id = location.organization_id and capability.capability_code = 'STOCK_HOLDING'
    where item.organization_id = ${organizationId} and item.variant_id = any(${[...variantIds]}::uuid[])
      and item.status = 'ACTIVE'
    group by item.variant_id
  `.execute(db);
  return new Map(result.rows.map((row) => [row.variant_id, row.available_to_sell]));
}

export async function assertSellableVariant(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  variantId: string,
  productId?: string,
): Promise<void> {
  const configured = await storefrontVariantEligibility(db, organizationId, variantId, productId);
  if (configured === null)
    throw new CartDomainError('UNAVAILABLE', 'This Variant is not currently available.');
  if (!configured)
    throw new CartDomainError('INVALID_CONFIGURATION', 'Select a current product configuration.');
}
