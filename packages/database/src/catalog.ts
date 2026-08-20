import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';

export class CatalogDomainError extends Error {
  public constructor(
    public readonly code:
      'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'STALE_VERSION' | 'CATEGORY_CYCLE',
    message: string,
  ) {
    super(message);
    this.name = 'CatalogDomainError';
  }
}

export interface ProductSummary {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  readonly publicationStatus: 'UNPUBLISHED' | 'PUBLISHED';
  readonly version: number;
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
}): ProductSummary {
  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    status: row.status,
    publicationStatus: row.publication_status,
    version: Number(row.version),
  };
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
    const product = await sql<{ id: string }>`
      select id from catalog.products where id = ${input.productId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    if (!product.rows[0]) throw new CatalogDomainError('NOT_FOUND', 'Product was not found.');
    const variants = await sql<{ count: string }>`
      select count(*)::text as count from catalog.product_variants
      where product_id = ${input.productId} and organization_id = ${input.organizationId} and status = 'ACTIVE'
    `.execute(transaction);
    if (Number(variants.rows[0]?.count ?? 0) < 1) {
      throw new CatalogDomainError(
        'VALIDATION_FAILED',
        'A product needs at least one active variant before publishing.',
      );
    }
    const requiredMissing = await sql<{ count: string }>`
      select count(*)::text as count
      from catalog.product_type_attributes required
      join catalog.attribute_definitions definition on definition.id = required.attribute_definition_id
      left join catalog.product_attribute_values value on value.product_id = ${input.productId} and value.attribute_definition_id = required.attribute_definition_id
      where required.product_type_id = (select product_type_id from catalog.products where id = ${input.productId})
        and required.is_required and definition.scope = 'PRODUCT' and value.id is null
    `.execute(transaction);
    if (Number(requiredMissing.rows[0]?.count ?? 0) > 0) {
      throw new CatalogDomainError('VALIDATION_FAILED', 'Required product attributes are missing.');
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
  }>`
    select id, handle, title, status, publication_status, version::text
    from catalog.products where organization_id = ${organizationId}
    order by updated_at desc, id desc
  `.execute(db);
  return result.rows.map(asProduct);
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
  readonly variants: readonly { id: string; sku: string; optionValueIds: readonly string[] }[];
  readonly details: readonly { group: string; label: string; value: string }[];
  readonly faqs: readonly { question: string; answer: string }[];
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
  const variants = await sql<{ id: string; sku: string; option_value_ids: string[] }>`
    select variant.id, variant.sku, array_agg(link.option_value_id order by link.option_value_id) as option_value_ids
    from catalog.product_variants variant join catalog.variant_option_values link on link.variant_id = variant.id
    where variant.product_id = ${row.id} and variant.status = 'ACTIVE'
    group by variant.id, variant.sku order by variant.sku
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
    })),
    details: details.rows.map((detail) => ({
      group: detail.group_title,
      label: detail.label,
      value: detail.value_text,
    })),
    faqs: faqs.rows.map((faq) => ({ question: faq.question, answer: faq.answer })),
  };
}
