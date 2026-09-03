import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';

export class CatalogDomainError extends Error {
  public readonly code:
    'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'STALE_VERSION' | 'CATEGORY_CYCLE';

  public constructor(code: CatalogDomainError['code'], message: string) {
    super(message);
    this.name = 'CatalogDomainError';
    this.code = code;
  }
}

export interface ProductSummary {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  readonly publicationStatus: 'UNPUBLISHED' | 'PUBLISHED';
  readonly version: number;
  readonly productTypeName?: string;
  readonly variantCount?: number;
  readonly skuPreview?: string | null;
  readonly updatedAt?: string;
}

export interface CatalogProductWorkspace extends ProductSummary {
  readonly sizeSystemId: string | null;
  readonly sizeGuideId: string | null;
  readonly description: string | null;
  readonly productTypeId: string;
  readonly options: readonly {
    id: string;
    code: string;
    name: string;
    status: 'ACTIVE' | 'ARCHIVED';
    position: number;
    version: number;
    values: readonly {
      id: string;
      code: string;
      label: string;
      status: 'ACTIVE' | 'ARCHIVED';
      position: number;
      version: number;
      color: CatalogColor | null;
      sizeDefinitionId: string | null;
    }[];
  }[];
  readonly variants: readonly {
    id: string;
    title: string | null;
    sku: string;
    barcode: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
    version: number;
    optionValueIds: readonly string[];
    primaryColor: CatalogColor | null;
    associatedColors: readonly CatalogColor[];
    weight: { value: string; unit: string } | null;
    dimensions: { length: string; width: string; height: string; unit: string } | null;
    currentPrice: { amount: string; compareAtAmount: string | null; currency: string } | null;
    sellableQuantity: string;
    media: readonly CatalogProductMedia[];
  }[];
  readonly media: readonly CatalogProductMedia[];
  readonly readiness: CatalogProductReadiness;
  readonly operationalSignals: CatalogProductOperationalSignals;
  readonly organization: {
    readonly categoryIds: readonly string[];
    readonly primaryCategoryId: string | null;
    readonly tagIds: readonly string[];
    readonly occasionIds: readonly string[];
    readonly collectionIds: readonly string[];
    readonly attributes: readonly CatalogProductAttribute[];
  };
  readonly content: {
    readonly informationGroups: readonly {
      id: string;
      title: string;
      items: readonly { id: string; label: string; value: string }[];
    }[];
    readonly faqs: readonly { id: string; question: string; answer: string }[];
    readonly seoTitle: string | null;
    readonly seoDescription: string | null;
  };
}

export interface CatalogColor {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly hexValue: string | null;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly version: number;
}

export interface CatalogProductMedia {
  readonly id: string;
  readonly assetId: string;
  readonly variantId: string | null;
  readonly optionValueId: string | null;
  readonly role: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
  readonly isPrimary: boolean;
  readonly position: number;
  readonly title: string | null;
  readonly altText: string | null;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly width: number | null;
  readonly height: number | null;
}

export interface CatalogProductAttribute {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly valueType: 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE' | 'REFERENCE';
  readonly required: boolean;
  readonly filterable: boolean;
  readonly searchable: boolean;
  readonly value: string | boolean | null;
  readonly referenceOptions: readonly {
    id: string;
    code: string;
    label: string;
    status: 'ACTIVE' | 'ARCHIVED';
    position: number;
    version: number;
    selectionCount: number;
  }[];
}

export type CatalogReadinessState = 'READY' | 'BLOCKED' | 'PUBLISHED' | 'ATTENTION';

export interface CatalogReadinessCheck {
  readonly code:
    | 'IDENTITY'
    | 'ACTIVE_VARIANT'
    | 'REQUIRED_ATTRIBUTES'
    | 'OPTION_COMBINATIONS'
    | 'CURRENT_PRICE'
    | 'PUBLIC_MEDIA'
    | 'CATEGORY'
    | 'AVAILABLE_INVENTORY'
    | 'DESCRIPTION';
  readonly label: string;
  readonly state: 'PASS' | 'BLOCKER' | 'WARNING';
  readonly message: string;
  readonly actionHref?: string;
}

export interface CatalogProductOperationalSignals {
  readonly defaultCurrency: string;
  readonly activeVariantCount: number;
  readonly pricedVariantCount: number;
  readonly publicMediaCount: number;
  readonly availableVariantCount: number;
  readonly categoryCount: number;
}

export interface CatalogProductReadiness {
  readonly state: CatalogReadinessState;
  readonly canPublish: boolean;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly checks: readonly CatalogReadinessCheck[];
}

interface CatalogProductFacts {
  readonly title: string;
  readonly description: string | null;
  readonly publicationStatus: ProductSummary['publicationStatus'];
  readonly defaultCurrency: string;
  readonly activeVariantCount: number;
  readonly requiredAttributeMissingCount: number;
  readonly incompleteVariantCount: number;
  readonly pricedVariantCount: number;
  readonly publicMediaCount: number;
  readonly availableVariantCount: number;
  readonly categoryCount: number;
}

export interface CatalogProductWorkItem extends ProductSummary {
  readonly readinessState: CatalogReadinessState;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly operationalSignals: CatalogProductOperationalSignals;
  readonly primaryMediaId: string | null;
  readonly priceRange: { minimum: string; maximum: string; currency: string } | null;
  readonly availableQuantity: string;
}

export interface CatalogProductWorklist {
  readonly items: readonly CatalogProductWorkItem[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly totalPages: number;
  };
  readonly summary: {
    readonly total: number;
    readonly published: number;
    readonly drafts: number;
    readonly archived: number;
  };
}

export async function createCatalogProductType(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; code: string; name: string },
): Promise<{ id: string; code: string; name: string }> {
  const result = await sql<{ id: string; code: string; name: string }>`
    insert into catalog.product_types (organization_id, code, name) values (${input.organizationId}, ${input.code}, ${input.name}) returning id, code, name
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new Error('Product type creation did not return a product type.');
  return row;
}

export async function listCatalogProductTypes(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly { id: string; code: string; name: string }[]> {
  const result = await sql<{
    id: string;
    code: string;
    name: string;
  }>`select id, code, name from catalog.product_types where organization_id = ${organizationId} and status = 'ACTIVE' order by name, id`.execute(
    db,
  );
  return result.rows;
}

export async function listCatalogColors(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly CatalogColor[]> {
  const result = await sql<{
    id: string;
    code: string;
    name: string;
    hex_value: string | null;
    status: CatalogColor['status'];
    version: string;
  }>`select id::text,code,name,hex_value,status,version::text from catalog.colors
    where organization_id=${organizationId} order by status,name,id`.execute(db);
  return result.rows.map((color) => ({
    id: color.id,
    code: color.code,
    name: color.name,
    hexValue: color.hex_value,
    status: color.status,
    version: Number(color.version),
  }));
}

export async function createCatalogColor(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; code: string; name: string; hexValue?: string | null },
): Promise<CatalogColor> {
  const code = input.code.trim().toLowerCase();
  const name = input.name.trim();
  const hexValue = input.hexValue?.trim().toUpperCase() || null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) || !name)
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'Color name is required and its code must use lowercase words separated by hyphens.',
    );
  if (hexValue && !/^#[0-9A-F]{6}$/.test(hexValue))
    throw new CatalogDomainError('VALIDATION_FAILED', 'Color HEX must use the format #RRGGBB.');
  const result = await sql<{
    id: string;
    code: string;
    name: string;
    hex_value: string | null;
    status: CatalogColor['status'];
    version: string;
  }>`insert into catalog.colors (organization_id,code,name,hex_value)
    values (${input.organizationId},${code},${name},${hexValue})
    returning id::text,code,name,hex_value,status,version::text`.execute(db);
  const color = result.rows[0];
  if (!color) throw new Error('Color creation did not return a Color.');
  return {
    id: color.id,
    code: color.code,
    name: color.name,
    hexValue: color.hex_value,
    status: color.status,
    version: Number(color.version),
  };
}

export async function updateCatalogColor(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    colorId: string;
    expectedVersion: number;
    name?: string;
    hexValue?: string | null;
    status?: 'ACTIVE' | 'ARCHIVED';
  },
): Promise<CatalogColor> {
  const name = input.name?.trim();
  const hexValue = input.hexValue?.trim().toUpperCase() || null;
  if (input.name !== undefined && !name)
    throw new CatalogDomainError('VALIDATION_FAILED', 'Color name is required.');
  if (input.hexValue && !/^#[0-9A-F]{6}$/.test(hexValue ?? ''))
    throw new CatalogDomainError('VALIDATION_FAILED', 'Color HEX must use the format #RRGGBB.');
  const result = await sql<{
    id: string;
    code: string;
    name: string;
    hex_value: string | null;
    status: CatalogColor['status'];
    version: string;
  }>`update catalog.colors set
      name=case when ${input.name !== undefined} then ${name ?? ''} else name end,
      hex_value=case when ${input.hexValue !== undefined} then ${hexValue} else hex_value end,
      status=coalesce(${input.status ?? null},status),version=version+1,updated_at=now()
    where organization_id=${input.organizationId} and id=${input.colorId}::uuid
      and version=${input.expectedVersion}
    returning id::text,code,name,hex_value,status,version::text`.execute(db);
  const color = result.rows[0];
  if (!color)
    throw new CatalogDomainError('STALE_VERSION', 'Color changed while you were editing it.');
  return {
    id: color.id,
    code: color.code,
    name: color.name,
    hexValue: color.hex_value,
    status: color.status,
    version: Number(color.version),
  };
}

export async function createProductOptionAxis(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    code: string;
    name: string;
    position?: number;
  },
): Promise<{ id: string }> {
  const result = await sql<{ id: string }>`
    insert into catalog.product_option_axes (organization_id, product_id, code, name, position)
    values (${input.organizationId}, ${input.productId}, ${input.code}, ${input.name}, ${input.position ?? 0}) returning id
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new Error('Option axis creation did not return an id.');
  return row;
}

