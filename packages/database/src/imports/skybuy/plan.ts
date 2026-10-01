import { createHash } from 'node:crypto';
import { basename } from 'node:path';

import { slugify } from '../../seed/helpers/slug.js';
import { resolveSkyBuyLogicalProductGroup } from './grouping.js';
import { SKYBUY_PRODUCT_MAPPINGS } from './mapping.js';
import {
  SKYBUY_REQUIRED_SHEETS,
  type SkyBuyCell,
  type SkyBuyImportPlan,
  type SkyBuyPlannedProduct,
  type SkyBuyPlannedPurchase,
  type SkyBuyPlannedShipment,
  type SkyBuyRow,
  type SkyBuyValidationIssue,
  type SkyBuyWorkbook,
} from './types.js';
import { validateSkyBuyWorkbook } from './workbook.js';

function requiredText(row: SkyBuyRow, key: string): string {
  const value = row[key];
  if (value === null || value === undefined || value === '') {
    throw new Error(`Required SkyBuy value "${key}" is missing.`);
  }
  return String(value).trim();
}

function optionalText(row: SkyBuyRow, key: string): string | undefined {
  const value = row[key];
  return value === null || value === undefined || value === '' ? undefined : String(value).trim();
}

function integerText(value: SkyBuyCell): string {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error(`Expected a whole-number SkyBuy amount, received ${String(value)}.`);
  return String(number);
}

function sumIntegerColumn(rows: readonly SkyBuyRow[], column: string): string {
  return String(rows.reduce((sum, row) => sum + BigInt(integerText(row[column] ?? null)), 0n));
}

function parseAttributes(row: SkyBuyRow): Record<string, string> {
  const raw = requiredText(row, 'All Attributes JSON');
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`SkyBuy variant attributes are not an object: ${raw}`);
  }
  const attributes: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
      throw new Error(`SkyBuy variant attribute "${rawKey}" has no usable value.`);
    }
    const key = rawKey.toLowerCase() === 'color classification' ? 'Style' : rawKey.trim();
    attributes[key] = rawValue.trim();
  }
  if (Object.keys(attributes).length === 0) attributes.Style = 'Default';
  return attributes;
}

