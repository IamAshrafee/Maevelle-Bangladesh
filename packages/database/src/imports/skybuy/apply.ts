import { sql } from 'kysely';

import { createCatalogProduct } from '../../catalog.js';
import type { MaevelleDatabase } from '../../index.js';
import { attachMediaToProduct, registerUrlMedia } from '../../media.js';
import {
  cancelPurchase,
  createPurchase,
  createSupplier,
  placePurchase,
  type PurchaseView,
  type SupplierView,
} from '../../procurement.js';
import type { SkyBuyImportPlan, SkyBuyPlannedProduct, SkyBuyRow, SkyBuyWorkbook } from './types.js';

const SOURCE_SYSTEM = 'SKYBUYBD';
const MEDIA_TITLE_MAX_LENGTH = 160;

function mediaTitle(value: string): string {
  return value.slice(0, MEDIA_TITLE_MAX_LENGTH);
}

export interface ApplySkyBuyCatalogProcurementOptions {
  readonly organizationId: string;
  readonly actorId: string;
  readonly destinationLocationId: string;
}

export interface ApplySkyBuyCatalogProcurementResult {
  readonly batchId: string;
  readonly supplierId: string;
  readonly productsCreated: number;
  readonly productsReused: number;
  readonly purchasesCreated: number;
  readonly purchasesReused: number;
  readonly finalStatus: 'PARTIALLY_APPLIED';
}

async function findExternalTarget(
  db: MaevelleDatabase,
  input: {
    organizationId: string;
    sourceEntityType: string;
    sourceEntityId: string;
    targetEntityType: string;
  },
): Promise<string | undefined> {
  const result = await sql<{ target_entity_id: string }>`
    select target_entity_id::text
    from platform.external_entity_links
    where organization_id = ${input.organizationId}
      and source_system = ${SOURCE_SYSTEM}
      and source_entity_type = ${input.sourceEntityType}
      and source_entity_id = ${input.sourceEntityId}
      and target_entity_type = ${input.targetEntityType}
  `.execute(db);
  return result.rows[0]?.target_entity_id;
}