export async function createProductOptionValue(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    optionAxisId: string;
    code: string;
    displayValue: string;
    position?: number;
    colorId?: string;
    sizeDefinitionId?: string;
  },
): Promise<{ id: string }> {
  const result = await sql<{ id: string }>`
    insert into catalog.product_option_values (organization_id, option_axis_id, code, display_value, position, color_id, size_definition_id)
    values (${input.organizationId}, ${input.optionAxisId}, ${input.code}, ${input.displayValue}, ${input.position ?? 0}, ${input.colorId ?? null}, ${input.sizeDefinitionId ?? null}) returning id
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new Error('Option value creation did not return an id.');
  return row;
}

export async function updateProductOptionAxis(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    axisId: string;
    expectedVersion: number;
    name?: string;
    code?: string;
    position?: number;
    status?: 'ACTIVE' | 'ARCHIVED';
  },
): Promise<void> {
  const name = input.name?.trim();
  const code = input.code?.trim().toLowerCase();
  if (input.name !== undefined && !name)
    throw new CatalogDomainError('VALIDATION_FAILED', 'Option name is required.');
  if (input.code !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code ?? ''))
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'Option code must use lowercase words separated by hyphens.',
    );
  const result = await sql`update catalog.product_option_axes set
      name=coalesce(${name ?? null},name),code=coalesce(${code ?? null},code),
      position=coalesce(${input.position ?? null},position),status=coalesce(${input.status ?? null},status),
      version=version+1,updated_at=now()
    where organization_id=${input.organizationId} and product_id=${input.productId}::uuid
      and id=${input.axisId}::uuid and version=${input.expectedVersion}`.execute(db);
  if (Number(result.numAffectedRows) !== 1)
    throw new CatalogDomainError('STALE_VERSION', 'Product option changed while you were editing.');
}

export async function updateProductOptionValue(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    axisId: string;
    valueId: string;
    expectedVersion: number;
    displayValue?: string;
    code?: string;
    position?: number;
    status?: 'ACTIVE' | 'ARCHIVED';
    colorId?: string | null;
    sizeDefinitionId?: string | null;
  },
): Promise<void> {
  const displayValue = input.displayValue?.trim();
  const code = input.code?.trim().toLowerCase();
  if (input.displayValue !== undefined && !displayValue)
    throw new CatalogDomainError('VALIDATION_FAILED', 'Option value label is required.');
  if (input.code !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code ?? ''))
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'Option value code must use lowercase words separated by hyphens.',
    );
  if (input.colorId) {
    const color = await sql<{ id: string }>`select color.id::text from catalog.colors color
      join catalog.product_option_axes axis on axis.organization_id=color.organization_id
      where color.organization_id=${input.organizationId} and color.id=${input.colorId}::uuid
        and color.status='ACTIVE' and axis.id=${input.axisId}::uuid`.execute(db);
    if (!color.rows[0]) throw new CatalogDomainError('VALIDATION_FAILED', 'Color is unavailable.');
  }
  const result = await sql`update catalog.product_option_values set
      display_value=coalesce(${displayValue ?? null},display_value),
      code=coalesce(${code ?? null},code),position=coalesce(${input.position ?? null},position),
      status=coalesce(${input.status ?? null},status),
      color_id=case when ${input.colorId !== undefined} then ${input.colorId ?? null}::uuid else color_id end,
      size_definition_id=case when ${input.sizeDefinitionId !== undefined}
        then ${input.sizeDefinitionId ?? null}::uuid else size_definition_id end,
      version=version+1,updated_at=now()
    where organization_id=${input.organizationId} and option_axis_id=${input.axisId}::uuid
      and id=${input.valueId}::uuid and version=${input.expectedVersion}`.execute(db);
  if (Number(result.numAffectedRows) !== 1)
    throw new CatalogDomainError('STALE_VERSION', 'Option value changed while you were editing.');
}

function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

function optionSignature(optionValueIds: readonly string[]): string {
  return [...optionValueIds].sort().join(':');
}

async function emitCatalogEvent(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    eventType: string;
    actorId: string;
    auditAction: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.auditAction,
    targetType: 'catalog.product',
    targetId: input.productId,
    metadata: input.metadata,
  });
  await sql`
    insert into platform.outbox_events (
      organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
    ) values (
      ${input.organizationId}, ${input.eventType}, 1, 'catalog.product', ${input.productId}, 1,
      ${JSON.stringify({ productId: input.productId })}::jsonb, now()
    )
  `.execute(db);
}

function asProduct(row: {
  id: string;
  handle: string;
  title: string;
  status: ProductSummary['status'];
  publication_status: ProductSummary['publicationStatus'];
  version: string;
  product_type_name?: string;
  variant_count?: string;
  sku_preview?: string | null;
  updated_at?: string;
}): ProductSummary {
  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    status: row.status,
    publicationStatus: row.publication_status,
    version: Number(row.version),
    ...(row.product_type_name === undefined ? {} : { productTypeName: row.product_type_name }),
    ...(row.variant_count === undefined ? {} : { variantCount: Number(row.variant_count) }),
    ...(row.sku_preview === undefined ? {} : { skuPreview: row.sku_preview }),
    ...(row.updated_at === undefined ? {} : { updatedAt: row.updated_at }),
  };
}

async function getCatalogProductFacts(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
): Promise<CatalogProductFacts | undefined> {
  const result = await sql<{
    title: string;
    description: string | null;
    publication_status: ProductSummary['publicationStatus'];
    product_type_active: boolean;
    default_currency: string;
    active_variant_count: string;
    required_attribute_missing_count: string;
    incomplete_variant_count: string;
    priced_variant_count: string;
    public_media_count: string;
    available_variant_count: string;
    category_count: string;
  }>`
    select product.title,product.description,product.publication_status,
      (product_type.status='ACTIVE') as product_type_active,
      organization.default_currency,
      (select count(*)::text from catalog.product_variants variant
        where variant.organization_id=product.organization_id and variant.product_id=product.id
          and variant.status='ACTIVE') as active_variant_count,
      (select count(*)::text
        from catalog.product_type_attributes required
        join catalog.attribute_definitions definition
          on definition.id=required.attribute_definition_id
          and definition.organization_id=product.organization_id
          and definition.status='ACTIVE'
        left join catalog.product_attribute_values value
          on value.organization_id=product.organization_id
          and value.product_id=product.id
          and value.attribute_definition_id=required.attribute_definition_id
        where required.organization_id=product.organization_id
          and required.product_type_id=product.product_type_id
          and required.is_required and definition.scope='PRODUCT' and value.id is null
      ) as required_attribute_missing_count,
      (select count(*)::text
        from catalog.product_variants variant
        where variant.organization_id=product.organization_id
          and variant.product_id=product.id and variant.status='ACTIVE'
          and (select count(*)
            from catalog.variant_option_values link
            join catalog.product_option_axes axis
              on axis.id=link.option_axis_id and axis.organization_id=link.organization_id
              and axis.product_id=product.id and axis.status='ACTIVE'
            join catalog.product_option_values value
              on value.id=link.option_value_id and value.organization_id=link.organization_id
              and value.option_axis_id=axis.id and value.status='ACTIVE'
            where link.organization_id=product.organization_id and link.variant_id=variant.id
          ) <> (select count(*) from catalog.product_option_axes axis
            where axis.organization_id=product.organization_id
              and axis.product_id=product.id and axis.status='ACTIVE')
      ) as incomplete_variant_count,
      (select count(*)::text
        from catalog.product_variants variant
        where variant.organization_id=product.organization_id
          and variant.product_id=product.id and variant.status='ACTIVE'
          and exists (select 1 from pricing.price_definitions price
            where price.organization_id=product.organization_id
              and price.variant_id=variant.id
              and price.currency_code=organization.default_currency
              and price.status='ACTIVE' and price.effective_from<=now()
              and (price.effective_to is null or price.effective_to>now()))
      ) as priced_variant_count,
      (select count(*)::text
        from catalog.product_media product_media
        join media.media_assets asset
          on asset.id=product_media.asset_id
          and asset.organization_id=product_media.organization_id
        where product_media.organization_id=product.organization_id
          and product_media.product_id=product.id
          and asset.status='READY' and asset.visibility_class='PUBLIC'
      ) as public_media_count,
      (select count(*)::text
        from catalog.product_variants variant
        where variant.organization_id=product.organization_id
          and variant.product_id=product.id and variant.status='ACTIVE'
          and exists (select 1
            from inventory.inventory_items item
            join inventory.inventory_levels level
              on level.inventory_item_id=item.id and level.organization_id=item.organization_id
            where item.organization_id=product.organization_id and item.variant_id=variant.id
              and level.sellable_quantity-level.reserved_quantity>0)
      ) as available_variant_count,
      (select count(*)::text from catalog.product_categories product_category
        join catalog.categories category
          on category.id=product_category.category_id
          and category.organization_id=product_category.organization_id
        where product_category.organization_id=product.organization_id
          and product_category.product_id=product.id and category.status='ACTIVE'
      ) as category_count
    from catalog.products product
    join platform.organizations organization on organization.id=product.organization_id
    join catalog.product_types product_type
      on product_type.id=product.product_type_id
      and product_type.organization_id=product.organization_id
    where product.organization_id=${organizationId} and product.id=${productId}::uuid
  `.execute(db);
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    title: row.product_type_active ? row.title : '',
    description: row.description,
    publicationStatus: row.publication_status,
    defaultCurrency: row.default_currency,
    activeVariantCount: Number(row.active_variant_count),
    requiredAttributeMissingCount: Number(row.required_attribute_missing_count),
    incompleteVariantCount: Number(row.incomplete_variant_count),
    pricedVariantCount: Number(row.priced_variant_count),
    publicMediaCount: Number(row.public_media_count),
    availableVariantCount: Number(row.available_variant_count),
    categoryCount: Number(row.category_count),
  };
}

function readinessFromFacts(facts: CatalogProductFacts): {
  readiness: CatalogProductReadiness;
  operationalSignals: CatalogProductOperationalSignals;
} {
  const checks: CatalogReadinessCheck[] = [
    {
      code: 'IDENTITY',
      label: 'Product identity',
      state: facts.title.trim() ? 'PASS' : 'BLOCKER',
      message: facts.title.trim()
        ? 'The Product has a valid title and active Product Type.'
        : 'Choose an active Product Type and provide a Product title.',
      actionHref: '#overview',
    },
    {
      code: 'ACTIVE_VARIANT',
      label: 'Sellable Variant',
      state: facts.activeVariantCount > 0 ? 'PASS' : 'BLOCKER',
      message:
        facts.activeVariantCount > 0
          ? `${facts.activeVariantCount} active Variant${facts.activeVariantCount === 1 ? '' : 's'} configured.`
          : 'Create at least one active sellable Variant before publishing.',
      actionHref: '#variants',
    },
    {
      code: 'REQUIRED_ATTRIBUTES',
      label: 'Required attributes',
      state: facts.requiredAttributeMissingCount === 0 ? 'PASS' : 'BLOCKER',
      message:
        facts.requiredAttributeMissingCount === 0
          ? 'All required Product attributes are complete.'
          : `${facts.requiredAttributeMissingCount} required Product attribute${facts.requiredAttributeMissingCount === 1 ? ' is' : 's are'} missing.`,
      actionHref: '#organization',
    },
    {
      code: 'OPTION_COMBINATIONS',
      label: 'Variant combinations',
      state: facts.incompleteVariantCount === 0 ? 'PASS' : 'BLOCKER',
      message:
        facts.incompleteVariantCount === 0
          ? 'Active Variants use one active value from every active option.'
          : `${facts.incompleteVariantCount} active Variant${facts.incompleteVariantCount === 1 ? ' has' : 's have'} an incomplete option combination.`,
      actionHref: '#variants',
    },
    {
      code: 'CURRENT_PRICE',
      label: `Current ${facts.defaultCurrency} price`,
      state:
        facts.activeVariantCount > 0 && facts.pricedVariantCount === facts.activeVariantCount
          ? 'PASS'
          : 'WARNING',
      message:
        facts.activeVariantCount > 0 && facts.pricedVariantCount === facts.activeVariantCount
          ? 'Every active Variant has a current selling price.'
          : `${Math.max(facts.activeVariantCount - facts.pricedVariantCount, 0)} active Variant${facts.activeVariantCount - facts.pricedVariantCount === 1 ? '' : 's'} need${facts.activeVariantCount - facts.pricedVariantCount === 1 ? 's' : ''} a current price.`,
      actionHref: '/pricing',
    },
    {
      code: 'PUBLIC_MEDIA',
      label: 'Public Product media',
      state: facts.publicMediaCount > 0 ? 'PASS' : 'WARNING',
      message:
        facts.publicMediaCount > 0
          ? `${facts.publicMediaCount} public-ready media asset${facts.publicMediaCount === 1 ? '' : 's'} attached.`
          : 'Attach at least one public-ready Product image for customer confidence.',
      actionHref: '/media',
    },
    {
      code: 'CATEGORY',
      label: 'Active category',
      state: facts.categoryCount > 0 ? 'PASS' : 'WARNING',
      message:
        facts.categoryCount > 0
          ? `${facts.categoryCount} active categor${facts.categoryCount === 1 ? 'y' : 'ies'} assigned.`
          : 'Assign an active category so customers can browse to this Product.',
      actionHref: '#organization',
    },
    {
      code: 'AVAILABLE_INVENTORY',
      label: 'Available inventory',
      state: facts.availableVariantCount > 0 ? 'PASS' : 'WARNING',
      message:
        facts.availableVariantCount > 0
          ? `${facts.availableVariantCount} active Variant${facts.availableVariantCount === 1 ? ' is' : 's are'} currently available to sell.`
          : 'No active Variant is currently available to sell. Publication may still be intentional.',
      actionHref: '/inventory/stock',
    },
    {
      code: 'DESCRIPTION',
      label: 'Customer description',
      state: facts.description?.trim() ? 'PASS' : 'WARNING',
      message: facts.description?.trim()
        ? 'A customer-facing Product description is present.'
        : 'Add a useful customer-facing description before merchandising this Product.',
      actionHref: '#overview',
    },
  ];
  const blockerCount = checks.filter((check) => check.state === 'BLOCKER').length;
  const warningCount = checks.filter((check) => check.state === 'WARNING').length;
  const state: CatalogReadinessState =
    facts.publicationStatus === 'PUBLISHED'
      ? blockerCount > 0 || warningCount > 0
        ? 'ATTENTION'
        : 'PUBLISHED'
      : blockerCount > 0
        ? 'BLOCKED'
        : 'READY';
  return {
    readiness: {
      state,
      canPublish: blockerCount === 0,
      blockerCount,
      warningCount,
      checks,
    },
    operationalSignals: {
      defaultCurrency: facts.defaultCurrency,
      activeVariantCount: facts.activeVariantCount,
      pricedVariantCount: facts.pricedVariantCount,
      publicMediaCount: facts.publicMediaCount,
      availableVariantCount: facts.availableVariantCount,
      categoryCount: facts.categoryCount,
    },
  };
}

export async function getCatalogProductReadiness(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
): Promise<
  | {
      readiness: CatalogProductReadiness;
      operationalSignals: CatalogProductOperationalSignals;
    }
  | undefined
> {
  const facts = await getCatalogProductFacts(db, organizationId, productId);
  return facts ? readinessFromFacts(facts) : undefined;
}

export async function createCatalogProduct(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    productTypeId: string;
    title: string;
    handle: string;
    description?: string;
    categoryIds?: readonly string[];
    primaryCategoryId?: string;
    tagIds?: readonly string[];
    occasionIds?: readonly string[];
    collectionIds?: readonly string[];
  },
): Promise<ProductSummary> {
  return db.transaction().execute(async (transaction) => {
    const productType = await sql<{ id: string }>`
      select id from catalog.product_types where id = ${input.productTypeId} and organization_id = ${input.organizationId} and status = 'ACTIVE'
    `.execute(transaction);
    if (!productType.rows[0])
      throw new CatalogDomainError('VALIDATION_FAILED', 'Product type is not available.');
    const categoryIds = [...new Set(input.categoryIds ?? [])];
    const tagIds = [...new Set(input.tagIds ?? [])];
    const occasionIds = [...new Set(input.occasionIds ?? [])];
    const collectionIds = [...new Set(input.collectionIds ?? [])];
    if (input.primaryCategoryId && !categoryIds.includes(input.primaryCategoryId))
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        'The primary Category must also be assigned to the Product.',
      );
    if (categoryIds.length > 0) {
      const categories = await sql<{ id: string }>`with recursive lineage as (
        select selected.id category_id,category.id ancestor_id,category.parent_category_id,category.status
        from unnest(${categoryIds}::uuid[]) selected(id)
        join catalog.categories category on category.id=selected.id
          and category.organization_id=${input.organizationId}
        union all
        select lineage.category_id,parent.id,parent.parent_category_id,parent.status
        from lineage join catalog.categories parent on parent.id=lineage.parent_category_id
          and parent.organization_id=${input.organizationId}
      ) select category_id::text id from lineage group by category_id
        having bool_and(status='ACTIVE')`.execute(transaction);
      if (categories.rows.length !== categoryIds.length)
        throw new CatalogDomainError(
          'VALIDATION_FAILED',
          'Every assigned Category and its parent path must be active.',
        );
    }
    for (const [table, ids] of [
      ['tags', tagIds],
      ['occasions', occasionIds],
      ['collections', collectionIds],
    ] as const) {
      if (ids.length === 0) continue;
      const source =
        table === 'tags'
          ? sql`catalog.tags`
          : table === 'occasions'
            ? sql`catalog.occasions`
            : sql`catalog.collections`;
      const available = await sql<{ id: string }>`select id::text from ${source}
        where organization_id=${input.organizationId} and status='ACTIVE'
          and id=any(${ids}::uuid[])`.execute(transaction);
      if (available.rows.length !== ids.length)
        throw new CatalogDomainError(
          'VALIDATION_FAILED',
          `Every selected ${table.slice(0, -1)} must be active.`,
        );
    }
    const created = await sql<{
      id: string;
      handle: string;
      title: string;
      status: ProductSummary['status'];
      publication_status: ProductSummary['publicationStatus'];
      version: string;
    }>`
      insert into catalog.products
        (organization_id,product_type_id,handle,title,description,primary_category_id)
      values (${input.organizationId},${input.productTypeId},${input.handle},${input.title},
        ${input.description ?? null},${input.primaryCategoryId ?? null}::uuid)
      returning id, handle, title, status, publication_status, version::text
    `.execute(transaction);
    const product = created.rows[0];
    if (!product) throw new Error('Product creation did not return a product.');
    for (const categoryId of categoryIds)
      await sql`insert into catalog.product_categories (organization_id,product_id,category_id)
        values (${input.organizationId},${product.id},${categoryId})`.execute(transaction);
    for (const tagId of tagIds)
      await sql`insert into catalog.product_tags (organization_id,product_id,tag_id)
        values (${input.organizationId},${product.id},${tagId})`.execute(transaction);
    for (const occasionId of occasionIds)
      await sql`insert into catalog.product_occasions (organization_id,product_id,occasion_id)
        values (${input.organizationId},${product.id},${occasionId})`.execute(transaction);
    for (const collectionId of collectionIds)
      await sql`insert into catalog.product_collections
        (organization_id,product_id,collection_id)
        values (${input.organizationId},${product.id},${collectionId})`.execute(transaction);
    await emitCatalogEvent(transaction, {
      organizationId: input.organizationId,
      productId: product.id,
      eventType: 'catalog.product.created',
      actorId: input.actorId,
      auditAction: 'catalog.product.created',
    });
    return asProduct(product);
  });
}

export async function updateCatalogProduct(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    productId: string;
    expectedVersion: number;
    title?: string;
    handle?: string;
    description?: string | null;
    productTypeId?: string;
  },
): Promise<ProductSummary> {
  return db.transaction().execute(async (transaction) => {
    if (
      input.title === undefined &&
      input.handle === undefined &&
      input.description === undefined &&
      input.productTypeId === undefined
    )
      throw new CatalogDomainError('VALIDATION_FAILED', 'Provide at least one Product change.');
    const before = await sql<{ handle: string }>`
      select handle from catalog.products where id = ${input.productId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    if (!before.rows[0]) throw new CatalogDomainError('NOT_FOUND', 'Product was not found.');
    const title = input.title?.trim();
    if (input.title !== undefined && !title)
      throw new CatalogDomainError('VALIDATION_FAILED', 'Product title is required.');
    const handle = input.handle?.trim();
    if (input.handle !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle ?? ''))
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        'Storefront handle must use lowercase words separated by hyphens.',
      );
    if (input.productTypeId) {
      const productType = await sql<{ id: string }>`
        select id from catalog.product_types
        where id=${input.productTypeId}::uuid and organization_id=${input.organizationId}
          and status='ACTIVE'
      `.execute(transaction);
      if (!productType.rows[0])
        throw new CatalogDomainError(
          'VALIDATION_FAILED',
          'Choose an active Product Type from this organization.',
        );
    }
    const updated = await sql<{
      id: string;
      handle: string;
      title: string;
      status: ProductSummary['status'];
      publication_status: ProductSummary['publicationStatus'];
      version: string;
    }>`
      update catalog.products
      set title = coalesce(${title ?? null}, title),
          handle = coalesce(${handle ?? null}, handle),
          description = case when ${input.description === undefined} then description else ${input.description ?? null} end,
          product_type_id = coalesce(${input.productTypeId ?? null}::uuid, product_type_id),
          version = version + 1,
          updated_at = now()
      where id = ${input.productId} and organization_id = ${input.organizationId} and version = ${input.expectedVersion}
      returning id, handle, title, status, publication_status, version::text
    `.execute(transaction);
    const product = updated.rows[0];
    if (!product)
      throw new CatalogDomainError('STALE_VERSION', 'Product has changed; reload before saving.');
    if (before.rows[0].handle !== product.handle) {
      await sql`
        insert into catalog.product_handle_history (organization_id, product_id, old_handle)
        values (${input.organizationId}, ${input.productId}, ${before.rows[0].handle})
      `.execute(transaction);
    }
    await emitCatalogEvent(transaction, {
      organizationId: input.organizationId,
      productId: input.productId,
      eventType: 'catalog.product.updated',
      actorId: input.actorId,
      auditAction: 'catalog.product.updated',
    });
    return asProduct(product);
  });
}

