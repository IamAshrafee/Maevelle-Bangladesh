import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import ExcelJS, { type CellValue, type Worksheet } from 'exceljs';

import {
  SKYBUY_REQUIRED_SHEETS,
  type SkyBuyCell,
  type SkyBuyRow,
  type SkyBuySheet,
  type SkyBuySheetName,
  type SkyBuyValidationIssue,
  type SkyBuyWorkbook,
} from './types.js';

const EXPECTED_HEADERS: Readonly<Record<SkyBuySheetName, readonly string[]>> = {
  Summary: ['Category', 'Metric', 'Value', 'Unit'],
  Orders: [
    'Order ID',
    'Order Date',
    'Detail State',
    'Current Status',
    'Detail Status',
    'List Status',
    'Status Match',
    'Customer Name',
    'Phone',
    'Email',
    'Delivery Address',
    'Delivery Method',
    'Shipping Method',
    'Advance Payment',
    'Shipping Charge',
    'Shipping Charge / Kg',
    'Total Weight',
    'Total Weight Kg',
    'Delivered Weight',
    'Delivered Weight Kg',
    'Product Price',
    'Detail Order Total',
    'List Order Total',
    'Effective Order Total',
    'Detail Paid',
    'List Paid',
    'Effective Paid',
    'Detail Due',
    'List Due',
    'Effective Due',
    'Product Count',
    'Variant Count',
    'Payment Count',
    'Timeline Steps',
    'Shipment Videos',
    'My Note',
    'Chat URL',
    'Order URL',
    'List Image URL',
    'Page Title',
    'Scraped At',
  ],
  'Order Items': [
    'Order ID',
    'Order Date',
    'Order Status',
    'Product ID',
    'Product Name',
    'Variant',
    'Color',
    'Size',
    'Capacity',
    'Quantity',
    'Unit Price',
    'Line Total',
    'Product URL',
    'Variant Image URL',
  ],
  Products: [
    'Order ID',
    'Order Date',
    'Order Status',
    'Product #',
    'Product ID',
    'Product Name',
    'Total Quantity',
    'Variant Quantity Sum',
    'Quantity Match',
    'Variant Count',
    'Product URL',
    'Product Image URL',
  ],
  Variants: [
    'Order ID',
    'Order Date',
    'Order Status',
    'Product #',
    'Product ID',
    'Product Name',
    'Variant #',
    'Variant',
    'Color',
    'Size',
    'Capacity',
    'Other Attributes JSON',
    'All Attributes JSON',
    'Quantity',
    'Unit Price',
    'Line Total',
    'Variant Image URL',
    'Product URL',
  ],
  Charges: [
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
  ],
  Payments: [
    'Order ID',
    'Order Date',
    'Order Status',
    'Payment #',
    'Method',
    'Date',
    'Amount',
    'Trx ID',
    'All Payment Fields JSON',
  ],
  Timeline: ['No Data'],
  'Shipment Videos': [
    'Order ID',
    'Video #',
    'Shipment Code',
    'Title',
    'Date',
    'Title Date',
    'Date Matches Title',
    'Thumbnail URL',
    'Video URL',
  ],
  'Data Quality': [
    'Order ID',
    'Detail State',
    'Attempts',
    'Order Detail Fields',
    'Products',
    'Variants',
    'Charges',
    'Payments',
    'Timeline Steps',
    'Videos',
    'List Status',
    'Detail Status',
    'Status Match',
    'List Total',
    'Detail Total',
    'Total Match',
    'List Paid',
    'Detail Paid',
    'Paid Match',
    'Payment Sum',
    'Payment Sum vs Paid',
    'List Due',
    'Detail Due',
    'Due Match',
    'Product Qty Mismatches',
    'Issue Count',
    'Issues',
    'Order URL',
  ],
  'Extra Fields': ['Order ID', 'Section', 'Field', 'Value'],
  Errors: ['No Data'],
  'Run Info': ['Key', 'Value'],
};

function formatDate(value: Date): string {
  const pad = (part: number, length = 2) => String(part).padStart(length, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function normalizeCellValue(value: CellValue): SkyBuyCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return formatDate(value);
  if ('result' in value && value.result !== undefined) return normalizeCellValue(value.result);
  if ('text' in value && typeof value.text === 'string') return value.text;
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('error' in value) return value.error;
  throw new Error(`Unsupported SkyBuy workbook cell value: ${JSON.stringify(value)}`);
}

function readSheet(worksheet: Worksheet, name: SkyBuySheetName): SkyBuySheet {
  const expectedHeaders = EXPECTED_HEADERS[name];
  const headerRow = worksheet.getRow(1);
  const headers = expectedHeaders.map((_, index) =>
    String(normalizeCellValue(headerRow.getCell(index + 1).value) ?? ''),
  );
  if (
    headers.length !== expectedHeaders.length ||
    headers.some((header, index) => header !== expectedHeaders[index])
  ) {
    throw new Error(
      `SkyBuy sheet "${name}" headers changed. Expected ${JSON.stringify(expectedHeaders)}, received ${JSON.stringify(headers)}.`,
    );
  }

  const rows: SkyBuyRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = headers.map((_, index) => normalizeCellValue(row.getCell(index + 1).value));
    if (values.every((value) => value === null || value === '')) continue;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? null])));
  }
  return { name, headers, rows };
}