async function linkExternalTarget(
  db: MaevelleDatabase,
  input: {
    organizationId: string;
    batchId: string;
    sourceEntityType: string;
    sourceEntityId: string;
    targetEntityType: string;
    targetEntityId: string;
    metadata?: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await sql`
    insert into platform.external_entity_links (
      organization_id, source_system, source_entity_type, source_entity_id,
      target_entity_type, target_entity_id, import_batch_id, metadata_json
    ) values (
      ${input.organizationId}, ${SOURCE_SYSTEM}, ${input.sourceEntityType}, ${input.sourceEntityId},
      ${input.targetEntityType}, ${input.targetEntityId}::uuid, ${input.batchId}::uuid,
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    on conflict (organization_id, source_system, source_entity_type, source_entity_id)
    do update set
      target_entity_type = excluded.target_entity_type,
      target_entity_id = excluded.target_entity_id,
      import_batch_id = excluded.import_batch_id,
      metadata_json = excluded.metadata_json,
      updated_at = now()
  `.execute(db);
}

async function startBatch(
  db: MaevelleDatabase,
  plan: SkyBuyImportPlan,
  input: ApplySkyBuyCatalogProcurementOptions,
): Promise<string> {
  const result = await sql<{ id: string }>`
    insert into platform.import_batches (
      organization_id, source_system, source_kind, source_file_name, source_sha256,
      source_exported_at, status, summary_json, created_by_actor_id
    ) values (
      ${input.organizationId}, ${SOURCE_SYSTEM}, 'SKYBUY_ORDERS_XLSX', ${plan.source.fileName},
      ${plan.source.sha256}, ${plan.source.exportedAt ?? null}::timestamptz, 'APPLYING',
      ${JSON.stringify(plan.summary)}::jsonb, ${input.actorId}::uuid
    )
    on conflict (organization_id, source_system, source_sha256)
    do update set status = 'APPLYING', updated_at = now(), summary_json = excluded.summary_json
    returning id::text
  `.execute(db);
  return result.rows[0]!.id;
}

function selectedPayload(row: SkyBuyRow, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
}

async function stageRecord(
  db: MaevelleDatabase,
  input: {
    organizationId: string;
    batchId: string;
    recordType: string;
    recordId: string;
    rowNumber: number;
    status: 'STAGED' | 'IMPORTED' | 'DEFERRED';
    payload: Readonly<Record<string, unknown>>;
    issueCodes?: readonly string[];
  },
): Promise<void> {
  await sql`insert into platform.import_records (
      organization_id, import_batch_id, source_record_type, source_record_id,
      source_row_number, import_status, payload_json, issue_codes
    ) values (
      ${input.organizationId}, ${input.batchId}::uuid, ${input.recordType}, ${input.recordId},
      ${input.rowNumber}, ${input.status}, ${JSON.stringify(input.payload)}::jsonb,
      ${input.issueCodes ?? []}::text[]
    )
    on conflict (import_batch_id, source_record_type, source_record_id)
    do update set source_row_number=excluded.source_row_number, import_status=excluded.import_status,
      payload_json=excluded.payload_json, issue_codes=excluded.issue_codes, updated_at=now()`.execute(
    db,
  );
}

async function stageWorkbookEvidence(
  db: MaevelleDatabase,
  workbook: SkyBuyWorkbook,
  batchId: string,
  organizationId: string,
): Promise<void> {
  for (const [index, row] of workbook.sheets.Orders.rows.entries()) {
    await stageRecord(db, {
      organizationId,
      batchId,
      recordType: 'order',
      recordId: String(row['Order ID']),
      rowNumber: index + 2,
      status: 'STAGED',
      payload: selectedPayload(row, [
        'Order ID',
        'Order Date',
        'Current Status',
        'Delivery Method',
        'Shipping Method',
        'Advance Payment',
        'Shipping Charge / Kg',
        'Total Weight Kg',
        'Product Price',
        'Effective Order Total',
        'Effective Paid',
        'Effective Due',
        'Order URL',
        'List Image URL',
      ]),
    });
  }
  for (const [index, row] of workbook.sheets.Charges.rows.entries()) {
    await stageRecord(db, {
      organizationId,
      batchId,
      recordType: 'charge',
      recordId: `${String(row['Order ID'])}:${String(row.Key)}`,
      rowNumber: index + 2,
      status: 'DEFERRED',
      payload: selectedPayload(row, [
        'Order ID',
        'Order Date',
        'Order Status',
        'Key',
        'Kind',
        'Label',
        'Detail',
        'Percent',
        'Basis Weight Kg',
        'Rate Per Kg',
        'Sign',
        'Amount',
        'Raw Label',
        'Raw Value',
      ]),
    });
  }
  for (const [index, row] of workbook.sheets.Payments.rows.entries()) {
    await stageRecord(db, {
      organizationId,
      batchId,
      recordType: 'supplier_payment',
      recordId: `${String(row['Order ID'])}:${String(row['Payment #'])}`,
      rowNumber: index + 2,
      status: 'DEFERRED',
      payload: selectedPayload(row, [
        'Order ID',
        'Order Date',
        'Order Status',
        'Payment #',
        'Method',
        'Date',
        'Amount',
        'Trx ID',
      ]),
      issueCodes: ['SUPPLIER_PAYMENT_DOMAIN_REQUIRED'],
    });
  }
  for (const [index, row] of workbook.sheets['Shipment Videos'].rows.entries()) {
    const dateMatches = String(row['Date Matches Title']) === 'Yes';
    await stageRecord(db, {
      organizationId,
      batchId,
      recordType: 'shipment_evidence',
      recordId: `${String(row['Order ID'])}:${String(row['Video #'])}`,
      rowNumber: index + 2,
      status: 'DEFERRED',
      payload: selectedPayload(row, [
        'Order ID',
        'Video #',
        'Shipment Code',
        'Title',
        'Date',
        'Title Date',
        'Date Matches Title',
        'Thumbnail URL',
        'Video URL',
      ]),
      ...(dateMatches ? {} : { issueCodes: ['EVIDENCE_DATE_MISMATCH'] }),
    });
  }
}

async function resolveSupplier(
  db: MaevelleDatabase,
  batchId: string,
  input: ApplySkyBuyCatalogProcurementOptions,
): Promise<SupplierView> {
  const linkedId = await findExternalTarget(db, {
    organizationId: input.organizationId,
    sourceEntityType: 'supplier',
    sourceEntityId: 'SKYBUYBD',
    targetEntityType: 'procurement.supplier',
  });
  if (linkedId) {
    const existing = await sql<{
      id: string;
      code: string;
      name: string;
      status: SupplierView['status'];
      supplier_type: SupplierView['supplierType'];
      version: string;
    }>`select id::text, code, name, status, supplier_type, version::text
      from procurement.suppliers
      where organization_id=${input.organizationId} and id=${linkedId}::uuid`.execute(db);
    const row = existing.rows[0];
    if (!row) throw new Error('Linked SkyBuy supplier no longer exists.');
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      supplierType: row.supplier_type,
      version: Number(row.version),
    };
  }

  const byCode = await sql<{ id: string }>`select id::text from procurement.suppliers
    where organization_id=${input.organizationId} and code='SKYBUYBD'`.execute(db);
  const supplierId = byCode.rows[0]
    ? byCode.rows[0].id
    : (
        await createSupplier(db, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          code: 'SKYBUYBD',
          name: 'SkyBuyBD',
          supplierType: 'AGENT',
          countryCode: 'BD',
          preferredCurrencyCode: 'BDT',
          paymentTerms: '70% advance; balance and actual freight/customs on delivery',
          websiteUrl: 'https://skybuybd.com',
          notes: 'China sourcing, consolidation, customs, and door-to-door delivery intermediary.',
        })
      ).id;
  await linkExternalTarget(db, {
    organizationId: input.organizationId,
    batchId,
    sourceEntityType: 'supplier',
    sourceEntityId: 'SKYBUYBD',
    targetEntityType: 'procurement.supplier',
    targetEntityId: supplierId,
  });
  const created = await sql<{
    id: string;
    code: string;
    name: string;
    status: SupplierView['status'];
    supplier_type: SupplierView['supplierType'];
    version: string;
  }>`select id::text, code, name, status, supplier_type, version::text
    from procurement.suppliers where id=${supplierId}::uuid`.execute(db);
  const row = created.rows[0]!;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    supplierType: row.supplier_type,
    version: Number(row.version),
  };
}