export async function publishCatalogProduct(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; productId: string; expectedVersion: number },
): Promise<ProductSummary> {
  return db.transaction().execute(async (transaction) => {
    const validation = await getCatalogProductReadiness(
      transaction,
      input.organizationId,
      input.productId,
    );
    if (!validation) throw new CatalogDomainError('NOT_FOUND', 'Product was not found.');
    const blockers = validation.readiness.checks.filter((check) => check.state === 'BLOCKER');
    if (blockers.length > 0)
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        blockers.map((check) => check.message).join(' '),
      );
    const updated = await sql<{
      id: string;
      handle: string;
      title: string;
      status: ProductSummary['status'];
      publication_status: ProductSummary['publicationStatus'];
      version: string;
    }>`
      update catalog.products
      set status = 'ACTIVE', publication_status = 'PUBLISHED', published_at = now(), version = version + 1, updated_at = now()
      where id = ${input.productId} and organization_id = ${input.organizationId} and version = ${input.expectedVersion}
      returning id, handle, title, status, publication_status, version::text
    `.execute(transaction);
    const result = updated.rows[0];
    if (!result)
      throw new CatalogDomainError(
        'STALE_VERSION',
        'Product has changed; reload before publishing.',
      );
    await emitCatalogEvent(transaction, {
      organizationId: input.organizationId,
      productId: input.productId,
      eventType: 'catalog.product.published',
      actorId: input.actorId,
      auditAction: 'catalog.product.published',
    });
    return asProduct(result);
  });
}

export async function unpublishCatalogProduct(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; productId: string; expectedVersion: number },
): Promise<ProductSummary> {
  return db.transaction().execute(async (transaction) => {
    const updated = await sql<{
      id: string;
      handle: string;
      title: string;
      status: ProductSummary['status'];
      publication_status: ProductSummary['publicationStatus'];
      version: string;
    }>`
      update catalog.products
      set publication_status = 'UNPUBLISHED', version = version + 1, updated_at = now()
      where id = ${input.productId} and organization_id = ${input.organizationId} and version = ${input.expectedVersion}
      returning id, handle, title, status, publication_status, version::text
    `.execute(transaction);
    const product = updated.rows[0];
    if (!product)
      throw new CatalogDomainError('STALE_VERSION', 'Product was not found or has changed.');
    await emitCatalogEvent(transaction, {
      organizationId: input.organizationId,
      productId: input.productId,
      eventType: 'catalog.product.unpublished',
      actorId: input.actorId,
      auditAction: 'catalog.product.unpublished',
    });
    return asProduct(product);
  });
}

export async function archiveCatalogProduct(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; productId: string; expectedVersion: number },
): Promise<ProductSummary> {
  return db.transaction().execute(async (transaction) => {
    const updated = await sql<{
      id: string;
      handle: string;
      title: string;
      status: ProductSummary['status'];
      publication_status: ProductSummary['publicationStatus'];
      version: string;
    }>`update catalog.products set status='ARCHIVED',publication_status='UNPUBLISHED',
        published_at=null,version=version+1,updated_at=now()
      where id=${input.productId}::uuid and organization_id=${input.organizationId}
        and version=${input.expectedVersion} and status<>'ARCHIVED'
      returning id::text,handle,title,status,publication_status,version::text`.execute(transaction);
    const product = updated.rows[0];
    if (!product)
      throw new CatalogDomainError('STALE_VERSION', 'Product was not found or has changed.');
    await emitCatalogEvent(transaction, {
      organizationId: input.organizationId,
      productId: input.productId,
      eventType: 'catalog.product.archived',
      actorId: input.actorId,
      auditAction: 'catalog.product.archived',
    });
    return asProduct(product);
  });
}

export async function restoreCatalogProduct(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; productId: string; expectedVersion: number },
): Promise<ProductSummary> {
  return db.transaction().execute(async (transaction) => {
    const updated = await sql<{
      id: string;
      handle: string;
      title: string;
      status: ProductSummary['status'];
      publication_status: ProductSummary['publicationStatus'];
      version: string;
    }>`update catalog.products set status='DRAFT',publication_status='UNPUBLISHED',
        published_at=null,version=version+1,updated_at=now()
      where id=${input.productId}::uuid and organization_id=${input.organizationId}
        and version=${input.expectedVersion} and status='ARCHIVED'
      returning id::text,handle,title,status,publication_status,version::text`.execute(transaction);
    const product = updated.rows[0];
    if (!product)
      throw new CatalogDomainError('STALE_VERSION', 'Archived Product was not found or changed.');
    await emitCatalogEvent(transaction, {
      organizationId: input.organizationId,
      productId: input.productId,
      eventType: 'catalog.product.restored',
      actorId: input.actorId,
      auditAction: 'catalog.product.restored',
    });
    return asProduct(product);
  });
}

export async function createCatalogCategory(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; name: string; handle: string; parentCategoryId?: string },
): Promise<{ id: string; name: string; handle: string; parentCategoryId?: string }> {
  const result = await sql<{
    id: string;
    name: string;
    handle: string;
    parent_category_id: string | null;
  }>`
    insert into catalog.categories (organization_id, name, handle, parent_category_id)
    values (${input.organizationId}, ${input.name}, ${input.handle}, ${input.parentCategoryId ?? null})
    returning id, name, handle, parent_category_id
  `.execute(db);
  const category = result.rows[0];
  if (!category) throw new Error('Category creation did not return a category.');
  return {
    ...category,
    ...(category.parent_category_id ? { parentCategoryId: category.parent_category_id } : {}),
  };
}

export async function moveCatalogCategory(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    categoryId: string;
    parentCategoryId?: string | null;
    expectedVersion: number;
  },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    if (input.parentCategoryId) {
      const invalid = await sql<{ found: boolean }>`
        with recursive descendants as (
          select id from catalog.categories where id = ${input.categoryId} and organization_id = ${input.organizationId}
          union all
          select child.id from catalog.categories child join descendants on child.parent_category_id = descendants.id
          where child.organization_id = ${input.organizationId}
        ) select exists(select 1 from descendants where id = ${input.parentCategoryId}) as found
      `.execute(transaction);
      if (invalid.rows[0]?.found)
        throw new CatalogDomainError(
          'CATEGORY_CYCLE',
          'A category cannot be moved under itself or a descendant.',
        );
    }
    const moved = await sql`
      update catalog.categories set parent_category_id = ${input.parentCategoryId ?? null}, version = version + 1, updated_at = now()
      where id = ${input.categoryId} and organization_id = ${input.organizationId} and version = ${input.expectedVersion}
    `.execute(transaction);
    if (Number(moved.numAffectedRows) !== 1) {
      throw new CatalogDomainError('STALE_VERSION', 'Category was not found or has changed.');
    }
  });
}