function text(row: SkyBuyRow, key: string): string {
  const value = row[key];
  if (value === null || value === undefined || value === '') {
    throw new Error(`Required SkyBuy value "${key}" is missing.`);
  }
  return String(value);
}

function decimal(row: SkyBuyRow, key: string): number {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`SkyBuy value "${key}" is not numeric.`);
  return value;
}

export function validateSkyBuyWorkbook(workbook: SkyBuyWorkbook): SkyBuyValidationIssue[] {
  const issues: SkyBuyValidationIssue[] = [];
  const orders = workbook.sheets.Orders.rows;
  const items = workbook.sheets['Order Items'].rows;
  const products = workbook.sheets.Products.rows;
  const variants = workbook.sheets.Variants.rows;
  const payments = workbook.sheets.Payments.rows;
  const dataQuality = workbook.sheets['Data Quality'].rows;
  const runInfo = new Map(
    workbook.sheets['Run Info'].rows.map((row) => [String(row.Key), String(row.Value)]),
  );

  if (runInfo.get('Status') !== 'complete') {
    issues.push({
      severity: 'ERROR',
      code: 'EXPORT_INCOMPLETE',
      message: 'SkyBuy export did not finish successfully.',
      sheet: 'Run Info',
    });
  }
  if (Number(runInfo.get('Discovered Orders')) !== orders.length) {
    issues.push({
      severity: 'ERROR',
      code: 'ORDER_COUNT_MISMATCH',
      message: 'Run Info order count does not match Orders.',
      sheet: 'Run Info',
    });
  }

  const orderIds = new Set<string>();
  const itemTotals = new Map<string, number>();
  const itemQuantities = new Map<string, number>();
  const paymentTotals = new Map<string, number>();
  for (const [index, order] of orders.entries()) {
    const orderId = text(order, 'Order ID');
    if (orderIds.has(orderId)) {
      issues.push({
        severity: 'ERROR',
        code: 'DUPLICATE_ORDER',
        message: `Order ${orderId} appears more than once.`,
        sheet: 'Orders',
        rowNumber: index + 2,
        sourceKey: orderId,
      });
    }
    orderIds.add(orderId);
    if (!['Completed', 'Refunded', 'Cancelled'].includes(text(order, 'Current Status'))) {
      issues.push({
        severity: 'ERROR',
        code: 'UNSUPPORTED_ORDER_STATUS',
        message: `Order ${orderId} has an unsupported status.`,
        sheet: 'Orders',
        rowNumber: index + 2,
        sourceKey: orderId,
      });
    }
    if (text(order, 'Status Match') !== 'Yes') {
      issues.push({
        severity: 'ERROR',
        code: 'STATUS_DISAGREEMENT',
        message: `Order ${orderId} list/detail statuses disagree.`,
        sheet: 'Orders',
        rowNumber: index + 2,
        sourceKey: orderId,
      });
    }
  }

  for (const item of items) {
    const orderId = text(item, 'Order ID');
    itemTotals.set(orderId, (itemTotals.get(orderId) ?? 0) + decimal(item, 'Line Total'));
    itemQuantities.set(orderId, (itemQuantities.get(orderId) ?? 0) + decimal(item, 'Quantity'));
  }
  for (const payment of payments) {
    const orderId = text(payment, 'Order ID');
    paymentTotals.set(orderId, (paymentTotals.get(orderId) ?? 0) + decimal(payment, 'Amount'));
  }
  for (const [index, order] of orders.entries()) {
    const orderId = text(order, 'Order ID');
    if ((itemTotals.get(orderId) ?? 0) !== decimal(order, 'Product Price')) {
      issues.push({
        severity: 'ERROR',
        code: 'ITEM_TOTAL_MISMATCH',
        message: `Order ${orderId} item totals do not reconcile to product price.`,
        sheet: 'Orders',
        rowNumber: index + 2,
        sourceKey: orderId,
      });
    }
    if (
      decimal(order, 'Effective Paid') + decimal(order, 'Effective Due') !==
      decimal(order, 'Effective Order Total')
    ) {
      issues.push({
        severity: 'ERROR',
        code: 'PAYMENT_BALANCE_MISMATCH',
        message: `Order ${orderId} paid plus due does not reconcile to total.`,
        sheet: 'Orders',
        rowNumber: index + 2,
        sourceKey: orderId,
      });
    }
    if ((paymentTotals.get(orderId) ?? 0) !== decimal(order, 'Effective Paid')) {
      issues.push({
        severity: 'ERROR',
        code: 'PAYMENT_ROWS_MISMATCH',
        message: `Order ${orderId} payment rows do not reconcile to paid total.`,
        sheet: 'Payments',
        sourceKey: orderId,
      });
    }
  }

  if (items.length !== variants.length) {
    issues.push({
      severity: 'ERROR',
      code: 'VARIANT_ROW_COUNT_MISMATCH',
      message: 'Order Items and Variants row counts differ.',
    });
  }
  if (products.length !== orders.length) {
    issues.push({
      severity: 'ERROR',
      code: 'PRODUCT_ROW_COUNT_MISMATCH',
      message: 'Products must contain one row per SkyBuy order.',
    });
  }
  for (const [index, row] of dataQuality.entries()) {
    const orderId = text(row, 'Order ID');
    if (decimal(row, 'Issue Count') !== 0 || text(row, 'Detail State') !== 'OK') {
      issues.push({
        severity: 'ERROR',
        code: 'SOURCE_DATA_QUALITY_FAILURE',
        message: `SkyBuy export reported a data-quality problem for ${orderId}.`,
        sheet: 'Data Quality',
        rowNumber: index + 2,
        sourceKey: orderId,
      });
    }
  }

  if (workbook.sheets.Timeline.rows.length === 0) {
    issues.push({
      severity: 'WARNING',
      code: 'TIMELINE_NOT_EXPORTED',
      message:
        'The workbook does not contain SkyBuy status history. Current status remains importable, but milestone timestamps require the API detail endpoint.',
      sheet: 'Timeline',
    });
  }
  for (const [index, video] of workbook.sheets['Shipment Videos'].rows.entries()) {
    if (String(video['Date Matches Title']) !== 'Yes') {
      issues.push({
        severity: 'WARNING',
        code: 'SHIPMENT_EVIDENCE_DATE_MISMATCH',
        message: `Shipment evidence for ${String(video['Order ID'])} has conflicting structured and title dates.`,
        sheet: 'Shipment Videos',
        rowNumber: index + 2,
        sourceKey: String(video['Order ID']),
      });
    }
  }
  return issues;
}