async function catalogReferences(db: MaevelleDatabase, organizationId: string) {
  const [types, categories] = await Promise.all([
    sql<{
      id: string;
      code: string;
    }>`select id::text, code from catalog.product_types where organization_id=${organizationId} and status='ACTIVE'`.execute(
      db,
    ),
    sql<{
      id: string;
      handle: string;
    }>`select id::text, handle from catalog.categories where organization_id=${organizationId} and status='ACTIVE'`.execute(
      db,
    ),
  ]);
  return {
    types: new Map(types.rows.map((row) => [row.code, row.id])),
    categories: new Map(categories.rows.map((row) => [row.handle, row.id])),
  };
}

async function createProduct(
  db: MaevelleDatabase,
  batchId: string,
  product: SkyBuyPlannedProduct,
  input: ApplySkyBuyCatalogProcurementOptions,
  references: Awaited<ReturnType<typeof catalogReferences>>,
): Promise<string> {
  const productTypeId = references.types.get(product.productTypeCode);
  const primaryCategoryId = references.categories.get(product.primaryCategoryHandle);
  if (!productTypeId || !primaryCategoryId) {
    throw new Error(
      `Catalog mapping for ${product.sourceProductId} is not seeded. Missing Product Type ${product.productTypeCode} or Category ${product.primaryCategoryHandle}.`,
    );
  }
  const categoryIds = [
    primaryCategoryId,
    ...product.additionalCategoryHandles.map((handle) => {
      const categoryId = references.categories.get(handle);
      if (!categoryId) throw new Error(`Catalog Category ${handle} is not seeded.`);
      return categoryId;
    }),
  ];
  const axes = new Map<string, Set<string>>();
  for (const variant of product.variants) {
    for (const [name, value] of Object.entries(variant.attributes)) {
      const values = axes.get(name) ?? new Set<string>();
      values.add(value);
      axes.set(name, values);
    }
  }
  const created = await createCatalogProduct(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    productTypeId,
    title: product.title,
    handle: product.handle,
    description: `Imported from SkyBuy supplier listing ${product.sourceListingId}. This logical Product groups only reviewed color, size, or capacity Variants. Customer-facing content and selling price require review.`,
    primaryCategoryId,
    categoryIds: [...new Set(categoryIds)],
    options: [...axes.entries()].map(([name, values], axisIndex) => ({
      name,
      position: axisIndex,
      values: [...values].sort().map((displayValue, valueIndex) => ({
        displayValue,
        position: valueIndex,
      })),
    })),
    variants: product.variants.map((variant) => ({
      sku: variant.sku,
      title: `${product.title} - ${Object.values(variant.attributes).join(' / ')}`,
      optionSelections: Object.entries(variant.attributes).map(([axisName, valueDisplay]) => ({
        axisName,
        valueDisplay,
      })),
    })),
  });
  await linkExternalTarget(db, {
    organizationId: input.organizationId,
    batchId,
    sourceEntityType: 'product',
    sourceEntityId: product.sourceProductId,
    targetEntityType: 'catalog.product',
    targetEntityId: created.id,
    metadata: { sourceListingId: product.sourceListingId, sourceUrl: product.sourceUrl },
  });

  await syncProductEvidence(db, batchId, created.id, product, input.organizationId);
  return created.id;
}