export async function listCatalogCategoryChoices(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly { id: string; name: string; handle: string; path: string; depth: number }[]> {
  const result = await sql<{
    id: string;
    name: string;
    handle: string;
    path: string;
    depth: number;
  }>`
    with recursive category_tree as (
      select category.id,category.name,category.handle,category.name::text as path,
        0::integer as depth,array[category.id] as visited
      from catalog.categories category
      where category.organization_id=${organizationId} and category.status='ACTIVE'
        and category.parent_category_id is null
      union all
      select child.id,child.name,child.handle,
        (parent.path || ' / ' || child.name)::text,parent.depth+1,parent.visited || child.id
      from catalog.categories child
      join category_tree parent on parent.id=child.parent_category_id
      where child.organization_id=${organizationId} and child.status='ACTIVE'
        and not child.id=any(parent.visited)
    )
    select id::text,name,handle,path,depth from category_tree order by path,id
  `.execute(db);
  return result.rows;
}

export async function setCatalogProductCategories(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    productId: string;
    expectedVersion: number;
    categoryIds: readonly string[];
    primaryCategoryId?: string | null;
  },
): Promise<ProductSummary> {
  return db.transaction().execute(async (transaction) => {
    const categoryIds = [...new Set(input.categoryIds)];
    if (categoryIds.length !== input.categoryIds.length)
      throw new CatalogDomainError('VALIDATION_FAILED', 'Choose each Category only once.');
    if (input.primaryCategoryId && !categoryIds.includes(input.primaryCategoryId))
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        'The primary Category must also be assigned to the Product.',
      );
    if (categoryIds.length > 0) {
      const categories = await sql<{ id: string }>`with recursive lineage as (
        select selected.id category_id,category.id ancestor_id,category.parent_category_id,category.status
        from unnest(${categoryIds}::uuid[]) selected(id)
        join catalog.categories category on category.id=selected.id
          and category.organization_id=${input.organizationId}
        union all
        select lineage.category_id,parent.id,parent.parent_category_id,parent.status
        from lineage join catalog.categories parent on parent.id=lineage.parent_category_id
          and parent.organization_id=${input.organizationId}
      ) select category_id::text id from lineage group by category_id
        having bool_and(status='ACTIVE')`.execute(transaction);
      if (categories.rows.length !== categoryIds.length)
        throw new CatalogDomainError(
          'VALIDATION_FAILED',
          'Every assigned Category and its parent path must be active.',
        );
    }
    const updated = await sql<{
      id: string;
      handle: string;
      title: string;
      status: ProductSummary['status'];
      publication_status: ProductSummary['publicationStatus'];
      version: string;
    }>`
      update catalog.products set primary_category_id=${input.primaryCategoryId ?? null}::uuid,
        version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.productId}::uuid
        and version=${input.expectedVersion}
      returning id::text,handle,title,status,publication_status,version::text
    `.execute(transaction);
    const product = updated.rows[0];
    if (!product)
      throw new CatalogDomainError('STALE_VERSION', 'Product changed; reload Categories.');
    await sql`delete from catalog.product_categories where organization_id=${input.organizationId} and product_id=${input.productId}::uuid`.execute(
      transaction,
    );
    for (const categoryId of categoryIds)
      await sql`
        insert into catalog.product_categories (organization_id,product_id,category_id)
        values (${input.organizationId},${input.productId}::uuid,${categoryId}::uuid)
      `.execute(transaction);
    await emitCatalogEvent(transaction, {
      organizationId: input.organizationId,
      productId: input.productId,
      eventType: 'catalog.product.categories_updated',
      actorId: input.actorId,
      auditAction: 'catalog.product.categories_updated',
    });
    return asProduct(product);
  });
}

function normalizedAttributeValue(
  definition: { value_type: CatalogProductAttribute['valueType']; name: string },
  value: string | boolean | null,
):
  | {
      column:
        | 'value_text'
        | 'value_integer'
        | 'value_decimal'
        | 'value_boolean'
        | 'value_date'
        | 'value_reference_id';
      value: string | boolean;
    }
  | undefined {
  if (value === null || (typeof value === 'string' && !value.trim())) return undefined;
  if (definition.value_type === 'BOOLEAN') {
    if (typeof value !== 'boolean')
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        `${definition.name} must be true or false.`,
      );
    return { column: 'value_boolean', value };
  }
  if (typeof value !== 'string')
    throw new CatalogDomainError('VALIDATION_FAILED', `${definition.name} has an invalid value.`);
  const normalized = value.trim();
  if (definition.value_type === 'REFERENCE') {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    )
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        `${definition.name} has an invalid selection.`,
      );
    return { column: 'value_reference_id', value: normalized };
  }
  if (definition.value_type === 'INTEGER') {
    if (!/^-?\d+$/.test(normalized))
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        `${definition.name} must be a whole number.`,
      );
    const integer = BigInt(normalized);
    if (integer < -9223372036854775808n || integer > 9223372036854775807n)
      throw new CatalogDomainError('VALIDATION_FAILED', `${definition.name} is outside its range.`);
  }
  if (definition.value_type === 'DECIMAL') {
    const match = /^-?(\d+)(?:\.(\d+))?$/.exec(normalized);
    if (!match)
      throw new CatalogDomainError('VALIDATION_FAILED', `${definition.name} must be a number.`);
    if (match[1]!.length > 16 || (match[2]?.length ?? 0) > 12)
      throw new CatalogDomainError('VALIDATION_FAILED', `${definition.name} is outside its range.`);
  }
  if (definition.value_type === 'DATE') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? new Date(`${normalized}T00:00:00.000Z`)
      : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized)
      throw new CatalogDomainError('VALIDATION_FAILED', `${definition.name} must be a valid date.`);
  }
  return {
    column:
      definition.value_type === 'TEXT'
        ? 'value_text'
        : definition.value_type === 'INTEGER'
          ? 'value_integer'
          : definition.value_type === 'DECIMAL'
            ? 'value_decimal'
            : definition.value_type === 'DATE'
              ? 'value_date'
              : 'value_reference_id',
    value: normalized,
  };
}

export async function setCatalogProductAttributes(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    productId: string;
    expectedVersion: number;
    values: readonly { attributeDefinitionId: string; value: string | boolean | null }[];
  },
): Promise<ProductSummary> {
  return db.transaction().execute(async (transaction) => {
    const definitions = await sql<{
      id: string;
      name: string;
      value_type: CatalogProductAttribute['valueType'];
      is_required: boolean;
      reference_option_ids: string[];
    }>`
      select definition.id::text,definition.name,definition.value_type,binding.is_required,
        array(select option.id::text from catalog.attribute_reference_options option
          left join catalog.product_attribute_values existing
            on existing.organization_id=option.organization_id
            and existing.product_id=product.id
            and existing.attribute_definition_id=definition.id
            and existing.value_reference_id=option.id
          where option.organization_id=product.organization_id
            and option.attribute_definition_id=definition.id
            and (option.status='ACTIVE' or existing.id is not null)) as reference_option_ids
      from catalog.products product
      join catalog.product_type_attributes binding
        on binding.organization_id=product.organization_id
        and binding.product_type_id=product.product_type_id
      join catalog.attribute_definitions definition
        on definition.id=binding.attribute_definition_id
        and definition.organization_id=product.organization_id
        and definition.scope='PRODUCT' and definition.status='ACTIVE'
      where product.organization_id=${input.organizationId} and product.id=${input.productId}::uuid
    `.execute(transaction);
    const byId = new Map(definitions.rows.map((definition) => [definition.id, definition]));
    const supplied = new Map<string, string | boolean | null>();
    for (const entry of input.values) {
      if (supplied.has(entry.attributeDefinitionId))
        throw new CatalogDomainError('VALIDATION_FAILED', 'Provide each Product attribute once.');
      if (!byId.has(entry.attributeDefinitionId))
        throw new CatalogDomainError(
          'VALIDATION_FAILED',
          'An attribute is not active for this Product Type.',
        );
      supplied.set(entry.attributeDefinitionId, entry.value);
    }
    const normalized = definitions.rows.map((definition) => {
      const value = normalizedAttributeValue(definition, supplied.get(definition.id) ?? null);
      if (
        definition.value_type === 'REFERENCE' &&
        value !== undefined &&
        !definition.reference_option_ids.includes(String(value.value))
      )
        throw new CatalogDomainError(
          'VALIDATION_FAILED',
          `${definition.name} selection is not available for this tenant attribute.`,
        );
      return { definition, value };
    });
    const missing = normalized.filter(
      (entry) => entry.definition.is_required && entry.value === undefined,
    );
    if (missing.length > 0)
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        `Complete required attribute${missing.length === 1 ? '' : 's'}: ${missing.map((entry) => entry.definition.name).join(', ')}.`,
      );
    const updated = await sql<{
      id: string;
      handle: string;
      title: string;
      status: ProductSummary['status'];
      publication_status: ProductSummary['publicationStatus'];
      version: string;
    }>`
      update catalog.products set version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.productId}::uuid
        and version=${input.expectedVersion}
      returning id::text,handle,title,status,publication_status,version::text
    `.execute(transaction);
    const product = updated.rows[0];
    if (!product)
      throw new CatalogDomainError('STALE_VERSION', 'Product changed; reload attributes.');
    await sql`
      delete from catalog.product_attribute_values value
      using catalog.attribute_definitions definition
      where value.attribute_definition_id=definition.id
        and value.organization_id=${input.organizationId}
        and value.product_id=${input.productId}::uuid
        and definition.scope='PRODUCT' and definition.status='ACTIVE'
        and exists (
          select 1 from catalog.products product
          join catalog.product_type_attributes binding
            on binding.organization_id=product.organization_id
            and binding.product_type_id=product.product_type_id
            and binding.attribute_definition_id=definition.id
          where product.organization_id=${input.organizationId}
            and product.id=${input.productId}::uuid
        )
    `.execute(transaction);
    for (const entry of normalized) {
      if (entry.value === undefined) continue;
      if (entry.value.column === 'value_reference_id')
        await sql`
          insert into catalog.product_attribute_values
            (organization_id,product_id,attribute_definition_id,value_reference_id)
          values (${input.organizationId},${input.productId}::uuid,
            ${entry.definition.id}::uuid,${entry.value.value}::uuid)
        `.execute(transaction);
      else
        await sql`
          insert into catalog.product_attribute_values
            (organization_id,product_id,attribute_definition_id,${sql.raw(entry.value.column)})
          values (${input.organizationId},${input.productId}::uuid,${entry.definition.id}::uuid,${entry.value.value})
        `.execute(transaction);
    }
    await emitCatalogEvent(transaction, {
      organizationId: input.organizationId,
      productId: input.productId,
      eventType: 'catalog.product.attributes_updated',
      actorId: input.actorId,
      auditAction: 'catalog.product.attributes_updated',
    });
    return asProduct(product);
  });
}

function normalizedContentText(value: string, label: string, maximumLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new CatalogDomainError('VALIDATION_FAILED', `${label} cannot be empty.`);
  if (normalized.length > maximumLength)
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      `${label} cannot exceed ${maximumLength} characters.`,
    );
  return normalized;
}

function normalizedOptionalContentText(
  value: string | null,
  label: string,
  maximumLength: number,
): string | null {
  if (value === null || !value.trim()) return null;
  return normalizedContentText(value, label, maximumLength);
}

export async function replaceCatalogProductContent(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    productId: string;
    expectedVersion: number;
    informationGroups: readonly {
      title: string;
      items: readonly { label: string; value: string }[];
    }[];
    faqs: readonly { question: string; answer: string }[];
    seoTitle: string | null;
    seoDescription: string | null;
  },
): Promise<ProductSummary> {
  if (input.informationGroups.length > 12)
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'A Product can have at most 12 information groups.',
    );
  if (input.faqs.length > 30)
    throw new CatalogDomainError('VALIDATION_FAILED', 'A Product can have at most 30 FAQs.');
  const informationGroups = input.informationGroups.map((group, groupIndex) => {
    if (group.items.length === 0)
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        `Information group ${groupIndex + 1} needs at least one item.`,
      );
    if (group.items.length > 24)
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        `Information group ${groupIndex + 1} can have at most 24 items.`,
      );
    const items = group.items.map((item, itemIndex) => ({
      label: normalizedContentText(
        item.label,
        `Information group ${groupIndex + 1}, item ${itemIndex + 1} label`,
        120,
      ),
      value: normalizedContentText(
        item.value,
        `Information group ${groupIndex + 1}, item ${itemIndex + 1} value`,
        2000,
      ),
    }));
    const labels = items.map((item) => item.label.toLocaleLowerCase('en'));
    if (new Set(labels).size !== labels.length)
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        `Information group ${groupIndex + 1} contains duplicate labels.`,
      );
    return {
      title: normalizedContentText(group.title, `Information group ${groupIndex + 1} title`, 120),
      items,
    };
  });
  const groupTitles = informationGroups.map((group) => group.title.toLocaleLowerCase('en'));
  if (new Set(groupTitles).size !== groupTitles.length)
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'Provide each Product information group once.',
    );
  const faqs = input.faqs.map((faq, index) => ({
    question: normalizedContentText(faq.question, `FAQ ${index + 1} question`, 300),
    answer: normalizedContentText(faq.answer, `FAQ ${index + 1} answer`, 3000),
  }));
  const faqQuestions = faqs.map((faq) => faq.question.toLocaleLowerCase('en'));
  if (new Set(faqQuestions).size !== faqQuestions.length)
    throw new CatalogDomainError('VALIDATION_FAILED', 'Provide each FAQ question once.');
  const seoTitle = normalizedOptionalContentText(input.seoTitle, 'SEO title', 180);
  const seoDescription = normalizedOptionalContentText(
    input.seoDescription,
    'SEO description',
    500,
  );

  return db.transaction().execute(async (transaction) => {
    const updated = await sql<{
      id: string;
      handle: string;
      title: string;
      status: ProductSummary['status'];
      publication_status: ProductSummary['publicationStatus'];
      version: string;
    }>`
      update catalog.products
      set seo_title=${seoTitle},seo_description=${seoDescription},version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.productId}::uuid
        and version=${input.expectedVersion}
      returning id::text,handle,title,status,publication_status,version::text
    `.execute(transaction);
    const product = updated.rows[0];
    if (!product) throw new CatalogDomainError('STALE_VERSION', 'Product changed; reload content.');

    await sql`
      delete from catalog.product_information_items item
      where item.organization_id=${input.organizationId}
        and item.group_id in (
          select id from catalog.product_information_groups
          where organization_id=${input.organizationId} and product_id=${input.productId}::uuid
        )
    `.execute(transaction);
    await sql`
      delete from catalog.product_information_groups
      where organization_id=${input.organizationId} and product_id=${input.productId}::uuid
    `.execute(transaction);
    await sql`
      delete from catalog.product_faqs
      where organization_id=${input.organizationId} and product_id=${input.productId}::uuid
    `.execute(transaction);

    for (const [groupIndex, group] of informationGroups.entries()) {
      const inserted = await sql<{ id: string }>`
        insert into catalog.product_information_groups
          (organization_id,product_id,title,position)
        values (${input.organizationId},${input.productId}::uuid,${group.title},${groupIndex})
        returning id::text
      `.execute(transaction);
      const groupId = inserted.rows[0]?.id;
      if (!groupId) throw new Error('Information group insert did not return an id.');
      for (const [itemIndex, item] of group.items.entries())
        await sql`
          insert into catalog.product_information_items
            (organization_id,group_id,label,value_text,position)
          values (${input.organizationId},${groupId}::uuid,${item.label},${item.value},${itemIndex})
        `.execute(transaction);
    }
    for (const [faqIndex, faq] of faqs.entries())
      await sql`
        insert into catalog.product_faqs
          (organization_id,product_id,question,answer,position)
        values (
          ${input.organizationId},${input.productId}::uuid,
          ${faq.question},${faq.answer},${faqIndex}
        )
      `.execute(transaction);

    await emitCatalogEvent(transaction, {
      organizationId: input.organizationId,
      productId: input.productId,
      eventType: 'catalog.product.content_updated',
      actorId: input.actorId,
      auditAction: 'catalog.product.content_updated',
    });
    return asProduct(product);
  });
}