export async function readSkyBuyWorkbook(sourcePath: string): Promise<SkyBuyWorkbook> {
  const source = await readFile(sourcePath);
  const sourceSha256 = createHash('sha256').update(source).digest('hex');
  const excel = new ExcelJS.Workbook();
  await excel.xlsx.readFile(sourcePath);

  const presentNames = excel.worksheets.map((sheet) => sheet.name);
  const missing = SKYBUY_REQUIRED_SHEETS.filter((name) => !presentNames.includes(name));
  const unexpected = presentNames.filter(
    (name) => !SKYBUY_REQUIRED_SHEETS.includes(name as SkyBuySheetName),
  );
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `SkyBuy workbook tabs changed. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}.`,
    );
  }

  const sheets = Object.fromEntries(
    SKYBUY_REQUIRED_SHEETS.map((name) => {
      const worksheet = excel.getWorksheet(name);
      if (!worksheet) throw new Error(`SkyBuy sheet "${name}" was not found.`);
      return [name, readSheet(worksheet, name)];
    }),
  ) as Record<SkyBuySheetName, SkyBuySheet>;

  const logicalHash = createHash('sha256');
  let nonEmptyCellCount = 0;
  for (const name of SKYBUY_REQUIRED_SHEETS) {
    const sheet = sheets[name];
    logicalHash.update(`${name}\n${JSON.stringify(sheet.headers)}\n`);
    nonEmptyCellCount += sheet.headers.length;
    for (const row of sheet.rows) {
      logicalHash.update(`${JSON.stringify(row)}\n`);
      nonEmptyCellCount += Object.values(row).filter(
        (value) => value !== null && value !== '',
      ).length;
    }
  }

  const workbook: SkyBuyWorkbook = {
    sourcePath,
    sourceSha256,
    logicalCellSha256: logicalHash.digest('hex'),
    nonEmptyCellCount,
    sheets,
  };
  const errors = validateSkyBuyWorkbook(workbook).filter((issue) => issue.severity === 'ERROR');
  if (errors.length > 0) {
    throw new Error(
      `SkyBuy workbook failed validation (${basename(sourcePath)}): ${errors.map((issue) => `${issue.code}: ${issue.message}`).join(' ')}`,
    );
  }
  return workbook;
}
