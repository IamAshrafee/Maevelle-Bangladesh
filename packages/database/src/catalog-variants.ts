import { sql, type Kysely } from 'kysely';

import { CatalogDomainError } from './catalog.js';
import type { DatabaseSchema } from './index.js';

export type CatalogVariantLifecycleStatus = 'ACTIVE' | 'ARCHIVED';

export interface CatalogVariantMatrixAxis {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: CatalogVariantLifecycleStatus;
  readonly position: number;
  readonly version: number;
  readonly values: readonly {
    id: string;
    code: string;
    label: string;
    status: CatalogVariantLifecycleStatus;
    position: number;
    version: number;
  }[];
}

export interface CatalogVariantMatrixVariant {
  readonly id: string;
  readonly sku: string;
  readonly status: CatalogVariantLifecycleStatus;
  readonly version: number;
  readonly barcode: string | null;
  readonly weight: { value: string; unit: string } | null;
  readonly dimensions: {
    length: string;
    width: string;
    height: string;
    unit: string;
  } | null;
  readonly currentPrice: {
    amount: string;
    compareAtAmount: string | null;
    currency: string;
  } | null;
  readonly sellableQuantity: string;
  readonly variantMediaCount: number;
  readonly usesProductMedia: boolean;
  readonly setupIssues: readonly ('PRICE' | 'MEDIA' | 'INVENTORY')[];
}

export interface CatalogVariantMatrixRow {
  readonly combinationKey: string;
  readonly values: readonly {
    axisId: string;
    axisName: string;
    valueId: string;
    valueLabel: string;
  }[];
  readonly state: 'MISSING' | 'ACTIVE' | 'ARCHIVED';
  readonly variant: CatalogVariantMatrixVariant | null;
}

export interface CatalogVariantMatrix {
  readonly product: {
    id: string;
    title: string;
    version: number;
    defaultCurrency: string;
  };
  readonly axes: readonly CatalogVariantMatrixAxis[];
  readonly rows: readonly CatalogVariantMatrixRow[];
  readonly pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  readonly summary: {
    potentialCombinations: number;
    activeVariants: number;
    archivedVariants: number;
    missingCombinations: number;
    incompleteVariants: number;
  };
  readonly incompleteVariants: readonly {
    id: string;
    sku: string;
    status: CatalogVariantLifecycleStatus;
    reasons: readonly ('MISSING_AXIS' | 'ARCHIVED_AXIS' | 'ARCHIVED_VALUE')[];
  }[];
}

type AxisRow = {
  id: string;
  code: string;
  name: string;
  status: CatalogVariantLifecycleStatus;
  position: number;
  version: string;
};

type ValueRow = {
  id: string;
  option_axis_id: string;
  code: string;
  label: string;
  status: CatalogVariantLifecycleStatus;
  position: number;
  version: string;
};

function combinationAt(
  axes: readonly CatalogVariantMatrixAxis[],
  ordinal: number,
): CatalogVariantMatrixRow['values'] {
  let remainder = ordinal;
  const selected = new Array<CatalogVariantMatrixRow['values'][number]>(axes.length);
  for (let index = axes.length - 1; index >= 0; index -= 1) {
    const axis = axes[index]!;
    const values = axis.values.filter((value) => value.status === 'ACTIVE');
    const value = values[remainder % values.length]!;
    selected[index] = {
      axisId: axis.id,
      axisName: axis.name,
      valueId: value.id,
      valueLabel: value.label,
    };
    remainder = Math.floor(remainder / values.length);
  }
  return selected;
}

function variantSetupIssues(input: {
  current_price_amount: string | null;
  sellable_quantity: string;
  variant_media_count: number;
  product_media_count: number;
}): CatalogVariantMatrixVariant['setupIssues'] {
  const issues: CatalogVariantMatrixVariant['setupIssues'][number][] = [];
  if (input.current_price_amount === null) issues.push('PRICE');
  if (input.variant_media_count === 0 && input.product_media_count === 0) issues.push('MEDIA');
  if (Number(input.sellable_quantity) <= 0) issues.push('INVENTORY');
  return issues;
}