async function syncProductEvidence(
  db: MaevelleDatabase,
  batchId: string,
  productId: string,
  product: SkyBuyPlannedProduct,
  organizationId: string,
): Promise<void> {
  const variants = await sql<{ id: string; sku: string }>`select id::text, sku
    from catalog.product_variants where organization_id=${organizationId} and product_id=${productId}::uuid`.execute(
    db,
  );
  const variantsBySku = new Map(variants.rows.map((row) => [row.sku, row.id]));
  for (const variant of product.variants) {
    const variantId = variantsBySku.get(variant.sku);
    if (!variantId)
      throw new Error(`Variant ${variant.sku} could not be resolved for imported Product.`);
    await linkExternalTarget(db, {
      organizationId,
      batchId,
      sourceEntityType: 'variant',
      sourceEntityId: variant.sku,
      targetEntityType: 'catalog.product_variant',
      targetEntityId: variantId,
      metadata: {
        sourceListingId: variant.sourceListingId,
        sourceProductId: product.sourceProductId,
        attributes: variant.attributes,
      },
    });
    if (variant.imageUrl) {
      const asset = await registerUrlMedia(db, {
        organizationId,
        url: variant.imageUrl,
        visibility: 'PUBLIC',
        title: mediaTitle(`${product.title} - ${variant.sku}`),
      });
      await attachMediaToProduct(db, {
        organizationId,
        productId,
        variantId,
        assetId: asset.id,
        role: 'GALLERY',
        isPrimary: true,
      });
    }
  }
  if (product.imageUrl) {
    const asset = await registerUrlMedia(db, {
      organizationId,
      url: product.imageUrl,
      visibility: 'PUBLIC',
      title: mediaTitle(product.title),
    });
    await attachMediaToProduct(db, {
      organizationId,
      productId,
      assetId: asset.id,
      role: 'THUMBNAIL',
      isPrimary: true,
    });
  }
}

async function resolveVariantIds(
  db: MaevelleDatabase,
  organizationId: string,
  skus: readonly string[],
): Promise<Map<string, string>> {
  const result = await sql<{ id: string; sku: string }>`select id::text, sku
    from catalog.product_variants
    where organization_id=${organizationId} and sku=any(${skus}::text[])`.execute(db);
  return new Map(result.rows.map((row) => [row.sku, row.id]));
}