export interface CatalogVariantWrite {
  readonly sku: string;
  readonly title?: string;
  readonly optionValueIds: readonly string[];
  readonly barcode?: string;
  readonly primaryColorId?: string;
  readonly associatedColorIds?: readonly string[];
  readonly weight?: { readonly value: string; readonly unit: 'G' | 'KG' | 'OZ' | 'LB' };
  readonly dimensions?: {
    readonly length: string;
    readonly width: string;
    readonly height: string;
    readonly unit: 'MM' | 'CM' | 'IN';
  };
}

async function validateVariantOptionSelection(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; productId: string; optionValueIds: readonly string[] },
): Promise<readonly { option_value_id: string; option_axis_id: string }[]> {
  const axisCount = await sql<{ count: string }>`select count(*)::text count
    from catalog.product_option_axes where organization_id=${input.organizationId}
      and product_id=${input.productId}::uuid and status='ACTIVE'`.execute(db);
  const expected = Number(axisCount.rows[0]?.count ?? 0);
  if (input.optionValueIds.length !== expected)
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      expected === 0
        ? 'This Product has no customer options; create its single default Variant without option values.'
        : `Choose exactly one value from each of the Product's ${expected} active options.`,
    );
  if (expected === 0) return [];
  const uniqueIds = [...new Set(input.optionValueIds)];
  if (uniqueIds.length !== input.optionValueIds.length)
    throw new CatalogDomainError('VALIDATION_FAILED', 'A Variant cannot repeat an option value.');
  const selected = await sql<{ option_value_id: string; option_axis_id: string }>`
    select value.id::text as option_value_id,axis.id::text as option_axis_id
    from catalog.product_option_values value
    join catalog.product_option_axes axis
      on axis.id=value.option_axis_id and axis.organization_id=value.organization_id
    where value.id=any(${uniqueIds}::uuid[]) and axis.product_id=${input.productId}::uuid
      and value.organization_id=${input.organizationId} and value.status='ACTIVE' and axis.status='ACTIVE'
  `.execute(db);
  if (
    selected.rows.length !== expected ||
    new Set(selected.rows.map((row) => row.option_axis_id)).size !== expected
  )
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'Variant options must be active values from distinct options on this Product.',
    );
  return selected.rows;
}

async function validateVariantColors(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    primaryColorId?: string | null;
    associatedColorIds?: readonly string[];
  },
): Promise<readonly string[]> {
  const ids = [
    ...(input.primaryColorId ? [input.primaryColorId] : []),
    ...new Set(input.associatedColorIds ?? []),
  ];
  if (new Set(ids).size !== ids.length)
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'The primary Color cannot also be an associated Color.',
    );
  if (ids.length === 0) return ids;
  const colors = await sql<{ id: string }>`select id::text from catalog.colors
    where organization_id=${input.organizationId} and status='ACTIVE' and id=any(${ids}::uuid[])`.execute(
    db,
  );
  if (colors.rows.length !== ids.length)
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'Every Variant Color must be active and belong to this organization.',
    );
  return ids;
}

export async function createCatalogVariants(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    variants: readonly CatalogVariantWrite[];
  },
): Promise<readonly { id: string; sku: string; version: number }[]> {
  if (input.variants.length === 0 || input.variants.length > 250)
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'Create between 1 and 250 Variants in one operation.',
    );
  const normalizedSkus = input.variants.map((variant) => normalizeSku(variant.sku));
  if (normalizedSkus.some((sku) => !sku))
    throw new CatalogDomainError('VALIDATION_FAILED', 'Every Variant needs an SKU.');
  if (new Set(normalizedSkus).size !== normalizedSkus.length)
    throw new CatalogDomainError('VALIDATION_FAILED', 'Variant SKUs must be unique.');

  return db.transaction().execute(async (transaction) => {
    const product = await sql<{ id: string }>`select id::text from catalog.products
      where organization_id=${input.organizationId} and id=${input.productId}::uuid
        and status<>'ARCHIVED'`.execute(transaction);
    if (!product.rows[0])
      throw new CatalogDomainError('NOT_FOUND', 'Product was not found or is archived.');
    const created: { id: string; sku: string; version: number }[] = [];
    for (const [index, variantInput] of input.variants.entries()) {
      const selected = await validateVariantOptionSelection(transaction, {
        organizationId: input.organizationId,
        productId: input.productId,
        optionValueIds: variantInput.optionValueIds,
      });
      await validateVariantColors(transaction, {
        organizationId: input.organizationId,
        ...(variantInput.primaryColorId ? { primaryColorId: variantInput.primaryColorId } : {}),
        ...(variantInput.associatedColorIds
          ? { associatedColorIds: variantInput.associatedColorIds }
          : {}),
      });
      const title = variantInput.title?.trim() || null;
      const barcode = variantInput.barcode?.trim() || null;
      const signature = selected.length > 0 ? optionSignature(variantInput.optionValueIds) : 'default';
      const row = await sql<{ id: string; sku: string; version: string }>`
        insert into catalog.product_variants
          (organization_id,product_id,title,sku,sku_normalized,barcode,option_signature,
            weight_value,weight_unit,length_value,width_value,height_value,dimension_unit)
        values (${input.organizationId},${input.productId},${title},${variantInput.sku.trim()},
          ${normalizedSkus[index]!},${barcode},${signature},${variantInput.weight?.value ?? null},
          ${variantInput.weight?.unit ?? null},${variantInput.dimensions?.length ?? null},
          ${variantInput.dimensions?.width ?? null},${variantInput.dimensions?.height ?? null},
          ${variantInput.dimensions?.unit ?? null})
        returning id::text,sku,version::text`.execute(transaction);
      const variant = row.rows[0];
      if (!variant) throw new Error('Variant creation did not return a Variant.');
      for (const value of selected)
        await sql`insert into catalog.variant_option_values
          (organization_id,variant_id,option_axis_id,option_value_id)
          values (${input.organizationId},${variant.id},${value.option_axis_id},${value.option_value_id})`.execute(
          transaction,
        );
      if (variantInput.primaryColorId)
        await sql`insert into catalog.variant_colors
          (organization_id,variant_id,color_id,role,position)
          values (${input.organizationId},${variant.id},${variantInput.primaryColorId},'PRIMARY',0)`.execute(
          transaction,
        );
      for (const [position, colorId] of (variantInput.associatedColorIds ?? []).entries())
        await sql`insert into catalog.variant_colors
          (organization_id,variant_id,color_id,role,position)
          values (${input.organizationId},${variant.id},${colorId},'ASSOCIATED',${position})`.execute(
          transaction,
        );
      // Catalog establishes the inventory identity; stock remains owned by Inventory.
      await sql`insert into inventory.inventory_items (organization_id,variant_id)
        values (${input.organizationId},${variant.id}) on conflict (variant_id) do nothing`.execute(
        transaction,
      );
      created.push({ id: variant.id, sku: variant.sku, version: Number(variant.version) });
    }
    return created;
  });
}

export async function createCatalogVariant(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; productId: string } & CatalogVariantWrite,
): Promise<{ id: string; sku: string; version: number }> {
  const [variant] = await createCatalogVariants(db, {
    organizationId: input.organizationId,
    productId: input.productId,
    variants: [input],
  });
  if (!variant) throw new Error('Variant creation did not return a Variant.');
  return variant;
}

export async function updateCatalogVariant(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    variantId: string;
    expectedVersion: number;
    sku?: string;
    title?: string | null;
    optionValueIds?: readonly string[];
    barcode?: string | null;
    status?: 'ACTIVE' | 'ARCHIVED';
    primaryColorId?: string | null;
    associatedColorIds?: readonly string[];
    weight?: { readonly value: string; readonly unit: 'G' | 'KG' | 'OZ' | 'LB' } | null;
    dimensions?:
      | {
          readonly length: string;
          readonly width: string;
          readonly height: string;
          readonly unit: 'MM' | 'CM' | 'IN';
        }
      | null;
  },
): Promise<{ id: string; sku: string; version: number }> {
  return db.transaction().execute(async (transaction) => {
    const current = await sql<{ id: string; sku: string }>`select id::text,sku
      from catalog.product_variants where organization_id=${input.organizationId}
        and product_id=${input.productId}::uuid and id=${input.variantId}::uuid`.execute(transaction);
    if (!current.rows[0]) throw new CatalogDomainError('NOT_FOUND', 'Variant was not found.');
    const sku = input.sku === undefined ? undefined : normalizeSku(input.sku);
    if (sku !== undefined && !sku)
      throw new CatalogDomainError('VALIDATION_FAILED', 'Variant SKU is required.');
    const selected =
      input.optionValueIds === undefined
        ? undefined
        : await validateVariantOptionSelection(transaction, {
            organizationId: input.organizationId,
            productId: input.productId,
            optionValueIds: input.optionValueIds,
          });
    if (input.primaryColorId !== undefined || input.associatedColorIds !== undefined) {
      const existing = await sql<{ color_id: string; role: 'PRIMARY' | 'ASSOCIATED' }>`
        select color_id::text,role from catalog.variant_colors
        where organization_id=${input.organizationId} and variant_id=${input.variantId}::uuid
        order by role,position,color_id`.execute(transaction);
      const primaryColorId =
        input.primaryColorId === undefined
          ? (existing.rows.find((color) => color.role === 'PRIMARY')?.color_id ?? null)
          : input.primaryColorId;
      const associatedColorIds =
        input.associatedColorIds === undefined
          ? existing.rows
              .filter((color) => color.role === 'ASSOCIATED')
              .map((color) => color.color_id)
          : [...new Set(input.associatedColorIds)];
      await validateVariantColors(transaction, {
        organizationId: input.organizationId,
        primaryColorId,
        associatedColorIds,
      });
      await sql`delete from catalog.variant_colors where organization_id=${input.organizationId}
        and variant_id=${input.variantId}::uuid`.execute(transaction);
      if (primaryColorId)
        await sql`insert into catalog.variant_colors
          (organization_id,variant_id,color_id,role,position)
          values (${input.organizationId},${input.variantId},${primaryColorId},'PRIMARY',0)`.execute(
          transaction,
        );
      for (const [position, colorId] of associatedColorIds.entries())
        await sql`insert into catalog.variant_colors
          (organization_id,variant_id,color_id,role,position)
          values (${input.organizationId},${input.variantId},${colorId},'ASSOCIATED',${position})`.execute(
          transaction,
        );
    }
    const title = input.title === undefined ? undefined : input.title?.trim() || null;
    const barcode = input.barcode === undefined ? undefined : input.barcode?.trim() || null;
    const updated = await sql<{ id: string; sku: string; version: string }>`update catalog.product_variants
      set sku=case when ${input.sku !== undefined} then ${input.sku?.trim() ?? ''} else sku end,
        sku_normalized=case when ${input.sku !== undefined} then ${sku ?? ''} else sku_normalized end,
        title=case when ${input.title !== undefined} then ${title ?? null} else title end,
        barcode=case when ${input.barcode !== undefined} then ${barcode ?? null} else barcode end,
        status=coalesce(${input.status ?? null},status),
        option_signature=case when ${input.optionValueIds !== undefined}
          then ${selected && selected.length > 0 ? optionSignature(input.optionValueIds ?? []) : 'default'}
          else option_signature end,
        weight_value=case when ${input.weight !== undefined} then ${input.weight?.value ?? null} else weight_value end,
        weight_unit=case when ${input.weight !== undefined} then ${input.weight?.unit ?? null} else weight_unit end,
        length_value=case when ${input.dimensions !== undefined} then ${input.dimensions?.length ?? null} else length_value end,
        width_value=case when ${input.dimensions !== undefined} then ${input.dimensions?.width ?? null} else width_value end,
        height_value=case when ${input.dimensions !== undefined} then ${input.dimensions?.height ?? null} else height_value end,
        dimension_unit=case when ${input.dimensions !== undefined} then ${input.dimensions?.unit ?? null} else dimension_unit end,
        version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and product_id=${input.productId}::uuid
        and id=${input.variantId}::uuid and version=${input.expectedVersion}
      returning id::text,sku,version::text`.execute(transaction);
    const variant = updated.rows[0];
    if (!variant)
      throw new CatalogDomainError('STALE_VERSION', 'Variant changed while you were editing it.');
    if (selected) {
      await sql`delete from catalog.variant_option_values where organization_id=${input.organizationId}
        and variant_id=${input.variantId}::uuid`.execute(transaction);
      for (const value of selected)
        await sql`insert into catalog.variant_option_values
          (organization_id,variant_id,option_axis_id,option_value_id)
          values (${input.organizationId},${input.variantId},${value.option_axis_id},${value.option_value_id})`.execute(
          transaction,
        );
    }
    return { id: variant.id, sku: variant.sku, version: Number(variant.version) };
  });
}