export async function getCatalogVariantMatrix(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; productId: string; page?: number; pageSize?: number },
): Promise<CatalogVariantMatrix> {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(input.pageSize ?? 50)));
  const [productResult, axesResult, valuesResult] = await Promise.all([
    sql<{
      id: string;
      title: string;
      version: string;
      default_currency: string;
    }>`select product.id::text,product.title,product.version::text,organization.default_currency
      from catalog.products product
      join platform.organizations organization on organization.id=product.organization_id
      where product.organization_id=${input.organizationId} and product.id=${input.productId}::uuid`.execute(
      db,
    ),
    sql<AxisRow>`select id::text,code,name,status,position,version::text
      from catalog.product_option_axes
      where organization_id=${input.organizationId} and product_id=${input.productId}::uuid
      order by status,position,name,id`.execute(db),
    sql<ValueRow>`select value.id::text,value.option_axis_id::text,value.code,
        value.display_value label,value.status,value.position,value.version::text
      from catalog.product_option_values value
      join catalog.product_option_axes axis
        on axis.organization_id=value.organization_id and axis.id=value.option_axis_id
      where value.organization_id=${input.organizationId} and axis.product_id=${input.productId}::uuid
      order by value.status,value.position,value.display_value,value.id`.execute(db),
  ]);
  const product = productResult.rows[0];
  if (!product) throw new CatalogDomainError('NOT_FOUND', 'Product was not found.');
  const axes: CatalogVariantMatrixAxis[] = axesResult.rows.map((axis) => ({
    id: axis.id,
    code: axis.code,
    name: axis.name,
    status: axis.status,
    position: axis.position,
    version: Number(axis.version),
    values: valuesResult.rows
      .filter((value) => value.option_axis_id === axis.id)
      .map((value) => ({
        id: value.id,
        code: value.code,
        label: value.label,
        status: value.status,
        position: value.position,
        version: Number(value.version),
      })),
  }));
  const activeAxes = axes.filter((axis) => axis.status === 'ACTIVE');
  const potentialCombinations =
    activeAxes.length === 0 ||
    activeAxes.some((axis) => !axis.values.some((value) => value.status === 'ACTIVE'))
      ? 0
      : activeAxes.reduce((total, axis) => {
          const count = axis.values.filter((value) => value.status === 'ACTIVE').length;
          return total > Number.MAX_SAFE_INTEGER / count ? Number.MAX_SAFE_INTEGER : total * count;
        }, 1);
  const normalizedPage =
    potentialCombinations > 0
      ? Math.min(page, Math.max(1, Math.ceil(potentialCombinations / pageSize)))
      : 1;
  const offset = (normalizedPage - 1) * pageSize;
  const combinations = Array.from(
    { length: Math.max(0, Math.min(pageSize, potentialCombinations - offset)) },
    (_, index) => combinationAt(activeAxes, offset + index),
  );
  const signatures = combinations.map((combination) =>
    combination
      .map((value) => value.valueId)
      .sort()
      .join(':'),
  );

  const [variantsResult, summaryResult, incompleteResult] = await Promise.all([
    sql<{
      id: string;
      sku: string;
      status: CatalogVariantLifecycleStatus;
      version: string;
      barcode: string | null;
      weight_value: string | null;
      weight_unit: string | null;
      length_value: string | null;
      width_value: string | null;
      height_value: string | null;
      dimension_unit: string | null;
      option_signature: string;
      current_price_amount: string | null;
      current_compare_at_amount: string | null;
      sellable_quantity: string;
      variant_media_count: number;
      product_media_count: number;
    }>`select variant.id::text,variant.sku,variant.status,variant.version::text,variant.barcode,
        variant.weight_value::text,variant.weight_unit,variant.length_value::text,
        variant.width_value::text,variant.height_value::text,variant.dimension_unit,
        variant.option_signature,
        price.amount::text current_price_amount,price.compare_at_amount::text current_compare_at_amount,
        coalesce(stock.sellable_quantity,0)::text sellable_quantity,
        (select count(*)::integer from catalog.product_media media
          where media.organization_id=variant.organization_id and media.variant_id=variant.id)
          variant_media_count,
        (select count(*)::integer from catalog.product_media media
          where media.organization_id=variant.organization_id and media.product_id=variant.product_id
            and media.variant_id is null) product_media_count
      from catalog.product_variants variant
      left join lateral (
        select definition.amount,definition.compare_at_amount
        from pricing.price_definitions definition
        join platform.organizations organization on organization.id=variant.organization_id
        where definition.organization_id=variant.organization_id
          and definition.variant_id=variant.id
          and definition.currency_code=organization.default_currency
          and definition.status='ACTIVE' and definition.effective_from<=now()
          and (definition.effective_to is null or definition.effective_to>now())
        order by definition.effective_from desc,definition.id desc limit 1
      ) price on true
      left join lateral (
        select sum(level.sellable_quantity-level.reserved_quantity) sellable_quantity
        from inventory.inventory_items item
        left join inventory.inventory_levels level
          on level.organization_id=item.organization_id and level.inventory_item_id=item.id
        where item.organization_id=variant.organization_id and item.variant_id=variant.id
      ) stock on true
      where variant.organization_id=${input.organizationId}
        and variant.product_id=${input.productId}::uuid
        and variant.option_signature=any(${signatures}::text[])
      order by variant.sku,variant.id`.execute(db),
    sql<{ active: string; archived: string; valid_combinations: string }>`with integrity as (
        select variant.id,variant.status,
          count(*) filter(where axis.status='ACTIVE')::integer active_axis_count,
          count(*) filter(where axis.status='ACTIVE' and value.status='ACTIVE')::integer active_value_count,
          count(link.option_value_id)::integer total_link_count,
          (select count(*)::integer from catalog.product_option_axes expected
            where expected.organization_id=variant.organization_id
              and expected.product_id=variant.product_id and expected.status='ACTIVE') expected_axis_count
        from catalog.product_variants variant
        left join catalog.variant_option_values link
          on link.organization_id=variant.organization_id and link.variant_id=variant.id
        left join catalog.product_option_axes axis
          on axis.organization_id=link.organization_id and axis.id=link.option_axis_id
        left join catalog.product_option_values value
          on value.organization_id=link.organization_id and value.id=link.option_value_id
        where variant.organization_id=${input.organizationId}
          and variant.product_id=${input.productId}::uuid
        group by variant.id,variant.status
      ) select count(*) filter(where status='ACTIVE')::text active,
        count(*) filter(where status='ARCHIVED')::text archived,
        count(*) filter(where active_axis_count=expected_axis_count
          and active_value_count=expected_axis_count
          and total_link_count=expected_axis_count)::text valid_combinations
      from integrity`.execute(db),
    sql<{
      id: string;
      sku: string;
      status: CatalogVariantLifecycleStatus;
      active_axis_count: number;
      active_value_count: number;
      total_link_count: number;
      expected_axis_count: number;
      total_count: string;
    }>`with variant_integrity as (
        select variant.id,variant.sku,variant.status,
          count(*) filter(where axis.status='ACTIVE')::integer active_axis_count,
          count(*) filter(where axis.status='ACTIVE' and value.status='ACTIVE')::integer active_value_count,
          count(link.option_value_id)::integer total_link_count,
          (select count(*)::integer from catalog.product_option_axes expected
            where expected.organization_id=variant.organization_id
              and expected.product_id=variant.product_id and expected.status='ACTIVE') expected_axis_count
        from catalog.product_variants variant
        left join catalog.variant_option_values link
          on link.organization_id=variant.organization_id and link.variant_id=variant.id
        left join catalog.product_option_axes axis
          on axis.organization_id=link.organization_id and axis.id=link.option_axis_id
        left join catalog.product_option_values value
          on value.organization_id=link.organization_id and value.id=link.option_value_id
        where variant.organization_id=${input.organizationId}
          and variant.product_id=${input.productId}::uuid
        group by variant.id,variant.sku,variant.status
      ), incomplete as (
        select * from variant_integrity
        where active_axis_count<>expected_axis_count
          or active_value_count<>expected_axis_count
          or total_link_count<>expected_axis_count
      ) select *,count(*) over()::text total_count from incomplete
        order by sku,id limit 100`.execute(db),
  ]);
  const bySignature = new Map(
    variantsResult.rows.map((variant) => [variant.option_signature, variant]),
  );
  const rows: CatalogVariantMatrixRow[] = combinations.map((combination, index) => {
    const variant = bySignature.get(signatures[index]!);
    if (!variant)
      return {
        combinationKey: signatures[index]!,
        values: combination,
        state: 'MISSING',
        variant: null,
      };
    const issues = variantSetupIssues(variant);
    return {
      combinationKey: signatures[index]!,
      values: combination,
      state: variant.status,
      variant: {
        id: variant.id,
        sku: variant.sku,
        status: variant.status,
        version: Number(variant.version),
        barcode: variant.barcode,
        weight:
          variant.weight_value && variant.weight_unit
            ? { value: variant.weight_value, unit: variant.weight_unit }
            : null,
        dimensions:
          variant.length_value &&
          variant.width_value &&
          variant.height_value &&
          variant.dimension_unit
            ? {
                length: variant.length_value,
                width: variant.width_value,
                height: variant.height_value,
                unit: variant.dimension_unit,
              }
            : null,
        currentPrice: variant.current_price_amount
          ? {
              amount: variant.current_price_amount,
              compareAtAmount: variant.current_compare_at_amount,
              currency: product.default_currency,
            }
          : null,
        sellableQuantity: variant.sellable_quantity,
        variantMediaCount: variant.variant_media_count,
        usesProductMedia: variant.variant_media_count === 0 && variant.product_media_count > 0,
        setupIssues: issues,
      },
    };
  });
  const counts = summaryResult.rows[0] ?? {
    active: '0',
    archived: '0',
    valid_combinations: '0',
  };
  const activeVariants = Number(counts.active);
  return {
    product: {
      id: product.id,
      title: product.title,
      version: Number(product.version),
      defaultCurrency: product.default_currency,
    },
    axes,
    rows,
    pagination: {
      page: normalizedPage,
      pageSize,
      totalItems: potentialCombinations,
      totalPages: potentialCombinations === 0 ? 0 : Math.ceil(potentialCombinations / pageSize),
    },
    summary: {
      potentialCombinations,
      activeVariants,
      archivedVariants: Number(counts.archived),
      missingCombinations: Math.max(0, potentialCombinations - Number(counts.valid_combinations)),
      incompleteVariants: Number(incompleteResult.rows[0]?.total_count ?? 0),
    },
    incompleteVariants: incompleteResult.rows.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      status: variant.status,
      reasons: [
        ...(variant.active_axis_count < variant.expected_axis_count
          ? (['MISSING_AXIS'] as const)
          : []),
        ...(variant.total_link_count > variant.active_axis_count
          ? (['ARCHIVED_AXIS'] as const)
          : []),
        ...(variant.active_value_count < variant.active_axis_count
          ? (['ARCHIVED_VALUE'] as const)
          : []),
      ],
    })),
  };
}