export async function applySkyBuyCatalogAndProcurement(
  db: MaevelleDatabase,
  plan: SkyBuyImportPlan,
  workbook: SkyBuyWorkbook,
  input: ApplySkyBuyCatalogProcurementOptions,
): Promise<ApplySkyBuyCatalogProcurementResult> {
  const blockingErrors = plan.issues.filter((issue) => issue.severity === 'ERROR');
  if (blockingErrors.length > 0) {
    throw new Error(
      `SkyBuy plan has blocking errors: ${blockingErrors.map((issue) => issue.message).join(' ')}`,
    );
  }
  const batchId = await startBatch(db, plan, input);
  await stageWorkbookEvidence(db, workbook, batchId, input.organizationId);
  const supplier = await resolveSupplier(db, batchId, input);
  const references = await catalogReferences(db, input.organizationId);
  let productsCreated = 0;
  let productsReused = 0;
  for (const product of plan.products) {
    const linked = await findExternalTarget(db, {
      organizationId: input.organizationId,
      sourceEntityType: 'product',
      sourceEntityId: product.sourceProductId,
      targetEntityType: 'catalog.product',
    });
    if (linked) {
      await syncProductEvidence(db, batchId, linked, product, input.organizationId);
      productsReused += 1;
      continue;
    }
    const recovered = await sql<{ id: string }>`select id::text from catalog.products
      where organization_id=${input.organizationId} and handle=${product.handle}`.execute(db);
    if (recovered.rows[0]) {
      await linkExternalTarget(db, {
        organizationId: input.organizationId,
        batchId,
        sourceEntityType: 'product',
        sourceEntityId: product.sourceProductId,
        targetEntityType: 'catalog.product',
        targetEntityId: recovered.rows[0].id,
        metadata: {
          recoveredByHandle: true,
          sourceListingId: product.sourceListingId,
          sourceUrl: product.sourceUrl,
        },
      });
      await syncProductEvidence(db, batchId, recovered.rows[0].id, product, input.organizationId);
      productsReused += 1;
      continue;
    }
    await createProduct(db, batchId, product, input, references);
    productsCreated += 1;
  }

  const allSkus = [
    ...new Set(plan.purchases.flatMap((purchase) => purchase.lines.map((line) => line.sku))),
  ];
  const variantIds = await resolveVariantIds(db, input.organizationId, allSkus);
  if (variantIds.size !== allSkus.length) {
    throw new Error('One or more planned SkyBuy Variants were not found after Catalog import.');
  }

  let purchasesCreated = 0;
  let purchasesReused = 0;
  for (const purchase of plan.purchases) {
    const linked = await findExternalTarget(db, {
      organizationId: input.organizationId,
      sourceEntityType: 'order',
      sourceEntityId: purchase.orderId,
      targetEntityType: 'procurement.purchase',
    });
    if (linked) {
      purchasesReused += 1;
      continue;
    }
    const recovered = await sql<{ id: string }>`select id::text from procurement.purchases
      where organization_id=${input.organizationId} and supplier_reference=${purchase.orderId}`.execute(
      db,
    );
    if (recovered.rows[0]) {
      await linkExternalTarget(db, {
        organizationId: input.organizationId,
        batchId,
        sourceEntityType: 'order',
        sourceEntityId: purchase.orderId,
        targetEntityType: 'procurement.purchase',
        targetEntityId: recovered.rows[0].id,
        metadata: { recoveredBySupplierReference: true, sourceStatus: purchase.sourceStatus },
      });
      purchasesReused += 1;
      continue;
    }
    let created: PurchaseView = await createPurchase(db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      supplierId: supplier.id,
      currencyCode: 'BDT',
      supplierReference: purchase.orderId,
      orderDate: purchase.orderDate,
      destinationLocationId: input.destinationLocationId,
      notes: `Imported from SkyBuy. Source status: ${purchase.sourceStatus}. Source total BDT ${purchase.effectiveTotal}; paid ${purchase.paidTotal}; due ${purchase.dueTotal}. Payments and refunds remain staged evidence.`,
      lines: purchase.lines.map((line) => ({
        variantId: variantIds.get(line.sku)!,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
      idempotencyKey: `skybuy:${plan.source.sha256}:purchase:${purchase.orderId}`,
    });
    if (purchase.sourceStatus === 'Cancelled') {
      created = await cancelPurchase(db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        purchaseId: created.id,
        expectedVersion: created.version,
        reason: 'Cancelled in SkyBuy source history.',
        idempotencyKey: `skybuy:${plan.source.sha256}:cancel:${purchase.orderId}`,
      });
    } else {
      created = await placePurchase(db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        purchaseId: created.id,
        expectedVersion: created.version,
        idempotencyKey: `skybuy:${plan.source.sha256}:place:${purchase.orderId}`,
      });
    }
    await linkExternalTarget(db, {
      organizationId: input.organizationId,
      batchId,
      sourceEntityType: 'order',
      sourceEntityId: purchase.orderId,
      targetEntityType: 'procurement.purchase',
      targetEntityId: created.id,
      metadata: { sourceStatus: purchase.sourceStatus, sourceTotalBdt: purchase.effectiveTotal },
    });
    await sql`update platform.import_records set import_status='IMPORTED',
        target_entity_type='procurement.purchase', target_entity_id=${created.id}::uuid, updated_at=now()
      where organization_id=${input.organizationId} and import_batch_id=${batchId}::uuid
        and source_record_type='order' and source_record_id=${purchase.orderId}`.execute(db);
    purchasesCreated += 1;
  }

  const result: ApplySkyBuyCatalogProcurementResult = {
    batchId,
    supplierId: supplier.id,
    productsCreated,
    productsReused,
    purchasesCreated,
    purchasesReused,
    finalStatus: 'PARTIALLY_APPLIED',
  };
  await sql`update platform.import_records record set
      import_status='IMPORTED', target_entity_type=link.target_entity_type,
      target_entity_id=link.target_entity_id, updated_at=now()
    from platform.external_entity_links link
    where record.organization_id=${input.organizationId} and record.import_batch_id=${batchId}::uuid
      and record.source_record_type='order' and link.organization_id=record.organization_id
      and link.source_system=${SOURCE_SYSTEM} and link.source_entity_type='order'
      and link.source_entity_id=record.source_record_id`.execute(db);
  await sql`update platform.import_batches set
      status='PARTIALLY_APPLIED', summary_json=${JSON.stringify({ ...plan.summary, application: result })}::jsonb,
      completed_at=now(), updated_at=now()
    where organization_id=${input.organizationId} and id=${batchId}::uuid`.execute(db);
  return result;
}