export async function listCatalogProducts(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly ProductSummary[]> {
  const result = await sql<{
    id: string;
    handle: string;
    title: string;
    status: ProductSummary['status'];
    publication_status: ProductSummary['publicationStatus'];
    version: string;
    product_type_name: string;
    variant_count: string;
    sku_preview: string | null;
    updated_at: string;
  }>`
    select product.id, product.handle, product.title, product.status, product.publication_status,
      product.version::text, product_type.name as product_type_name,
      count(variant.id)::text as variant_count,
      min(variant.sku) as sku_preview,
      product.updated_at::text
    from catalog.products product
    join catalog.product_types product_type
      on product_type.id=product.product_type_id and product_type.organization_id=product.organization_id
    left join catalog.product_variants variant
      on variant.product_id=product.id and variant.organization_id=product.organization_id
    where product.organization_id = ${organizationId}
    group by product.id,product_type.name
    order by product.updated_at desc, product.id desc
  `.execute(db);
  return result.rows.map(asProduct);
}

function escapeLikePattern(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

export async function listCatalogProductWorkItems(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    query?: string;
    status?: 'ALL' | 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'PUBLISHED';
    productTypeId?: string;
    readiness?: 'ALL' | CatalogReadinessState;
    page?: number;
    pageSize?: number;
  },
): Promise<CatalogProductWorklist> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, input.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const query = input.query?.trim();
  const searchPattern = query ? `%${escapeLikePattern(query)}%` : null;
  const status = input.status ?? 'ALL';
  const readiness = input.readiness ?? 'ALL';
  const productTypeId = input.productTypeId ?? null;

  const [workItems, summary] = await Promise.all([
    sql<{
      id: string;
      handle: string;
      title: string;
      status: ProductSummary['status'];
      publication_status: ProductSummary['publicationStatus'];
      version: string;
      product_type_name: string;
      active_variant_count: number;
      sku_preview: string | null;
      updated_at: string;
      default_currency: string;
      priced_variant_count: number;
      public_media_count: number;
      available_variant_count: number;
      category_count: number;
      blocker_count: number;
      warning_count: number;
      readiness_state: CatalogReadinessState;
      filtered_total: string;
      primary_media_id: string | null;
      minimum_price: string | null;
      maximum_price: string | null;
      available_quantity: string;
    }>`
      with facts as (
        select product.id,product.handle,product.title,product.description,product.status,
          product.publication_status,product.version,product.updated_at,product.product_type_id,
          product_type.name as product_type_name,product_type.status as product_type_status,
          organization.default_currency,
          (select placement.asset_id::text from catalog.product_media placement
            join media.media_assets asset on asset.organization_id=placement.organization_id
              and asset.id=placement.asset_id and asset.status='READY'
            where placement.organization_id=product.organization_id
              and placement.product_id=product.id
            order by placement.is_primary desc,placement.position,placement.id limit 1
          ) primary_media_id,
          (select min(price.amount)::text from pricing.price_definitions price
            join catalog.product_variants priced_variant
              on priced_variant.organization_id=price.organization_id
              and priced_variant.id=price.variant_id and priced_variant.product_id=product.id
              and priced_variant.status='ACTIVE'
            where price.organization_id=product.organization_id
              and price.currency_code=organization.default_currency and price.status='ACTIVE'
              and price.effective_from<=now()
              and (price.effective_to is null or price.effective_to>now())) minimum_price,
          (select max(price.amount)::text from pricing.price_definitions price
            join catalog.product_variants priced_variant
              on priced_variant.organization_id=price.organization_id
              and priced_variant.id=price.variant_id and priced_variant.product_id=product.id
              and priced_variant.status='ACTIVE'
            where price.organization_id=product.organization_id
              and price.currency_code=organization.default_currency and price.status='ACTIVE'
              and price.effective_from<=now()
              and (price.effective_to is null or price.effective_to>now())) maximum_price,
          (select coalesce(sum(level.sellable_quantity-level.reserved_quantity),0)::text
            from catalog.product_variants stock_variant
            join inventory.inventory_items item
              on item.organization_id=stock_variant.organization_id and item.variant_id=stock_variant.id
            left join inventory.inventory_levels level
              on level.organization_id=item.organization_id and level.inventory_item_id=item.id
            where stock_variant.organization_id=product.organization_id
              and stock_variant.product_id=product.id and stock_variant.status='ACTIVE'
          ) available_quantity,
          (select count(*)::integer from catalog.product_variants variant
            where variant.organization_id=product.organization_id
              and variant.product_id=product.id and variant.status='ACTIVE') as active_variant_count,
          (select min(variant.sku) from catalog.product_variants variant
            where variant.organization_id=product.organization_id
              and variant.product_id=product.id and variant.status='ACTIVE') as sku_preview,
          (select count(*)::integer
            from catalog.product_type_attributes required
            join catalog.attribute_definitions definition
              on definition.id=required.attribute_definition_id
              and definition.organization_id=product.organization_id
              and definition.status='ACTIVE'
            left join catalog.product_attribute_values value
              on value.organization_id=product.organization_id and value.product_id=product.id
              and value.attribute_definition_id=required.attribute_definition_id
            where required.organization_id=product.organization_id
              and required.product_type_id=product.product_type_id and required.is_required
              and definition.scope='PRODUCT' and value.id is null
          ) as required_attribute_missing_count,
          (select count(*)::integer from catalog.product_variants variant
            where variant.organization_id=product.organization_id
              and variant.product_id=product.id and variant.status='ACTIVE'
              and (select count(*) from catalog.variant_option_values link
                join catalog.product_option_axes axis
                  on axis.id=link.option_axis_id and axis.organization_id=link.organization_id
                  and axis.product_id=product.id and axis.status='ACTIVE'
                join catalog.product_option_values value
                  on value.id=link.option_value_id and value.organization_id=link.organization_id
                  and value.option_axis_id=axis.id and value.status='ACTIVE'
                where link.organization_id=product.organization_id and link.variant_id=variant.id
              ) <> (select count(*) from catalog.product_option_axes axis
                where axis.organization_id=product.organization_id
                  and axis.product_id=product.id and axis.status='ACTIVE')
          ) as incomplete_variant_count,
          (select count(*)::integer from catalog.product_variants variant
            where variant.organization_id=product.organization_id
              and variant.product_id=product.id and variant.status='ACTIVE'
              and exists (select 1 from pricing.price_definitions price
                where price.organization_id=product.organization_id and price.variant_id=variant.id
                  and price.currency_code=organization.default_currency and price.status='ACTIVE'
                  and price.effective_from<=now()
                  and (price.effective_to is null or price.effective_to>now()))
          ) as priced_variant_count,
          (select count(*)::integer from catalog.product_media product_media
            join media.media_assets asset
              on asset.id=product_media.asset_id
              and asset.organization_id=product_media.organization_id
            where product_media.organization_id=product.organization_id
              and product_media.product_id=product.id
              and asset.status='READY' and asset.visibility_class='PUBLIC'
          ) as public_media_count,
          (select count(*)::integer from catalog.product_variants variant
            where variant.organization_id=product.organization_id
              and variant.product_id=product.id and variant.status='ACTIVE'
              and exists (select 1 from inventory.inventory_items item
                join inventory.inventory_levels level
                  on level.inventory_item_id=item.id and level.organization_id=item.organization_id
                where item.organization_id=product.organization_id and item.variant_id=variant.id
                  and level.sellable_quantity-level.reserved_quantity>0)
          ) as available_variant_count,
          (select count(*)::integer from catalog.product_categories product_category
            join catalog.categories category
              on category.id=product_category.category_id
              and category.organization_id=product_category.organization_id
            where product_category.organization_id=product.organization_id
              and product_category.product_id=product.id and category.status='ACTIVE'
          ) as category_count
        from catalog.products product
        join platform.organizations organization on organization.id=product.organization_id
        join catalog.product_types product_type
          on product_type.id=product.product_type_id
          and product_type.organization_id=product.organization_id
        where product.organization_id=${input.organizationId}
          and (${status}='ALL'
            or (${status}='PUBLISHED' and product.publication_status='PUBLISHED')
            or (${status}<>'PUBLISHED' and product.status=${status}))
          and (${productTypeId}::uuid is null or product.product_type_id=${productTypeId}::uuid)
          and (${searchPattern}::text is null
            or product.title ilike ${searchPattern} escape '\\'
            or product.handle ilike ${searchPattern} escape '\\'
            or exists (select 1 from catalog.product_variants searched_variant
              where searched_variant.organization_id=product.organization_id
                and searched_variant.product_id=product.id
                and searched_variant.sku ilike ${searchPattern} escape '\\'))
      ), counts as (
        select facts.*,
          ((case when length(trim(title))=0 or product_type_status<>'ACTIVE' then 1 else 0 end)
            + (case when active_variant_count=0 then 1 else 0 end)
            + (case when required_attribute_missing_count>0 then 1 else 0 end)
            + (case when incomplete_variant_count>0 then 1 else 0 end))::integer as blocker_count,
          ((case when active_variant_count=0 or priced_variant_count<active_variant_count then 1 else 0 end)
            + (case when public_media_count=0 then 1 else 0 end)
            + (case when category_count=0 then 1 else 0 end)
            + (case when available_variant_count=0 then 1 else 0 end)
            + (case when nullif(trim(description),'') is null then 1 else 0 end))::integer as warning_count
        from facts
      ), scored as (
        select counts.*,
          case
            when publication_status='PUBLISHED' and (blocker_count>0 or warning_count>0) then 'ATTENTION'
            when publication_status='PUBLISHED' then 'PUBLISHED'
            when blocker_count>0 then 'BLOCKED'
            else 'READY'
          end as readiness_state
        from counts
      ), filtered as (
        select * from scored
        where ${readiness}='ALL' or readiness_state=${readiness}
      )
      select id::text,handle,title,status,publication_status,version::text,product_type_name,
        active_variant_count,sku_preview,updated_at::text,default_currency,priced_variant_count,
        public_media_count,available_variant_count,category_count,blocker_count,warning_count,
        readiness_state,primary_media_id,minimum_price,maximum_price,available_quantity,
        count(*) over()::text as filtered_total
      from filtered
      order by updated_at desc,id desc
      limit ${pageSize} offset ${offset}
    `.execute(db),
    sql<{
      total: string;
      published: string;
      drafts: string;
      archived: string;
    }>`
      select count(*)::text as total,
        count(*) filter(where publication_status='PUBLISHED')::text as published,
        count(*) filter(where status='DRAFT')::text as drafts,
        count(*) filter(where status='ARCHIVED')::text as archived
      from catalog.products where organization_id=${input.organizationId}
    `.execute(db),
  ]);

  // Normalize stale bookmarked pages after filters or deletions shrink the
  // result set. This keeps the worklist useful without weakening its bounds.
  if (workItems.rows.length === 0 && page > 1) {
    return listCatalogProductWorkItems(db, { ...input, page: 1 });
  }

  const totalItems = Number(workItems.rows[0]?.filtered_total ?? 0);
  const summaryRow = summary.rows[0];
  return {
    items: workItems.rows.map((row) => ({
      ...asProduct({
        ...row,
        variant_count: String(row.active_variant_count),
      }),
      readinessState: row.readiness_state,
      blockerCount: row.blocker_count,
      warningCount: row.warning_count,
      primaryMediaId: row.primary_media_id,
      priceRange:
        row.minimum_price && row.maximum_price
          ? {
              minimum: row.minimum_price,
              maximum: row.maximum_price,
              currency: row.default_currency,
            }
          : null,
      availableQuantity: row.available_quantity,
      operationalSignals: {
        defaultCurrency: row.default_currency,
        activeVariantCount: row.active_variant_count,
        pricedVariantCount: row.priced_variant_count,
        publicMediaCount: row.public_media_count,
        availableVariantCount: row.available_variant_count,
        categoryCount: row.category_count,
      },
    })),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
    summary: {
      total: Number(summaryRow?.total ?? 0),
      published: Number(summaryRow?.published ?? 0),
      drafts: Number(summaryRow?.drafts ?? 0),
      archived: Number(summaryRow?.archived ?? 0),
    },
  };
}

/** Compact tenant-scoped read model for operational selectors outside Catalog. */
export async function listCatalogVariantChoices(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<
  readonly {
    id: string;
    sku: string;
    productId: string;
    productTitle: string;
    status: string;
    optionSummary: string;
  }[]
> {
  const result = await sql<{
    id: string;
    sku: string;
    product_id: string;
    product_title: string;
    status: string;
    option_summary: string;
  }>`
    select variant.id::text,variant.sku,product.id::text as product_id,
      product.title as product_title,variant.status,
      coalesce(string_agg(axis.name || ': ' || value.display_value, ' · ' order by axis.position,value.position),'') as option_summary
    from catalog.product_variants variant
    join catalog.products product
      on product.id=variant.product_id and product.organization_id=variant.organization_id
    left join catalog.variant_option_values link
      on link.variant_id=variant.id and link.organization_id=variant.organization_id
    left join catalog.product_option_axes axis on axis.id=link.option_axis_id
    left join catalog.product_option_values value on value.id=link.option_value_id
    where variant.organization_id=${organizationId}
    group by variant.id,product.id,product.title
    order by product.title,variant.sku,variant.id
  `.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    productId: row.product_id,
    productTitle: row.product_title,
    status: row.status,
    optionSummary: row.option_summary,
  }));
}