function attributeKey(attributes: Readonly<Record<string, string>>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

function stableSku(sourceProductId: string, attributes: Readonly<Record<string, string>>): string {
  const sourceDigits = sourceProductId
    .replace(/^abb-/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(-12);
  const signature = createHash('sha256').update(attributeKey(attributes)).digest('hex').slice(0, 8);
  return `SB-${sourceDigits}-${signature}`.toUpperCase();
}

function logicalProductId(sourceListingId: string, groupKey: string): string {
  if (groupKey === 'listing') return sourceListingId;
  const suffix = createHash('sha256').update(groupKey).digest('hex').slice(0, 12);
  return `${sourceListingId}::${suffix}`;
}

function formatDateOnly(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (!match?.[1]) throw new Error(`SkyBuy date is not ISO-like: ${value}`);
  return match[1];
}

function buildProducts(workbook: SkyBuyWorkbook): {
  products: SkyBuyPlannedProduct[];
  skuByProductAndAttributes: Map<string, string>;
  logicalProductIdBySku: Map<string, string>;
  issues: SkyBuyValidationIssue[];
} {
  const productRows = workbook.sheets.Products.rows;
  const variantRows = workbook.sheets.Variants.rows;
  const productsById = new Map<string, SkyBuyRow>();
  for (const row of productRows) {
    const sourceProductId = requiredText(row, 'Product ID');
    productsById.set(sourceProductId, productsById.get(sourceProductId) ?? row);
  }

  const variantsByProduct = new Map<
    string,
    Map<string, { attributes: Record<string, string>; imageUrl?: string }>
  >();
  for (const row of variantRows) {
    const sourceProductId = requiredText(row, 'Product ID');
    const attributes = parseAttributes(row);
    const key = attributeKey(attributes);
    const variants = variantsByProduct.get(sourceProductId) ?? new Map();
    const imageUrl = optionalText(row, 'Variant Image URL');
    const existing = variants.get(key);
    variants.set(key, existing ?? { attributes, ...(imageUrl ? { imageUrl } : {}) });
    variantsByProduct.set(sourceProductId, variants);
  }

  const issues: SkyBuyValidationIssue[] = [];
  const skuByProductAndAttributes = new Map<string, string>();
  const logicalProductIdBySku = new Map<string, string>();
  const products: SkyBuyPlannedProduct[] = [];
  for (const [sourceProductId, row] of [...productsById.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const mapping = SKYBUY_PRODUCT_MAPPINGS[sourceProductId];
    if (!mapping) {
      issues.push({
        severity: 'ERROR',
        code: 'PRODUCT_MAPPING_MISSING',
        message: `No Maevelle catalog mapping exists for SkyBuy product ${sourceProductId}.`,
        sheet: 'Products',
        sourceKey: sourceProductId,
      });
      continue;
    }
    const title = requiredText(row, 'Product Name');
    const sourceSuffix = sourceProductId.replace(/^abb-/i, '').slice(-8);
    const groupedVariants = new Map<
      string,
      {
        label?: string;
        variants: Array<{
          attributes: Record<string, string>;
          imageUrl?: string;
        }>;
      }
    >();
    for (const variant of variantsByProduct.get(sourceProductId)?.values() ?? []) {
      const group = resolveSkyBuyLogicalProductGroup(sourceProductId, variant.attributes);
      const existing = groupedVariants.get(group.key) ?? { variants: [] };
      if (group.label) existing.label = group.label;
      existing.variants.push(variant);
      groupedVariants.set(group.key, existing);
    }
    const productImage = optionalText(row, 'Product Image URL');
    for (const [groupKey, group] of [...groupedVariants.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const plannedProductId = logicalProductId(sourceProductId, groupKey);
      const groupHash = createHash('sha256').update(groupKey).digest('hex').slice(0, 8);
      const logicalTitle = groupKey === 'listing' ? title : `${group.label ?? 'Style'} — ${title}`;
      const variants = group.variants
        .sort((left, right) =>
          attributeKey(left.attributes).localeCompare(attributeKey(right.attributes)),
        )
        .map((variant) => {
          const sku = stableSku(sourceProductId, variant.attributes);
          skuByProductAndAttributes.set(
            `${sourceProductId}:::${attributeKey(variant.attributes)}`,
            sku,
          );
          logicalProductIdBySku.set(sku, plannedProductId);
          return {
            sourceListingId: sourceProductId,
            sourceProductId: plannedProductId,
            sku,
            attributes: variant.attributes,
            ...(variant.imageUrl ? { imageUrl: variant.imageUrl } : {}),
          };
        });
      const representativeImage =
        variants.find((variant) => variant.imageUrl)?.imageUrl ?? productImage;
      products.push({
        sourceListingId: sourceProductId,
        sourceProductId: plannedProductId,
        sourceUrl: requiredText(row, 'Product URL'),
        title: logicalTitle,
        handle:
          groupKey === 'listing'
            ? `${slugify(title)}-${sourceSuffix}`
            : `${slugify(group.label ?? 'style')}-${sourceSuffix}-${groupHash}`,
        ...(representativeImage ? { imageUrl: representativeImage } : {}),
        productTypeCode: mapping.productTypeCode,
        primaryCategoryHandle: mapping.primaryCategoryHandle,
        additionalCategoryHandles: mapping.additionalCategoryHandles ?? [],
        variants,
      });
    }
  }

  return { products, skuByProductAndAttributes, logicalProductIdBySku, issues };
}

function buildPurchases(
  workbook: SkyBuyWorkbook,
  skuByProductAndAttributes: ReadonlyMap<string, string>,
  logicalProductIdBySku: ReadonlyMap<string, string>,
): SkyBuyPlannedPurchase[] {
  const variantsByOrder = new Map<string, SkyBuyRow[]>();
  for (const row of workbook.sheets.Variants.rows) {
    const orderId = requiredText(row, 'Order ID');
    variantsByOrder.set(orderId, [...(variantsByOrder.get(orderId) ?? []), row]);
  }
  return workbook.sheets.Orders.rows.map((order) => {
    const orderId = requiredText(order, 'Order ID');
    const sourceStatus = requiredText(
      order,
      'Current Status',
    ) as SkyBuyPlannedPurchase['sourceStatus'];
    const lines = (variantsByOrder.get(orderId) ?? [])
      .map((variant) => {
        const sourceProductId = requiredText(variant, 'Product ID');
        const attributes = parseAttributes(variant);
        const sku = skuByProductAndAttributes.get(
          `${sourceProductId}:::${attributeKey(attributes)}`,
        );
        if (!sku)
          throw new Error(
            `No planned SKU exists for ${sourceProductId} ${attributeKey(attributes)}.`,
          );
        const plannedProductId = logicalProductIdBySku.get(sku);
        if (!plannedProductId) throw new Error(`No logical Product exists for planned SKU ${sku}.`);
        return {
          sourceListingId: sourceProductId,
          sourceProductId: plannedProductId,
          sku,
          attributes,
          quantity: integerText(variant.Quantity ?? null),
          unitPrice: integerText(variant['Unit Price'] ?? null),
          lineTotal: integerText(variant['Line Total'] ?? null),
        };
      })
      .filter((line) => line.quantity !== '0');
    const targetStatus: SkyBuyPlannedPurchase['targetStatus'] =
      sourceStatus === 'Cancelled' ? 'CANCELLED' : 'PLACED';
    return {
      orderId,
      orderDate: formatDateOnly(requiredText(order, 'Order Date')),
      sourceStatus,
      targetStatus,
      productPrice: integerText(order['Product Price'] ?? null),
      effectiveTotal: integerText(order['Effective Order Total'] ?? null),
      paidTotal: integerText(order['Effective Paid'] ?? null),
      dueTotal: integerText(order['Effective Due'] ?? null),
      lines,
    };
  });
}

function buildShipments(workbook: SkyBuyWorkbook): SkyBuyPlannedShipment[] {
  const grouped = new Map<
    string,
    { orderIds: Set<string>; dates: Set<string>; thumbnails: Set<string> }
  >();
  for (const row of workbook.sheets['Shipment Videos'].rows) {
    const shipmentCode = requiredText(row, 'Shipment Code');
    const group = grouped.get(shipmentCode) ?? {
      orderIds: new Set<string>(),
      dates: new Set<string>(),
      thumbnails: new Set<string>(),
    };
    group.orderIds.add(requiredText(row, 'Order ID'));
    group.dates.add(formatDateOnly(requiredText(row, 'Title Date')));
    const thumbnail = optionalText(row, 'Thumbnail URL');
    if (thumbnail) group.thumbnails.add(thumbnail);
    grouped.set(shipmentCode, group);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([shipmentCode, group]) => ({
      shipmentCode,
      orderIds: [...group.orderIds].sort(),
      transportMode: shipmentCode.includes('-S-') ? 'SEA' : 'AIR',
      evidenceDates: [...group.dates].sort(),
      thumbnailUrls: [...group.thumbnails].sort(),
    }));
}

export function createSkyBuyImportPlan(workbook: SkyBuyWorkbook): SkyBuyImportPlan {
  const workbookIssues = validateSkyBuyWorkbook(workbook);
  const {
    products,
    skuByProductAndAttributes,
    logicalProductIdBySku,
    issues: mappingIssues,
  } = buildProducts(workbook);
  const purchases = buildPurchases(workbook, skuByProductAndAttributes, logicalProductIdBySku);
  const shipments = buildShipments(workbook);
  const zeroQuantityRows = workbook.sheets.Variants.rows.filter(
    (row) => integerText(row.Quantity ?? null) === '0',
  );
  const zeroQuantityIssues: SkyBuyValidationIssue[] =
    zeroQuantityRows.length > 0
      ? [
          {
            severity: 'WARNING',
            code: 'ZERO_QUANTITY_LINES_OMITTED',
            message: `${zeroQuantityRows.length} zero-quantity source line was retained as Catalog evidence but omitted from Procurement purchase lines.`,
            sheet: 'Variants',
          },
        ]
      : [];
  const issues: SkyBuyValidationIssue[] = [
    ...workbookIssues,
    ...mappingIssues,
    ...zeroQuantityIssues,
    {
      severity: 'WARNING',
      code: 'SELLING_PRICES_REQUIRED',
      message:
        'SkyBuy contains acquisition prices, not Maevelle retail selling prices. Imported catalog products must remain draft and unpriced.',
    },
    {
      severity: 'WARNING',
      code: 'OPENING_STOCK_REQUIRED',
      message:
        'Historical purchased quantity is not current on-hand stock. Receipts must not post to inventory until a current stock count is mapped by SKU and warehouse.',
    },
    {
      severity: 'WARNING',
      code: 'SUPPLIER_PAYMENT_MODEL_REQUIRED',
      message:
        'SkyBuy payments reconcile, but the implemented Procurement domain does not yet have supplier-payment and refund commands. Payment rows remain staged evidence.',
    },
    {
      severity: 'WARNING',
      code: 'SOURCE_VARIANT_SKU_UNAVAILABLE',
      message:
        'The workbook does not export SkyBuy item SKU values. The plan creates deterministic Maevelle SKUs from source product identity and option attributes.',
    },
  ];
  const orders = workbook.sheets.Orders.rows;
  const variants = workbook.sheets.Variants.rows;
  const charges = workbook.sheets.Charges.rows;
  const completedIds = new Set(
    orders
      .filter((row) => requiredText(row, 'Current Status') === 'Completed')
      .map((row) => requiredText(row, 'Order ID')),
  );
  const runInfo = new Map(
    workbook.sheets['Run Info'].rows.map((row) => [
      requiredText(row, 'Key'),
      requiredText(row, 'Value'),
    ]),
  );
  const exportedAt = runInfo.get('Exported At');
  const workbookStatus = runInfo.get('Status');
  const discounts = charges.filter((row) => requiredText(row, 'Kind') === 'discount');
  const fees = charges.filter((row) => requiredText(row, 'Kind') === 'fee');
  const result: SkyBuyImportPlan = {
    source: {
      fileName: basename(workbook.sourcePath),
      sha256: workbook.sourceSha256,
      ...(exportedAt ? { exportedAt } : {}),
      ...(workbookStatus ? { workbookStatus } : {}),
      nonEmptyCellCount: workbook.nonEmptyCellCount,
      rowCounts: Object.fromEntries(
        SKYBUY_REQUIRED_SHEETS.map((name) => [name, workbook.sheets[name].rows.length]),
      ) as Record<(typeof SKYBUY_REQUIRED_SHEETS)[number], number>,
    },
    summary: {
      orders: orders.length,
      completedOrders: orders.filter((row) => requiredText(row, 'Current Status') === 'Completed')
        .length,
      refundedOrders: orders.filter((row) => requiredText(row, 'Current Status') === 'Refunded')
        .length,
      cancelledOrders: orders.filter((row) => requiredText(row, 'Current Status') === 'Cancelled')
        .length,
      products: products.length,
      variants: products.reduce((sum, product) => sum + product.variants.length, 0),
      purchasedUnits: sumIntegerColumn(variants, 'Quantity'),
      completedUnits: sumIntegerColumn(
        variants.filter((row) => completedIds.has(requiredText(row, 'Order ID'))),
        'Quantity',
      ),
      listedOrderValueBdt: sumIntegerColumn(orders, 'Effective Order Total'),
      nonCancelledOrderValueBdt: sumIntegerColumn(
        orders.filter((row) => requiredText(row, 'Current Status') !== 'Cancelled'),
        'Effective Order Total',
      ),
      paidValueBdt: sumIntegerColumn(orders, 'Effective Paid'),
      productValueBdt: sumIntegerColumn(orders, 'Product Price'),
      discountValueBdt: sumIntegerColumn(discounts, 'Amount'),
      acquisitionFeeValueBdt: sumIntegerColumn(fees, 'Amount'),
    },
    readiness: {
      catalog: 'READY_AS_DRAFT',
      procurement: 'READY',
      inboundShipments: 'EVIDENCE_STAGED_PENDING_TIMELINE',
      landedCost: 'BLOCKED_BY_RECEIVING',
      supplierPayments: 'BLOCKED_BY_DOMAIN_GAP',
      receivingAndInventory: 'BLOCKED_BY_OPENING_STOCK',
      storefrontPublication: 'BLOCKED_BY_SELLING_PRICES',
    },
    products,
    purchases,
    shipments,
    issues,
  };
  if (mappingIssues.some((issue) => issue.severity === 'ERROR')) {
    throw new Error(mappingIssues.map((issue) => issue.message).join(' '));
  }
  return result;
}
