import { sql, type RawBuilder } from 'kysely';

interface VariantIntegrityColumns {
  readonly organizationId: RawBuilder<unknown>;
  readonly productId: RawBuilder<unknown>;
  readonly variantId: RawBuilder<unknown>;
  readonly optionSignature: RawBuilder<unknown>;
}

/** Shared SQL predicate used by Catalog readiness and every defensive public projection. */
export function catalogVariantIsStructurallyValid(
  columns: VariantIntegrityColumns,
): RawBuilder<boolean> {
  return sql<boolean>`(
    (select count(*) from catalog.variant_option_values link
      where link.organization_id=${columns.organizationId} and link.variant_id=${columns.variantId})
    =
    (select count(*) from catalog.product_option_axes axis
      where axis.organization_id=${columns.organizationId}
        and axis.product_id=${columns.productId} and axis.status='ACTIVE')
    and not exists (
      select 1 from catalog.variant_option_values link
      left join catalog.product_option_axes axis
        on axis.organization_id=link.organization_id and axis.id=link.option_axis_id
      left join catalog.product_option_values value
        on value.organization_id=link.organization_id
        and value.option_axis_id=link.option_axis_id and value.id=link.option_value_id
      where link.organization_id=${columns.organizationId} and link.variant_id=${columns.variantId}
        and (axis.id is null or axis.product_id<>${columns.productId} or axis.status<>'ACTIVE'
          or value.id is null or value.status<>'ACTIVE')
    )
    and ${columns.optionSignature}=(
      select case when count(*)=0 then 'default'
        else string_agg(link.option_value_id::text,':' order by link.option_value_id::text) end
      from catalog.variant_option_values link
      where link.organization_id=${columns.organizationId} and link.variant_id=${columns.variantId}
    )
  )`;
}

export function catalogProductHasCoherentActiveVariants(
  organizationId: RawBuilder<unknown>,
  productId: RawBuilder<unknown>,
): RawBuilder<boolean> {
  return sql<boolean>`(
    exists (select 1 from catalog.product_variants active_variant
      where active_variant.organization_id=${organizationId}
        and active_variant.product_id=${productId} and active_variant.status='ACTIVE')
    and not exists (
      select 1 from catalog.product_variants integrity_variant
      where integrity_variant.organization_id=${organizationId}
        and integrity_variant.product_id=${productId} and integrity_variant.status='ACTIVE'
        and not ${catalogVariantIsStructurallyValid({
          organizationId: sql.ref('integrity_variant.organization_id'),
          productId: sql.ref('integrity_variant.product_id'),
          variantId: sql.ref('integrity_variant.id'),
          optionSignature: sql.ref('integrity_variant.option_signature'),
        })}
    )
  )`;
}