/** Tenant-scoped operational read model for the Admin Product workspace. */
export async function getCatalogProductWorkspace(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
): Promise<CatalogProductWorkspace | undefined> {
  const product = await sql<{
    id: string;
    handle: string;
    title: string;
    description: string | null;
    status: ProductSummary['status'];
    publication_status: ProductSummary['publicationStatus'];
    version: string;
    product_type_id: string;
    product_type_name: string;
    primary_category_id: string | null;
    seo_title: string | null;
    seo_description: string | null;
    updated_at: string;
    size_system_id: string | null;
    size_guide_id: string | null;
  }>`
    select product.id::text,product.handle,product.title,product.description,product.status,
      product.publication_status,product.version::text,product.product_type_id::text,
      product_type.name as product_type_name,product.primary_category_id::text,
      product.seo_title,product.seo_description,
      product.updated_at::text,
      sc.size_system_id::text as size_system_id, sc.size_guide_id::text as size_guide_id
    from catalog.products product
    join catalog.product_types product_type
      on product_type.id=product.product_type_id and product_type.organization_id=product.organization_id
    left join sizing.product_size_configurations sc 
      on sc.product_id=product.id and sc.organization_id=product.organization_id and sc.status='ACTIVE'
    where product.organization_id=${organizationId} and product.id=${productId}::uuid
  `.execute(db);
  const row = product.rows[0];
  if (!row) return undefined;

  const [
    axes,
    values,
    variants,
    validation,
    categories,
    tags,
    occasions,
    collections,
    attributes,
    information,
    faqs,
    media,
  ] = await Promise.all([
    sql<{ id: string; code: string; name: string; status: 'ACTIVE' | 'ARCHIVED'; position: number; version: string }>`
      select id::text,code,name,status,position,version::text from catalog.product_option_axes
      where organization_id=${organizationId} and product_id=${productId}::uuid
      order by status,position,id
    `.execute(db),
    sql<{
      id: string;
      option_axis_id: string;
      code: string;
      label: string;
      size_definition_id: string | null;
      color_id: string | null;
      color_code: string | null;
      color_name: string | null;
      color_hex: string | null;
      color_status: CatalogColor['status'] | null;
      color_version: string | null;
      status: 'ACTIVE' | 'ARCHIVED';
      position: number;
      version: string;
    }>`
      select value.id::text,value.option_axis_id::text,value.code,value.display_value as label,
        value.size_definition_id::text,color.id::text color_id,color.code color_code,
        color.name color_name,color.hex_value color_hex,color.status color_status,
        color.version::text color_version,value.status,value.position,value.version::text
      from catalog.product_option_values value
      join catalog.product_option_axes axis
        on axis.id=value.option_axis_id and axis.organization_id=value.organization_id
      left join catalog.colors color
        on color.id=value.color_id and color.organization_id=value.organization_id
      where value.organization_id=${organizationId} and axis.product_id=${productId}::uuid
      order by value.status,value.position,value.id
    `.execute(db),
    sql<{
      id: string;
      title: string | null;
      sku: string;
      barcode: string | null;
      status: 'ACTIVE' | 'ARCHIVED';
      version: string;
      option_value_ids: string[];
      weight_value: string | null;
      weight_unit: string | null;
      length_value: string | null;
      width_value: string | null;
      height_value: string | null;
      dimension_unit: string | null;
      current_price_amount: string | null;
      current_compare_at_amount: string | null;
      default_currency: string;
      sellable_quantity: string;
      colors: {
        id: string;
        code: string;
        name: string;
        hexValue: string | null;
        status: CatalogColor['status'];
        version: number;
        role: 'PRIMARY' | 'ASSOCIATED';
      }[];
    }>`
      select variant.id::text,variant.title,variant.sku,variant.barcode,variant.status,
        variant.version::text,variant.weight_value::text,variant.weight_unit,
        variant.length_value::text,variant.width_value::text,variant.height_value::text,
        variant.dimension_unit,organization.default_currency,
        coalesce((select array_agg(link.option_value_id::text order by link.option_value_id)
          from catalog.variant_option_values link where link.organization_id=variant.organization_id
            and link.variant_id=variant.id),'{}') option_value_ids,
        price.amount::text current_price_amount,price.compare_at_amount::text current_compare_at_amount,
        coalesce(stock.sellable_quantity,0)::text sellable_quantity,
        coalesce((select jsonb_agg(jsonb_build_object('id',color.id::text,'code',color.code,
          'name',color.name,'hexValue',color.hex_value,'status',color.status,
          'version',color.version,'role',link.role) order by link.role desc,link.position,color.name)
          from catalog.variant_colors link join catalog.colors color
            on color.organization_id=link.organization_id and color.id=link.color_id
          where link.organization_id=variant.organization_id and link.variant_id=variant.id),'[]'::jsonb) colors
      from catalog.product_variants variant
      join platform.organizations organization on organization.id=variant.organization_id
      left join lateral (select definition.amount,definition.compare_at_amount
        from pricing.price_definitions definition
        where definition.organization_id=variant.organization_id and definition.variant_id=variant.id
          and definition.currency_code=organization.default_currency and definition.status='ACTIVE'
          and definition.effective_from<=now()
          and (definition.effective_to is null or definition.effective_to>now())
        order by definition.effective_from desc,definition.id desc limit 1) price on true
      left join lateral (select sum(level.sellable_quantity-level.reserved_quantity) sellable_quantity
        from inventory.inventory_items item left join inventory.inventory_levels level
          on level.organization_id=item.organization_id and level.inventory_item_id=item.id
        where item.organization_id=variant.organization_id and item.variant_id=variant.id) stock on true
      where variant.organization_id=${organizationId} and variant.product_id=${productId}::uuid
      order by variant.sku,variant.id
    `.execute(db),
    getCatalogProductReadiness(db, organizationId, productId),
    sql<{ category_id: string }>`
      select category_id::text from catalog.product_categories
      where organization_id=${organizationId} and product_id=${productId}::uuid
      order by category_id
    `.execute(db),
    sql<{ tag_id: string }>`
      select tag_id::text from catalog.product_tags
      where organization_id=${organizationId} and product_id=${productId}::uuid
      order by tag_id
    `.execute(db),
    sql<{ occasion_id: string }>`
      select occasion_id::text from catalog.product_occasions
      where organization_id=${organizationId} and product_id=${productId}::uuid
      order by occasion_id
    `.execute(db),
    sql<{ collection_id: string }>`
      select collection_id::text from catalog.product_collections
      where organization_id=${organizationId} and product_id=${productId}::uuid
      order by collection_id
    `.execute(db),
    sql<{
      id: string;
      code: string;
      name: string;
      value_type: CatalogProductAttribute['valueType'];
      is_required: boolean;
      is_filterable: boolean;
      is_searchable: boolean;
      value_json: string | boolean | null;
      reference_options: {
        id: string;
        code: string;
        label: string;
        status: 'ACTIVE' | 'ARCHIVED';
        position: number;
        version: number;
        selectionCount: number;
      }[];
    }>`
      select definition.id::text,definition.code,definition.name,definition.value_type,
        binding.is_required,definition.is_filterable,definition.is_searchable,
        case definition.value_type
          when 'TEXT' then to_jsonb(value.value_text)
          when 'INTEGER' then to_jsonb(value.value_integer::text)
          when 'DECIMAL' then to_jsonb(value.value_decimal::text)
          when 'BOOLEAN' then to_jsonb(value.value_boolean)
          when 'DATE' then to_jsonb(value.value_date::text)
          when 'REFERENCE' then to_jsonb(value.value_reference_id::text)
        end as value_json,
        coalesce((select jsonb_agg(jsonb_build_object(
          'id',option.id::text,'code',option.code,'label',option.label,'status',option.status,
          'position',option.position,'version',option.version,'selectionCount',
          (select count(*) from catalog.product_attribute_values selection
            where selection.organization_id=option.organization_id
              and selection.value_reference_id=option.id)
          + (select count(*) from catalog.variant_attribute_values selection
            where selection.organization_id=option.organization_id
              and selection.value_reference_id=option.id))
          order by option.status,option.position,option.label,option.id)
          from catalog.attribute_reference_options option
          where option.organization_id=${organizationId}
            and option.attribute_definition_id=definition.id
            and (option.status='ACTIVE' or option.id=value.value_reference_id)),'[]'::jsonb)
          as reference_options
      from catalog.product_type_attributes binding
      join catalog.attribute_definitions definition
        on definition.id=binding.attribute_definition_id
        and definition.organization_id=${organizationId}
      left join catalog.product_attribute_values value
        on value.organization_id=${organizationId} and value.product_id=${productId}::uuid
        and value.attribute_definition_id=definition.id
      where binding.organization_id=${organizationId}
        and binding.product_type_id=${row.product_type_id}::uuid
        and definition.scope='PRODUCT' and definition.status='ACTIVE'
      order by binding.is_required desc,definition.name,definition.id
    `.execute(db),
    sql<{
      group_id: string;
      group_title: string;
      item_id: string | null;
      item_label: string | null;
      item_value: string | null;
    }>`
      select information_group.id::text as group_id,information_group.title as group_title,
        item.id::text as item_id,item.label as item_label,item.value_text as item_value
      from catalog.product_information_groups information_group
      left join catalog.product_information_items item
        on item.organization_id=information_group.organization_id
        and item.group_id=information_group.id
      where information_group.organization_id=${organizationId}
        and information_group.product_id=${productId}::uuid
      order by information_group.position,information_group.id,item.position,item.id
    `.execute(db),
    sql<{ id: string; question: string; answer: string }>`
      select id::text,question,answer from catalog.product_faqs
      where organization_id=${organizationId} and product_id=${productId}::uuid
      order by position,id
    `.execute(db),
    sql<{
      id: string;
      asset_id: string;
      variant_id: string | null;
      option_value_id: string | null;
      role: CatalogProductMedia['role'];
      is_primary: boolean;
      position: number;
      title: string | null;
      alt_text: string | null;
      visibility_class: CatalogProductMedia['visibility'];
      width_px: number | null;
      height_px: number | null;
    }>`select placement.id::text,placement.asset_id::text,placement.variant_id::text,
        placement.option_value_id::text,placement.role,placement.is_primary,placement.position,
        asset.title,asset.alt_text,asset.visibility_class,object.width_px,object.height_px
      from catalog.product_media placement join media.media_assets asset
        on asset.organization_id=placement.organization_id and asset.id=placement.asset_id
      join media.media_objects object on object.organization_id=asset.organization_id
        and object.id=asset.current_object_id
      where placement.organization_id=${organizationId} and placement.product_id=${productId}::uuid
        and asset.status='READY'
      order by placement.is_primary desc,placement.position,placement.id`.execute(db),
  ]);
  if (!validation) return undefined;

  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    description: row.description,
    status: row.status,
    publicationStatus: row.publication_status,
    version: Number(row.version),
    productTypeId: row.product_type_id,
    productTypeName: row.product_type_name,
    sizeSystemId: row.size_system_id,
    sizeGuideId: row.size_guide_id,
    variantCount: variants.rows.length,
    skuPreview: variants.rows[0]?.sku ?? null,
    updatedAt: row.updated_at,
    options: axes.rows.map((axis) => ({
      id: axis.id,
      code: axis.code,
      name: axis.name,
      status: axis.status,
      position: axis.position,
      version: Number(axis.version),
      values: values.rows
        .filter((value) => value.option_axis_id === axis.id)
        .map((value) => ({
          id: value.id,
          code: value.code,
          label: value.label,
          status: value.status,
          position: value.position,
          version: Number(value.version),
          sizeDefinitionId: value.size_definition_id,
          color:
            value.color_id && value.color_code && value.color_name && value.color_status
              ? {
                  id: value.color_id,
                  code: value.color_code,
                  name: value.color_name,
                  hexValue: value.color_hex,
                  status: value.color_status,
                  version: Number(value.color_version),
                }
              : null,
        })),
    })),
    variants: variants.rows.map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku,
      barcode: variant.barcode,
      status: variant.status,
      version: Number(variant.version),
      optionValueIds: variant.option_value_ids,
      primaryColor:
        variant.colors.find((color) => color.role === 'PRIMARY') ?? null,
      associatedColors: variant.colors.filter((color) => color.role === 'ASSOCIATED'),
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
            currency: variant.default_currency,
          }
        : null,
      sellableQuantity: variant.sellable_quantity,
      media: media.rows
        .filter((placement) => placement.variant_id === variant.id)
        .map((placement) => ({
          id: placement.id,
          assetId: placement.asset_id,
          variantId: placement.variant_id,
          optionValueId: placement.option_value_id,
          role: placement.role,
          isPrimary: placement.is_primary,
          position: placement.position,
          title: placement.title,
          altText: placement.alt_text,
          visibility: placement.visibility_class,
          width: placement.width_px,
          height: placement.height_px,
        })),
    })),
    media: media.rows.map((placement) => ({
      id: placement.id,
      assetId: placement.asset_id,
      variantId: placement.variant_id,
      optionValueId: placement.option_value_id,
      role: placement.role,
      isPrimary: placement.is_primary,
      position: placement.position,
      title: placement.title,
      altText: placement.alt_text,
      visibility: placement.visibility_class,
      width: placement.width_px,
      height: placement.height_px,
    })),
    readiness: validation.readiness,
    operationalSignals: validation.operationalSignals,
    organization: {
      categoryIds: categories.rows.map((category) => category.category_id),
      primaryCategoryId: row.primary_category_id,
      tagIds: tags.rows.map((tag) => tag.tag_id),
      occasionIds: occasions.rows.map((occasion) => occasion.occasion_id),
      collectionIds: collections.rows.map((collection) => collection.collection_id),
      attributes: attributes.rows.map((attribute) => ({
        id: attribute.id,
        code: attribute.code,
        name: attribute.name,
        valueType: attribute.value_type,
        required: attribute.is_required,
        filterable: attribute.is_filterable,
        searchable: attribute.is_searchable,
        value: attribute.value_json,
        referenceOptions: attribute.reference_options,
      })),
    },
    content: {
      informationGroups: information.rows
        .filter(
          (entry, index, entries) =>
            entries.findIndex((candidate) => candidate.group_id === entry.group_id) === index,
        )
        .map((group) => ({
          id: group.group_id,
          title: group.group_title,
          items: information.rows
            .filter((item) => item.group_id === group.group_id && item.item_id)
            .map((item) => ({
              id: item.item_id!,
              label: item.item_label!,
              value: item.item_value!,
            })),
        })),
      faqs: faqs.rows,
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
    },
  };
}

