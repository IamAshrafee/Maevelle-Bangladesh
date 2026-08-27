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
  readonly description: string | null;
  readonly productTypeId: string;
  readonly options: readonly {
    id: string;
    code: string;
    name: string;
    values: readonly { id: string; code: string; label: string }[];
  }[];
  readonly variants: readonly {
    id: string;
    sku: string;
    status: string;
    optionValueIds: readonly string[];
  }[];
  readonly readiness: CatalogProductReadiness;
  readonly operationalSignals: CatalogProductOperationalSignals;
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
        where required.product_type_id=product.product_type_id
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
  },
): Promise<ProductSummary> {
  return db.transaction().execute(async (transaction) => {
    const productType = await sql<{ id: string }>`
      select id from catalog.product_types where id = ${input.productTypeId} and organization_id = ${input.organizationId} and status = 'ACTIVE'
    `.execute(transaction);
    if (!productType.rows[0])
      throw new CatalogDomainError('VALIDATION_FAILED', 'Product type is not available.');
    const created = await sql<{
      id: string;
      handle: string;
      title: string;
      status: ProductSummary['status'];
      publication_status: ProductSummary['publicationStatus'];
      version: string;
    }>`
      insert into catalog.products (organization_id, product_type_id, handle, title, description)
      values (${input.organizationId}, ${input.productTypeId}, ${input.handle}, ${input.title}, ${input.description ?? null})
      returning id, handle, title, status, publication_status, version::text
    `.execute(transaction);
    const product = created.rows[0];
    if (!product) throw new Error('Product creation did not return a product.');
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
  },
): Promise<ProductSummary> {
  return db.transaction().execute(async (transaction) => {
    const before = await sql<{ handle: string }>`
      select handle from catalog.products where id = ${input.productId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    if (!before.rows[0]) throw new CatalogDomainError('NOT_FOUND', 'Product was not found.');
    const updated = await sql<{
      id: string;
      handle: string;
      title: string;
      status: ProductSummary['status'];
      publication_status: ProductSummary['publicationStatus'];
      version: string;
    }>`
      update catalog.products
      set title = coalesce(${input.title ?? null}, title),
          handle = coalesce(${input.handle ?? null}, handle),
          description = case when ${input.description === undefined} then description else ${input.description ?? null} end,
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

export async function createCatalogVariant(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    sku: string;
    optionValueIds: readonly string[];
  },
): Promise<{ id: string; sku: string; version: number }> {
  if (input.optionValueIds.length === 0)
    throw new CatalogDomainError('VALIDATION_FAILED', 'A variant needs an option combination.');
  return db.transaction().execute(async (transaction) => {
    const selected = await sql<{ option_value_id: string; option_axis_id: string }>`
      select value.id as option_value_id, axis.id as option_axis_id
      from catalog.product_option_values value
      join catalog.product_option_axes axis on axis.id = value.option_axis_id
      where value.id = any(${input.optionValueIds}::uuid[]) and axis.product_id = ${input.productId}
        and value.organization_id = ${input.organizationId} and value.status = 'ACTIVE' and axis.status = 'ACTIVE'
    `.execute(transaction);
    if (
      selected.rows.length !== input.optionValueIds.length ||
      new Set(selected.rows.map((row) => row.option_axis_id)).size !== selected.rows.length
    ) {
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        'Variant options must be active values from distinct axes on this product.',
      );
    }
    const sku = normalizeSku(input.sku);
    const created = await sql<{ id: string; sku: string; version: string }>`
      insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature)
      values (${input.organizationId}, ${input.productId}, ${input.sku.trim()}, ${sku}, ${optionSignature(input.optionValueIds)})
      returning id, sku, version::text
    `.execute(transaction);
    const variant = created.rows[0];
    if (!variant) throw new Error('Variant creation did not return a variant.');
    for (const selectedValue of selected.rows) {
      await sql`
        insert into catalog.variant_option_values (organization_id, variant_id, option_axis_id, option_value_id)
        values (${input.organizationId}, ${variant.id}, ${selectedValue.option_axis_id}, ${selectedValue.option_value_id})
      `.execute(transaction);
    }
    // Controlled Catalog → Inventory coordination: a sellable Variant always
    // receives its separate inventory identity without Catalog owning stock.
    await sql`
      insert into inventory.inventory_items (organization_id, variant_id)
      values (${input.organizationId}, ${variant.id})
      on conflict (variant_id) do nothing
    `.execute(transaction);
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
    }>`
      with facts as (
        select product.id,product.handle,product.title,product.description,product.status,
          product.publication_status,product.version,product.updated_at,product.product_type_id,
          product_type.name as product_type_name,product_type.status as product_type_status,
          organization.default_currency,
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
            where required.product_type_id=product.product_type_id and required.is_required
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
        readiness_state,count(*) over()::text as filtered_total
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
    updated_at: string;
  }>`
    select product.id::text,product.handle,product.title,product.description,product.status,
      product.publication_status,product.version::text,product.product_type_id::text,
      product_type.name as product_type_name,product.updated_at::text
    from catalog.products product
    join catalog.product_types product_type
      on product_type.id=product.product_type_id and product_type.organization_id=product.organization_id
    where product.organization_id=${organizationId} and product.id=${productId}::uuid
  `.execute(db);
  const row = product.rows[0];
  if (!row) return undefined;

  const [axes, values, variants, validation] = await Promise.all([
    sql<{ id: string; code: string; name: string }>`
      select id::text,code,name from catalog.product_option_axes
      where organization_id=${organizationId} and product_id=${productId}::uuid and status='ACTIVE'
      order by position,id
    `.execute(db),
    sql<{ id: string; option_axis_id: string; code: string; label: string }>`
      select value.id::text,value.option_axis_id::text,value.code,value.display_value as label
      from catalog.product_option_values value
      join catalog.product_option_axes axis
        on axis.id=value.option_axis_id and axis.organization_id=value.organization_id
      where value.organization_id=${organizationId} and axis.product_id=${productId}::uuid
        and value.status='ACTIVE' and axis.status='ACTIVE'
      order by value.position,value.id
    `.execute(db),
    sql<{ id: string; sku: string; status: string; option_value_ids: string[] }>`
      select variant.id::text,variant.sku,variant.status,
        coalesce(array_agg(link.option_value_id::text order by link.option_value_id)
          filter (where link.option_value_id is not null),'{}') as option_value_ids
      from catalog.product_variants variant
      left join catalog.variant_option_values link on link.variant_id=variant.id
      where variant.organization_id=${organizationId} and variant.product_id=${productId}::uuid
      group by variant.id,variant.sku,variant.status
      order by variant.sku,variant.id
    `.execute(db),
    getCatalogProductReadiness(db, organizationId, productId),
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
    variantCount: variants.rows.length,
    skuPreview: variants.rows[0]?.sku ?? null,
    updatedAt: row.updated_at,
    options: axes.rows.map((axis) => ({
      ...axis,
      values: values.rows
        .filter((value) => value.option_axis_id === axis.id)
        .map(({ id, code, label }) => ({ id, code, label })),
    })),
    variants: variants.rows.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      status: variant.status,
      optionValueIds: variant.option_value_ids,
    })),
    readiness: validation.readiness,
    operationalSignals: validation.operationalSignals,
  };
}

export interface StorefrontProduct {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: string | null;
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
    role: string;
    altText: string | null;
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
  }>`
    select id, handle, title, description from catalog.products
    where organization_id = ${organizationId} and handle = ${handle} and status = 'ACTIVE' and publication_status = 'PUBLISHED'
  `.execute(db);
  const row = product.rows[0];
  if (!row) return undefined;
  const axes = await sql<{ id: string; code: string; name: string }>`
    select id, code, name from catalog.product_option_axes
    where product_id = ${row.id} and status = 'ACTIVE' order by position, id
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
        where value.option_axis_id = ${axis.id} and value.status = 'ACTIVE' order by value.position, value.id
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
    select variant.id, variant.sku, array_agg(link.option_value_id order by link.option_value_id) as option_value_ids,
      coalesce(bool_or(level.sellable_quantity-level.reserved_quantity>0),false) as available
    from catalog.product_variants variant join catalog.variant_option_values link on link.variant_id = variant.id
    left join inventory.inventory_items item on item.variant_id=variant.id and item.organization_id=variant.organization_id
    left join inventory.inventory_levels level on level.inventory_item_id=item.id and level.organization_id=variant.organization_id
    where variant.product_id = ${row.id} and variant.status = 'ACTIVE'
    group by variant.id, variant.sku order by variant.sku
  `.execute(db);
  const media = await sql<{
    id: string;
    variant_id: string | null;
    role: string;
    alt_text: string | null;
  }>`
    select link.asset_id::text as id,link.variant_id::text,link.role,asset.alt_text
    from catalog.product_media link
    join media.media_assets asset
      on asset.id=link.asset_id and asset.organization_id=link.organization_id
    where link.organization_id=${organizationId} and link.product_id=${row.id}
      and asset.status='READY' and asset.visibility_class='PUBLIC'
    order by link.position,link.id
  `.execute(db);
  const details = await sql<{ group_title: string; label: string; value_text: string }>`
    select information_group.title as group_title, item.label, item.value_text
    from catalog.product_information_groups information_group
    join catalog.product_information_items item on item.group_id = information_group.id
    where information_group.product_id = ${row.id}
    order by information_group.position, item.position, item.id
  `.execute(db);
  const faqs = await sql<{ question: string; answer: string }>`
    select question, answer from catalog.product_faqs where product_id = ${row.id} order by position, id
  `.execute(db);
  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    description: row.description,
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
      role: asset.role,
      altText: asset.alt_text,
    })),
    details: details.rows.map((detail) => ({
      group: detail.group_title,
      label: detail.label,
      value: detail.value_text,
    })),
    faqs: faqs.rows.map((faq) => ({ question: faq.question, answer: faq.answer })),
  };
}