export interface StorefrontProduct {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly options: readonly {
    id: string;
    code: string;
    name: string;
    values: readonly { id: string; code: string; label: string; colorHex?: string }[];
  }[];
  readonly variants: readonly {
    id: string;
    sku: string;
    optionValueIds: readonly string[];
    available: boolean;
  }[];
  readonly media: readonly {
    id: string;
    variantId: string | null;
    optionValueId: string | null;
    role: string;
    altText: string | null;
    isPrimary: boolean;
  }[];
  readonly details: readonly { group: string; label: string; value: string }[];
  readonly faqs: readonly { question: string; answer: string }[];
}

export interface StorefrontProductCard {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: string | null;
}

/** Public listings return only published catalog truth. */
export async function listStorefrontCatalogProducts(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  query?: string,
): Promise<readonly StorefrontProductCard[]> {
  const term = query?.trim();
  const result = await sql<StorefrontProductCard>`
    select id::text,handle,title,description from catalog.products
    where organization_id=${organizationId} and status='ACTIVE' and publication_status='PUBLISHED'
      and (${term ?? null}::text is null or to_tsvector('simple',coalesce(title,'') || ' ' || coalesce(description,'')) @@ websearch_to_tsquery('simple',${term ?? null}))
    order by published_at desc nulls last,id desc limit 48
  `.execute(db);
  return result.rows;
}

/** Public read deliberately filters lifecycle and publication state before any detail is loaded. */
export async function getStorefrontCatalogProduct(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  handle: string,
): Promise<StorefrontProduct | undefined> {
  const product = await sql<{
    id: string;
    handle: string;
    title: string;
    description: string | null;
    seo_title: string | null;
    seo_description: string | null;
  }>`
    select id,handle,title,description,seo_title,seo_description from catalog.products
    where organization_id = ${organizationId} and handle = ${handle} and status = 'ACTIVE' and publication_status = 'PUBLISHED'
  `.execute(db);
  const row = product.rows[0];
  if (!row) return undefined;
  const axes = await sql<{ id: string; code: string; name: string }>`
    select id, code, name from catalog.product_option_axes
    where organization_id=${organizationId} and product_id=${row.id}
      and status='ACTIVE' order by position,id
  `.execute(db);
  const options = await Promise.all(
    axes.rows.map(async (axis) => {
      const values = await sql<{
        id: string;
        code: string;
        display_value: string;
        hex_value: string | null;
      }>`
        select value.id, value.code, value.display_value, color.hex_value
        from catalog.product_option_values value left join catalog.colors color on color.id = value.color_id
        where value.organization_id=${organizationId} and value.option_axis_id=${axis.id}
          and value.status='ACTIVE' order by value.position,value.id
      `.execute(db);
      return {
        id: axis.id,
        code: axis.code,
        name: axis.name,
        values: values.rows.map((value) => ({
          id: value.id,
          code: value.code,
          label: value.display_value,
          ...(value.hex_value ? { colorHex: value.hex_value } : {}),
        })),
      };
    }),
  );
  const variants = await sql<{
    id: string;
    sku: string;
    option_value_ids: string[];
    available: boolean;
  }>`
    select variant.id,variant.sku,
      coalesce(array_agg(link.option_value_id order by link.option_value_id)
        filter (where link.option_value_id is not null),'{}') as option_value_ids,
      coalesce(bool_or(level.sellable_quantity-level.reserved_quantity>0),false) as available
    from catalog.product_variants variant
    left join catalog.variant_option_values link
      on link.organization_id=variant.organization_id and link.variant_id=variant.id
    left join inventory.inventory_items item on item.variant_id=variant.id and item.organization_id=variant.organization_id
    left join inventory.inventory_levels level on level.inventory_item_id=item.id and level.organization_id=variant.organization_id
    where variant.organization_id=${organizationId} and variant.product_id=${row.id}
      and variant.status='ACTIVE'
    group by variant.id, variant.sku order by variant.sku
  `.execute(db);
  const media = await sql<{
    id: string;
    variant_id: string | null;
    option_value_id: string | null;
    role: string;
    alt_text: string | null;
    is_primary: boolean;
  }>`
    select link.asset_id::text as id,link.variant_id::text,link.option_value_id::text,
      link.role,asset.alt_text,link.is_primary
    from catalog.product_media link
    join media.media_assets asset
      on asset.id=link.asset_id and asset.organization_id=link.organization_id
    where link.organization_id=${organizationId} and link.product_id=${row.id}
      and asset.status='READY' and asset.visibility_class='PUBLIC'
    order by link.is_primary desc,link.position,link.id
  `.execute(db);
  const details = await sql<{ group_title: string; label: string; value_text: string }>`
    select information_group.title as group_title, item.label, item.value_text
    from catalog.product_information_groups information_group
    join catalog.product_information_items item
      on item.organization_id=information_group.organization_id and item.group_id=information_group.id
    where information_group.organization_id=${organizationId}
      and information_group.product_id=${row.id}
    order by information_group.position, item.position, item.id
  `.execute(db);
  const faqs = await sql<{ question: string; answer: string }>`
    select question,answer from catalog.product_faqs
    where organization_id=${organizationId} and product_id=${row.id} order by position,id
  `.execute(db);
  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    description: row.description,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    options,
    variants: variants.rows.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      optionValueIds: variant.option_value_ids,
      available: variant.available,
    })),
    media: media.rows.map((asset) => ({
      id: asset.id,
      variantId: asset.variant_id,
      optionValueId: asset.option_value_id,
      role: asset.role,
      altText: asset.alt_text,
      isPrimary: asset.is_primary,
    })),
    details: details.rows.map((detail) => ({
      group: detail.group_title,
      label: detail.label,
      value: detail.value_text,
    })),
    faqs: faqs.rows.map((faq) => ({ question: faq.question, answer: faq.answer })),
  };
}
export async function listCatalogCategories(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<
  readonly {
    id: string;
    name: string;
    handle: string;
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    effectiveStatus: 'ACTIVE' | 'INACTIVE';
    effectiveStatusReason: 'ACTIVE' | 'SELF_INACTIVE' | 'ANCESTOR_INACTIVE';
    parentCategoryId: string | null;
    path: string;
    depth: number;
    position: number;
    productCount: number;
    childCount: number;
    version: number;
    updatedAt: string;
  }[]
> {
  const result = await sql<{
    id: string;
    name: string;
    handle: string;
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    parent_category_id: string | null;
    position: number;
    effective_status: 'ACTIVE' | 'INACTIVE';
    effective_status_reason: 'ACTIVE' | 'SELF_INACTIVE' | 'ANCESTOR_INACTIVE';
    path: string;
    depth: number;
    version: number;
    updated_at: Date;
    product_count: string;
    child_count: string;
  }>`
    with recursive category_tree as (
      select 
        category.id,
        category.name,
        category.handle,
        category.status,
        category.parent_category_id,
        category.position,
        category.version,
        category.updated_at,
        case 
          when category.status = 'ACTIVE' then 'ACTIVE' 
          else 'INACTIVE' 
        end::text as effective_status,
        case 
          when category.status = 'ACTIVE' then 'ACTIVE' 
          else 'SELF_INACTIVE' 
        end::text as effective_status_reason,
        category.name::text as path,
        0::integer as depth,
        array[category.id] as visited
      from catalog.categories category
      where category.organization_id=${organizationId}
        and category.parent_category_id is null
        
      union all
      
      select 
        child.id,
        child.name,
        child.handle,
        child.status,
        child.parent_category_id,
        child.position,
        child.version,
        child.updated_at,
        case 
          when parent.effective_status = 'INACTIVE' or parent.status = 'ARCHIVED' then 'INACTIVE'
          when child.status = 'ACTIVE' then 'ACTIVE' 
          else 'INACTIVE' 
        end::text as effective_status,
        case 
          when parent.effective_status = 'INACTIVE' or parent.status = 'ARCHIVED' then 'ANCESTOR_INACTIVE'
          when child.status = 'ACTIVE' then 'ACTIVE' 
          else 'SELF_INACTIVE' 
        end::text as effective_status_reason,
        (parent.path || ' / ' || child.name)::text,
        parent.depth+1,
        parent.visited || child.id
      from catalog.categories child
      join category_tree parent on parent.id=child.parent_category_id
      where child.organization_id=${organizationId}
        and not child.id=any(parent.visited)
    )
    select 
      tree.id::text,
      tree.name,
      tree.handle,
      tree.status,
      tree.parent_category_id::text,
      tree.position::integer,
      tree.version::integer,
      tree.updated_at,
      tree.effective_status,
      tree.effective_status_reason,
      tree.path,
      tree.depth,
      (select count(*)::text from catalog.product_categories pc where pc.category_id = tree.id and pc.organization_id = ${organizationId}) as product_count,
      (select count(*)::text from catalog.categories c where c.parent_category_id = tree.id and c.organization_id = ${organizationId}) as child_count
    from category_tree tree
    order by tree.path, tree.position, tree.id
  `.execute(db);

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    handle: row.handle,
    status: row.status,
    effectiveStatus: row.effective_status as 'ACTIVE' | 'INACTIVE',
    effectiveStatusReason: row.effective_status_reason as
      'ACTIVE' | 'SELF_INACTIVE' | 'ANCESTOR_INACTIVE',
    parentCategoryId: row.parent_category_id,
    path: row.path,
    depth: row.depth,
    position: row.position,
    productCount: Number(row.product_count),
    childCount: Number(row.child_count),
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function updateCatalogCategory(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    categoryId: string;
    name?: string;
    handle?: string;
    status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    parentCategoryId?: string | null;
    position?: number;
    expectedVersion: number;
  },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    // 1. check cycle if parentCategoryId is provided and different
    if (input.parentCategoryId !== undefined) {
      if (input.parentCategoryId) {
        const invalid = await sql<{ found: boolean }>`
          with recursive descendants as (
            select id from catalog.categories where id = ${input.categoryId} and organization_id = ${input.organizationId}
            union all
            select child.id from catalog.categories child join descendants on child.parent_category_id = descendants.id
            where child.organization_id = ${input.organizationId}
          ) select exists(select 1 from descendants where id = ${input.parentCategoryId}) as found
        `.execute(transaction);
        if (invalid.rows[0]?.found)
          throw new CatalogDomainError(
            'CATEGORY_CYCLE',
            'A category cannot be moved under itself or a descendant.',
          );
      }
    }

    // 2. if handle is updated, handle history
    if (input.handle) {
      const current = await sql<{ handle: string }>`
        select handle from catalog.categories where id=${input.categoryId} and organization_id=${input.organizationId}
      `.execute(transaction);
      if (current.rows.length === 0)
        throw new CatalogDomainError('NOT_FOUND', 'Category not found');

      const oldHandle = current.rows[0]?.handle;
      if (oldHandle && oldHandle !== input.handle) {
        await sql`
          insert into catalog.category_handle_history (organization_id, category_id, old_handle)
          values (${input.organizationId}, ${input.categoryId}, ${oldHandle})
          on conflict do nothing
        `.execute(transaction);
      }
    }

    // 3. Update category
    const parts = [];
    if (input.name !== undefined) parts.push(sql`name = ${input.name}`);
    if (input.handle !== undefined) parts.push(sql`handle = ${input.handle}`);
    if (input.status !== undefined) parts.push(sql`status = ${input.status}`);
    if (input.parentCategoryId !== undefined)
      parts.push(sql`parent_category_id = ${input.parentCategoryId ?? null}`);
    if (input.position !== undefined) parts.push(sql`position = ${input.position}`);

    if (parts.length === 0) return;

    parts.push(sql`version = version + 1`, sql`updated_at = now()`);

    const updateQuery = sql`
      update catalog.categories
      set ${sql.join(parts, sql`, `)}
      where id = ${input.categoryId} 
        and organization_id = ${input.organizationId} 
        and version = ${input.expectedVersion}
    `;

    const result = await updateQuery.execute(transaction);
    if (Number(result.numAffectedRows) !== 1) {
      throw new CatalogDomainError('STALE_VERSION', 'Category was not found or has changed.');
    }
  });
}
