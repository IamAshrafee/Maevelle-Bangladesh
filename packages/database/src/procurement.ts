import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from './index.js';
import {
  ensureInventoryItemForVariantInTransaction,
  receiveInboundInventoryInTransaction,
  reverseInboundInventoryInTransaction,
  moveInventoryCondition,
  type InventoryCondition,
} from './inventory.js';
import {
  createProvisionalCostLayersForInboundReceiptInTransaction,
  reverseProvisionalCostLayersForInboundReceiptInTransaction,
} from './costing.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';

type DatabaseExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

export type PurchaseStatus = 'DRAFT' | 'PLACED' | 'CANCELLED' | 'CLOSED';
export type ShipmentStatus = 'PLANNED' | 'IN_TRANSIT' | 'ARRIVED' | 'CANCELLED';
export type ReceivingStatus = 'NOT_RECEIVED' | 'PARTIALLY_RECEIVED' | 'RECEIVED';
export type InboundReceiptStatus = 'POSTED' | 'REVERSED';

export class ProcurementDomainError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'VALIDATION_FAILED'
      | 'CONFLICT'
      | 'STALE_VERSION'
      | 'INVALID_TRANSITION'
      | 'OVER_RECEIPT'
      | 'IDEMPOTENCY_CONFLICT'
      | 'PURCHASE_NOT_EDITABLE'
      | 'SUPPLIER_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'ProcurementDomainError';
  }
}

export interface SupplierView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'ARCHIVED';
  readonly supplierType:
    | 'MANUFACTURER'
    | 'WHOLESALER'
    | 'DISTRIBUTOR'
    | 'AGENT'
    | 'LOCAL_VENDOR'
    | 'OTHER';
  readonly countryCode?: string;
  readonly preferredCurrencyCode?: PurchaseView['currencyCode'];
  readonly paymentTerms?: string;
  readonly leadTimeDays?: number;
  readonly websiteUrl?: string;
  readonly notes?: string;
  readonly contactName?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly version: number;
}

export interface PurchaseView {
  readonly id: string;
  readonly purchaseNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly currencyCode: 'BDT' | 'CNY' | 'USD';
  readonly status: PurchaseStatus;
  readonly supplierReference?: string;
  readonly orderDate: string;
  readonly expectedDate?: string;
  readonly destinationLocationId?: string;
  readonly destinationLocationName?: string;
  readonly notes?: string;
  readonly createdAt: string;
  readonly placedAt?: string;
  readonly closedAt?: string;
  readonly closedByActorId?: string;
  readonly closeReason?: string;
  readonly cancelledAt?: string;
  readonly totalAmount: string;
  readonly version: number;
  readonly lines: readonly {
    id: string;
    variantId: string;
    productId: string;
    sku: string;
    productTitle: string;
    optionSummary?: string;
    quantity: string;
    unitPrice: string;
    allocatedQuantity: string;
    receivedQuantity: string;
  }[];
}

export interface ShipmentView {
  readonly id: string;
  readonly shipmentNumber: string;
  readonly receivingLocationId: string;
  readonly receivingLocationName: string;
  readonly currencyCode: 'BDT' | 'CNY' | 'USD';
  readonly transportMode: string;
  readonly originText?: string;
  readonly trackingReference?: string;
  readonly expectedArrivalDate?: string;
  readonly departedAt?: string;
  readonly arrivedAt?: string;
  readonly createdAt: string;
  readonly status: ShipmentStatus;
  readonly receivingStatus: ReceivingStatus;
  readonly version: number;
  readonly allocations: readonly {
    id: string;
    purchaseLineId: string;
    purchaseId: string;
    purchaseNumber: string;
    supplierName: string;
    variantId: string;
    productId: string;
    sku: string;
    productTitle: string;
    allocatedQuantity: string;
    receivedQuantity: string;
    optionSummary?: string;
    unitPrice?: string;
  }[];
}

export interface InboundReceiptView {
  readonly id: string;
  readonly receiptNumber: string;
  readonly shipmentId: string;
  readonly shipmentNumber: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly inventoryTransactionId: string;
  readonly status: InboundReceiptStatus;
  readonly packingSlipReference?: string;
  readonly notes?: string;
  readonly postedAt: string;
  readonly reversedAt?: string;
  readonly reversedByActorId?: string;
  readonly reversedInventoryTransactionId?: string;
  readonly reversalReason?: string;
  readonly lines: readonly {
    id: string;
    shipmentAllocationId: string;
    variantId: string;
    productId: string;
    inventoryItemId?: string;
    sku: string;
    productTitle: string;
    condition: InventoryCondition;
    quantity: string;
  }[];
}

export interface SupplyOverviewView {
  readonly activeSuppliers: number;
  readonly draftPurchases: number;
  readonly openPurchases: number;
  readonly plannedShipments: number;
  readonly inTransitShipments: number;
  readonly awaitingReceiptShipments: number;
  readonly receiptsToday: number;
  readonly overdueShipments: number;
}

export interface ProcurementPaginationOptions {
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface SupplierListOptions extends ProcurementPaginationOptions {
  search?: string | undefined;
  status?: string | undefined;
  supplierType?: string | undefined;
  countryCode?: string | undefined;
  sortBy?: ('code' | 'name' | 'status' | 'createdAt') | undefined;
  sortOrder?: ('asc' | 'desc') | undefined;
}

export interface PurchaseListOptions extends ProcurementPaginationOptions {
  search?: string | undefined;
  status?: string | undefined;
  supplierId?: string | undefined;
  currencyCode?: PurchaseView['currencyCode'] | undefined;
  destinationLocationId?: string | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  sortBy?: ('purchaseNumber' | 'orderDate' | 'expectedDate' | 'createdAt' | 'status') | undefined;
  sortOrder?: ('asc' | 'desc') | undefined;
}

export interface ShipmentListOptions extends ProcurementPaginationOptions {
  search?: string | undefined;
  status?: string | undefined;
  receivingStatus?: string | undefined;
  purchaseId?: string | undefined;
  receivingLocationId?: string | undefined;
  transportMode?: string | undefined;
  sortBy?: ('shipmentNumber' | 'expectedArrivalDate' | 'createdAt' | 'status') | undefined;
  sortOrder?: ('asc' | 'desc') | undefined;
}

export interface InboundReceiptListOptions extends ProcurementPaginationOptions {
  search?: string | undefined;
  status?: string | undefined;
  shipmentId?: string | undefined;
  locationId?: string | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  sortBy?: ('receiptNumber' | 'postedAt' | 'createdAt') | undefined;
  sortOrder?: ('asc' | 'desc') | undefined;
}

export interface PaginatedProcurementResult<T> {
  readonly items: readonly T[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly totalPages: number;
  };
}

function parsePagination(query?: ProcurementPaginationOptions): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const page = Math.max(1, Math.trunc(query?.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(query?.pageSize ?? 20)));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

function paginateResult<T>(
  items: readonly T[],
  totalItems: number,
  page: number,
  pageSize: number,
): PaginatedProcurementResult<T> {
  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}

function parseDelimitedValues(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function fingerprint(input: unknown): string {
  return JSON.stringify(input);
}

async function nextProcurementSequenceNumber(
  db: DatabaseExecutor,
  organizationId: string,
  sequenceType: string,
  prefixBase: string,
  policy: 'YEARLY' | 'NEVER' = 'YEARLY',
): Promise<string> {
  const year = policy === 'YEARLY' ? new Date().getUTCFullYear() : null;
  const prefix = year !== null ? `${prefixBase}-${year}-` : `${prefixBase}-`;

  if (policy === 'YEARLY') {
    await sql`
      insert into platform.number_sequences (organization_id, sequence_type, prefix, counter_value, reset_policy, sequence_year, padding)
      values (${organizationId}, ${sequenceType}, ${prefix}, 0, 'YEARLY', ${year}, 6)
      on conflict (organization_id, sequence_type, sequence_year) where sequence_year is not null do nothing
    `.execute(db);
    const sequence = await sql<{ prefix: string; counter_value: string; padding: number }>`
      update platform.number_sequences set counter_value = counter_value + 1, version = version + 1, updated_at = now()
      where organization_id = ${organizationId} and sequence_type = ${sequenceType} and sequence_year = ${year}
      returning prefix, counter_value::text, padding
    `.execute(db);
    const row = sequence.rows[0];
    if (!row) {
      throw new ProcurementDomainError(
        'CONFLICT',
        `${sequenceType} number sequence was not available.`,
      );
    }
    return `${row.prefix}${row.counter_value.padStart(row.padding, '0')}`;
  } else {
    await sql`
      insert into platform.number_sequences (organization_id, sequence_type, prefix, counter_value, reset_policy, sequence_year, padding)
      values (${organizationId}, ${sequenceType}, ${prefix}, 0, 'NEVER', null, 6)
      on conflict (organization_id, sequence_type) where sequence_year is null do nothing
    `.execute(db);
    const sequence = await sql<{ prefix: string; counter_value: string; padding: number }>`
      update platform.number_sequences set counter_value = counter_value + 1, version = version + 1, updated_at = now()
      where organization_id = ${organizationId} and sequence_type = ${sequenceType} and sequence_year is null
      returning prefix, counter_value::text, padding
    `.execute(db);
    const row = sequence.rows[0];
    if (!row) {
      throw new ProcurementDomainError(
        'CONFLICT',
        `${sequenceType} number sequence was not available.`,
      );
    }
    return `${row.prefix}${row.counter_value.padStart(row.padding, '0')}`;
  }
}

function positiveQuantity(value: string, name = 'Quantity'): void {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value) || /^0(?:\.0{1,6})?$/.test(value)) {
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      `${name} must be a positive decimal with at most six places.`,
    );
  }
}

function integer(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole ?? '0') * 1_000_000n + BigInt(`${fraction}000000`.slice(0, 6));
}

async function beginIdempotent(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    operation: string;
    idempotencyKey: string;
    request: unknown;
  },
): Promise<{ replay?: unknown; recordId?: string }> {
  try {
    const record = await claimIdempotencyRecord(db, {
      organizationId: input.organizationId,
      principalType: 'USER',
      principalId: input.actorId,
      operationType: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint(input.request),
    });
    if (!record.created) {
      const existing = await sql<{ safe_response: unknown; status: string }>`
        select safe_response, status from platform.idempotency_records where id = ${record.id}
      `.execute(db);
      if (existing.rows[0]?.status === 'SUCCEEDED') {
        return { replay: existing.rows[0].safe_response };
      }
      throw new ProcurementDomainError(
        'IDEMPOTENCY_CONFLICT',
        'The same procurement command is already in progress.',
      );
    }
    return { recordId: record.id };
  } catch (error) {
    if (error instanceof IdempotencyKeyReuseError) {
      throw new ProcurementDomainError('IDEMPOTENCY_CONFLICT', error.message);
    }
    throw error;
  }
}

async function completeIdempotency(
  db: DatabaseExecutor,
  recordId: string,
  entityType: string,
  entityId: string,
  response: unknown,
): Promise<void> {
  await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = ${entityType}, result_entity_id = ${entityId}::uuid, safe_response = ${JSON.stringify(response)}::jsonb, completed_at = now() where id = ${recordId}`.execute(
    db,
  );
}

async function emit(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    action: string;
    eventType: string;
    targetType: string;
    targetId: string;
    metadata?: unknown;
  },
): Promise<void> {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata,
  });
  await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, ${input.eventType}, 1, ${input.targetType}, ${input.targetId}::uuid, 1, ${JSON.stringify({ id: input.targetId })}::jsonb, now())`.execute(
    db,
  );
}

function mapSupplier(row: {
  id: string;
  code: string;
  name: string;
  status: SupplierView['status'];
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  supplier_type: SupplierView['supplierType'];
  country_code: string | null;
  preferred_currency_code: PurchaseView['currencyCode'] | null;
  payment_terms: string | null;
  lead_time_days: number | null;
  website_url: string | null;
  notes: string | null;
  version: string;
}): SupplierView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    supplierType: row.supplier_type,
    ...(row.country_code ? { countryCode: row.country_code } : {}),
    ...(row.preferred_currency_code ? { preferredCurrencyCode: row.preferred_currency_code } : {}),
    ...(row.payment_terms ? { paymentTerms: row.payment_terms } : {}),
    ...(row.lead_time_days !== null ? { leadTimeDays: row.lead_time_days } : {}),
    ...(row.website_url ? { websiteUrl: row.website_url } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.contact_name ? { contactName: row.contact_name } : {}),
    ...(row.contact_email ? { contactEmail: row.contact_email } : {}),
    ...(row.contact_phone ? { contactPhone: row.contact_phone } : {}),
    version: Number(row.version),
  };
}

export async function createSupplier(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    code?: string;
    name: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    notes?: string;
    supplierType?: SupplierView['supplierType'];
    countryCode?: string;
    preferredCurrencyCode?: PurchaseView['currencyCode'];
    paymentTerms?: string;
    leadTimeDays?: number;
    websiteUrl?: string;
  },
): Promise<SupplierView> {
  if (!input.name.trim()) {
    throw new ProcurementDomainError('VALIDATION_FAILED', 'Supplier name is required.');
  }
  return db.transaction().execute(async (transaction) => {
    let code = input.code?.trim().toUpperCase();
    if (!code) {
      code = await nextProcurementSequenceNumber(
        transaction,
        input.organizationId,
        'SUPPLIER',
        'SUP',
        'NEVER',
      );
    }

    const result = await sql<{
      id: string;
      code: string;
      name: string;
      status: SupplierView['status'];
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      supplier_type: SupplierView['supplierType'];
      country_code: string | null;
      preferred_currency_code: PurchaseView['currencyCode'] | null;
      payment_terms: string | null;
      lead_time_days: number | null;
      website_url: string | null;
      notes: string | null;
      version: string;
    }>`insert into procurement.suppliers (
        organization_id, code, name, contact_name, contact_email, contact_phone, notes,
        supplier_type, country_code, preferred_currency_code, payment_terms, lead_time_days, website_url
      ) values (
        ${input.organizationId}, ${code}, ${input.name.trim()},
        ${input.contactName?.trim() || null}, ${input.contactEmail?.trim() || null}, ${input.contactPhone?.trim() || null},
        ${input.notes?.trim() || null}, ${input.supplierType ?? 'OTHER'},
        ${input.countryCode?.trim().toUpperCase() || null}, ${input.preferredCurrencyCode ?? null},
        ${input.paymentTerms?.trim() || null}, ${input.leadTimeDays ?? null}, ${input.websiteUrl?.trim() || null}
      ) returning id, code, name, status, contact_name, contact_email, contact_phone, supplier_type,
        country_code, preferred_currency_code, payment_terms, lead_time_days, website_url, notes, version::text`.execute(
      transaction,
    );
    const supplier = mapSupplier(result.rows[0]!);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.supplier.created',
      eventType: 'procurement.supplier.created',
      targetType: 'procurement.supplier',
      targetId: supplier.id,
      metadata: { code: supplier.code },
    });
    return supplier;
  });
}

export async function listSuppliers(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  options?: SupplierListOptions,
): Promise<PaginatedProcurementResult<SupplierView>> {
  const { page, pageSize, offset } = parsePagination(options);
  const searchPattern = options?.search?.trim() ? `%${options.search.trim()}%` : null;
  const statuses = parseDelimitedValues(options?.status);
  const supplierTypes = parseDelimitedValues(options?.supplierType);
  const countryCode = options?.countryCode?.trim().toUpperCase() || null;

  const where = sql`organization_id = ${organizationId}
    and (${searchPattern}::text is null or concat_ws(' ', code, name, contact_name, contact_email, contact_phone, notes) ilike ${searchPattern}::text)
    and (${statuses.length === 0} or status = any(${statuses}::text[]))
    and (${supplierTypes.length === 0} or supplier_type = any(${supplierTypes}::text[]))
    and (${countryCode}::text is null or country_code = ${countryCode})`;

  const sortBy = options?.sortBy ?? 'name';
  const sortAsc = (options?.sortOrder ?? 'asc') === 'asc';

  let orderClause = sql`status asc, name asc, id desc`;
  if (sortBy === 'code') {
    orderClause = sortAsc ? sql`code asc, id desc` : sql`code desc, id desc`;
  } else if (sortBy === 'name') {
    orderClause = sortAsc ? sql`name asc, id desc` : sql`name desc, id desc`;
  } else if (sortBy === 'status') {
    orderClause = sortAsc ? sql`status asc, name asc, id desc` : sql`status desc, name asc, id desc`;
  } else if (sortBy === 'createdAt') {
    orderClause = sortAsc ? sql`created_at asc, id desc` : sql`created_at desc, id desc`;
  }

  const [rowsResult, countResult] = await Promise.all([
    sql<{
      id: string;
      code: string;
      name: string;
      status: SupplierView['status'];
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      supplier_type: SupplierView['supplierType'];
      country_code: string | null;
      preferred_currency_code: PurchaseView['currencyCode'] | null;
      payment_terms: string | null;
      lead_time_days: number | null;
      website_url: string | null;
      notes: string | null;
      version: string;
    }>`select id, code, name, status, contact_name, contact_email, contact_phone, supplier_type,
        country_code, preferred_currency_code, payment_terms, lead_time_days, website_url, notes, version::text
      from procurement.suppliers
      where ${where}
      order by ${orderClause}
      limit ${pageSize} offset ${offset}`.execute(db),
    sql<{ total: string }>`select count(*)::text as total from procurement.suppliers where ${where}`.execute(db),
  ]);

  const totalItems = Number(countResult.rows[0]?.total ?? 0);
  return paginateResult(rowsResult.rows.map(mapSupplier), totalItems, page, pageSize);
}

export async function getSupplier(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; supplierId: string },
): Promise<SupplierView> {
  const suppliers = await sql<{
    id: string;
    code: string;
    name: string;
    status: SupplierView['status'];
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    supplier_type: SupplierView['supplierType'];
    country_code: string | null;
    preferred_currency_code: PurchaseView['currencyCode'] | null;
    payment_terms: string | null;
    lead_time_days: number | null;
    website_url: string | null;
    notes: string | null;
    version: string;
  }>`select id, code, name, status, contact_name, contact_email, contact_phone, supplier_type, country_code, preferred_currency_code, payment_terms, lead_time_days, website_url, notes, version::text from procurement.suppliers where organization_id = ${input.organizationId} and id = ${input.supplierId}`.execute(
    db,
  );
  if (!suppliers.rows[0]) throw new ProcurementDomainError('NOT_FOUND', 'Supplier was not found.');
  return mapSupplier(suppliers.rows[0]);
}

export async function updateSupplier(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    supplierId: string;
    expectedVersion: number;
    name?: string;
    status?: SupplierView['status'];
    supplierType?: SupplierView['supplierType'];
    countryCode?: string | null;
    preferredCurrencyCode?: PurchaseView['currencyCode'] | null;
    paymentTerms?: string | null;
    leadTimeDays?: number | null;
    websiteUrl?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    notes?: string | null;
  },
): Promise<SupplierView> {
  return db.transaction().execute(async (transaction) => {
    const result = await sql<{
      id: string;
      code: string;
      name: string;
      status: SupplierView['status'];
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      supplier_type: SupplierView['supplierType'];
      country_code: string | null;
      preferred_currency_code: PurchaseView['currencyCode'] | null;
      payment_terms: string | null;
      lead_time_days: number | null;
      website_url: string | null;
      notes: string | null;
      version: string;
    }>`
      update procurement.suppliers set
        name = coalesce(${input.name?.trim() || null}, name),
        status = coalesce(${input.status ?? null}, status),
        supplier_type = coalesce(${input.supplierType ?? null}, supplier_type),
        country_code = ${input.countryCode === undefined ? sql.ref('country_code') : input.countryCode?.trim().toUpperCase() || null},
        preferred_currency_code = ${input.preferredCurrencyCode === undefined ? sql.ref('preferred_currency_code') : input.preferredCurrencyCode},
        payment_terms = ${input.paymentTerms === undefined ? sql.ref('payment_terms') : input.paymentTerms?.trim() || null},
        lead_time_days = ${input.leadTimeDays === undefined ? sql.ref('lead_time_days') : input.leadTimeDays},
        website_url = ${input.websiteUrl === undefined ? sql.ref('website_url') : input.websiteUrl?.trim() || null},
        contact_name = ${input.contactName === undefined ? sql.ref('contact_name') : input.contactName?.trim() || null},
        contact_email = ${input.contactEmail === undefined ? sql.ref('contact_email') : input.contactEmail?.trim() || null},
        contact_phone = ${input.contactPhone === undefined ? sql.ref('contact_phone') : input.contactPhone?.trim() || null},
        notes = ${input.notes === undefined ? sql.ref('notes') : input.notes?.trim() || null},
        version = version + 1,
        updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.supplierId} and version = ${input.expectedVersion}
      returning id, code, name, status, contact_name, contact_email, contact_phone, supplier_type,
        country_code, preferred_currency_code, payment_terms, lead_time_days, website_url, notes, version::text
    `.execute(transaction);
    if (!result.rows[0]) {
      const exists = await sql<{
        id: string;
      }>`select id from procurement.suppliers where organization_id = ${input.organizationId} and id = ${input.supplierId}`.execute(
        transaction,
      );
      throw new ProcurementDomainError(
        exists.rows[0] ? 'STALE_VERSION' : 'NOT_FOUND',
        exists.rows[0] ? 'Supplier changed; reload before saving.' : 'Supplier was not found.',
      );
    }
    const view = mapSupplier(result.rows[0]);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.supplier.updated',
      eventType: 'procurement.supplier.updated',
      targetType: 'procurement.supplier',
      targetId: view.id,
      metadata: { status: view.status },
    });
    return view;
  });
}

export async function archiveSupplier(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; supplierId: string; expectedVersion: number },
): Promise<SupplierView> {
  return db.transaction().execute(async (transaction) => {
    const result = await sql<{
      id: string;
      code: string;
      name: string;
      status: SupplierView['status'];
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      supplier_type: SupplierView['supplierType'];
      country_code: string | null;
      preferred_currency_code: PurchaseView['currencyCode'] | null;
      payment_terms: string | null;
      lead_time_days: number | null;
      website_url: string | null;
      notes: string | null;
      version: string;
    }>`update procurement.suppliers set status = 'ARCHIVED', version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and id = ${input.supplierId} and version = ${input.expectedVersion} returning id, code, name, status, contact_name, contact_email, contact_phone, supplier_type, country_code, preferred_currency_code, payment_terms, lead_time_days, website_url, notes, version::text`.execute(
      transaction,
    );
    const supplier = result.rows[0];
    if (!supplier) {
      const exists = await sql<{
        id: string;
      }>`select id from procurement.suppliers where organization_id = ${input.organizationId} and id = ${input.supplierId}`.execute(
        transaction,
      );
      throw new ProcurementDomainError(
        exists.rows[0] ? 'STALE_VERSION' : 'NOT_FOUND',
        exists.rows[0] ? 'Supplier changed; reload before archiving.' : 'Supplier was not found.',
      );
    }
    const view = mapSupplier(supplier);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.supplier.archived',
      eventType: 'procurement.supplier.archived',
      targetType: 'procurement.supplier',
      targetId: view.id,
    });
    return view;
  });
}

async function getPurchaseIn(
  db: DatabaseExecutor,
  organizationId: string,
  purchaseId: string,
): Promise<PurchaseView> {
  const header = await sql<{
    id: string;
    purchase_number: string;
    supplier_id: string;
    supplier_name: string;
    currency_code: PurchaseView['currencyCode'];
    status: PurchaseStatus;
    supplier_reference: string | null;
    order_date: string;
    expected_date: string | null;
    destination_location_id: string | null;
    destination_location_name: string | null;
    notes: string | null;
    created_at: string;
    placed_at: string | null;
    closed_at: string | null;
    closed_by_actor_id: string | null;
    close_reason: string | null;
    cancelled_at: string | null;
    version: string;
  }>`select purchase.id, purchase.purchase_number, purchase.supplier_id, supplier.name as supplier_name,
      purchase.currency_code, purchase.status, purchase.supplier_reference, purchase.order_date::text,
      purchase.expected_date::text, purchase.destination_location_id, location.name as destination_location_name,
      purchase.notes, purchase.created_at::text, purchase.placed_at::text, purchase.closed_at::text,
      purchase.closed_by_actor_id, purchase.close_reason, purchase.cancelled_at::text, purchase.version::text
    from procurement.purchases purchase
    join procurement.suppliers supplier on supplier.id = purchase.supplier_id
    left join warehouse.locations location on location.id = purchase.destination_location_id
    where purchase.organization_id = ${organizationId} and purchase.id = ${purchaseId}`.execute(
    db,
  );
  const row = header.rows[0];
  if (!row) throw new ProcurementDomainError('NOT_FOUND', 'Purchase was not found.');

  const lines = await sql<{
    id: string;
    variant_id: string;
    product_id: string;
    sku_snapshot: string;
    product_title_snapshot: string;
    option_summary: string | null;
    quantity: string;
    unit_price: string;
    allocated_quantity: string;
    received_quantity: string;
  }>`select line.id, line.variant_id, variant.product_id, line.sku_snapshot, line.product_title_snapshot,
      coalesce((
        select string_agg(axis.name || ': ' || val.display_value, ' · ' order by axis.position, val.position)
        from catalog.variant_option_values link
        join catalog.product_option_axes axis on axis.id = link.option_axis_id
        join catalog.product_option_values val on val.id = link.option_value_id
        where link.variant_id = line.variant_id and link.organization_id = ${organizationId}
      ), '') as option_summary,
      line.quantity::text, line.unit_price::text,
      coalesce((
        select sum(allocation.allocated_quantity)
        from inbound_shipment.purchase_line_allocations allocation
        join inbound_shipment.shipments shipment on shipment.id = allocation.shipment_id
        where allocation.purchase_line_id = line.id and shipment.status <> 'CANCELLED'
      ), 0)::text as allocated_quantity,
      coalesce((
        select sum(receipt.quantity)
        from receiving.inbound_receipt_lines receipt
        join receiving.inbound_receipts r on r.id = receipt.inbound_receipt_id
        join inbound_shipment.purchase_line_allocations allocation on allocation.id = receipt.shipment_allocation_id
        where allocation.purchase_line_id = line.id and r.status <> 'REVERSED'
      ), 0)::text as received_quantity
    from procurement.purchase_lines line
    join catalog.product_variants variant on variant.id = line.variant_id
    where line.organization_id = ${organizationId} and line.purchase_id = ${purchaseId}
    order by line.created_at, line.id`.execute(db);

  const totals = await sql<{
    total_amount: string;
  }>`select coalesce(sum(quantity * unit_price), 0)::numeric(24,4)::text as total_amount from procurement.purchase_lines where organization_id = ${organizationId} and purchase_id = ${purchaseId}`.execute(
    db,
  );

  return {
    id: row.id,
    purchaseNumber: row.purchase_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    currencyCode: row.currency_code,
    status: row.status,
    ...(row.supplier_reference ? { supplierReference: row.supplier_reference } : {}),
    orderDate: row.order_date,
    ...(row.expected_date ? { expectedDate: row.expected_date } : {}),
    ...(row.destination_location_id ? { destinationLocationId: row.destination_location_id } : {}),
    ...(row.destination_location_name
      ? { destinationLocationName: row.destination_location_name }
      : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    createdAt: row.created_at,
    ...(row.placed_at ? { placedAt: row.placed_at } : {}),
    ...(row.closed_at ? { closedAt: row.closed_at } : {}),
    ...(row.closed_by_actor_id ? { closedByActorId: row.closed_by_actor_id } : {}),
    ...(row.close_reason ? { closeReason: row.close_reason } : {}),
    ...(row.cancelled_at ? { cancelledAt: row.cancelled_at } : {}),
    totalAmount: totals.rows[0]?.total_amount ?? '0.0000',
    version: Number(row.version),
    lines: lines.rows.map((line) => ({
      id: line.id,
      variantId: line.variant_id,
      productId: line.product_id,
      sku: line.sku_snapshot,
      productTitle: line.product_title_snapshot,
      ...(line.option_summary ? { optionSummary: line.option_summary } : {}),
      quantity: line.quantity,
      unitPrice: line.unit_price,
      allocatedQuantity: line.allocated_quantity,
      receivedQuantity: line.received_quantity,
    })),
  };
}

export async function getPurchase(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; purchaseId: string },
): Promise<PurchaseView> {
  return getPurchaseIn(db, input.organizationId, input.purchaseId);
}

export async function listPurchases(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  options?: PurchaseListOptions,
): Promise<PaginatedProcurementResult<PurchaseView>> {
  const { page, pageSize, offset } = parsePagination(options);
  const searchPattern = options?.search?.trim() ? `%${options.search.trim()}%` : null;
  const statuses = parseDelimitedValues(options?.status);
  const supplierId = options?.supplierId?.trim() || null;
  const currencyCode = options?.currencyCode?.trim() || null;
  const destinationLocationId = options?.destinationLocationId?.trim() || null;
  const fromDate = options?.fromDate?.trim() || null;
  const toDate = options?.toDate?.trim() || null;

  const where = sql`purchase.organization_id = ${organizationId}
    and (${searchPattern}::text is null or concat_ws(' ', purchase.purchase_number, purchase.supplier_reference, supplier.name, purchase.notes) ilike ${searchPattern}::text)
    and (${statuses.length === 0} or purchase.status = any(${statuses}::text[]))
    and (${supplierId}::uuid is null or purchase.supplier_id = ${supplierId}::uuid)
    and (${currencyCode}::text is null or purchase.currency_code = ${currencyCode}::text)
    and (${destinationLocationId}::uuid is null or purchase.destination_location_id = ${destinationLocationId}::uuid)
    and (${fromDate}::date is null or purchase.order_date >= ${fromDate}::date)
    and (${toDate}::date is null or purchase.order_date <= ${toDate}::date)`;

  const sortBy = options?.sortBy ?? 'createdAt';
  const sortAsc = (options?.sortOrder ?? 'desc') === 'asc';

  let orderClause = sql`purchase.created_at desc, purchase.id desc`;
  if (sortBy === 'purchaseNumber') {
    orderClause = sortAsc ? sql`purchase.purchase_number asc, purchase.id desc` : sql`purchase.purchase_number desc, purchase.id desc`;
  } else if (sortBy === 'orderDate') {
    orderClause = sortAsc ? sql`purchase.order_date asc, purchase.id desc` : sql`purchase.order_date desc, purchase.id desc`;
  } else if (sortBy === 'expectedDate') {
    orderClause = sortAsc ? sql`purchase.expected_date asc nulls last, purchase.id desc` : sql`purchase.expected_date desc nulls last, purchase.id desc`;
  } else if (sortBy === 'status') {
    orderClause = sortAsc ? sql`purchase.status asc, purchase.created_at desc` : sql`purchase.status desc, purchase.created_at desc`;
  } else if (sortBy === 'createdAt') {
    orderClause = sortAsc ? sql`purchase.created_at asc, purchase.id desc` : sql`purchase.created_at desc, purchase.id desc`;
  }

  const [idsResult, countResult] = await Promise.all([
    sql<{ id: string }>`select purchase.id
      from procurement.purchases purchase
      join procurement.suppliers supplier on supplier.id = purchase.supplier_id
      where ${where}
      order by ${orderClause}
      limit ${pageSize} offset ${offset}`.execute(db),
    sql<{ total: string }>`select count(*)::text as total
      from procurement.purchases purchase
      join procurement.suppliers supplier on supplier.id = purchase.supplier_id
      where ${where}`.execute(db),
  ]);

  const totalItems = Number(countResult.rows[0]?.total ?? 0);
  const items = await Promise.all(idsResult.rows.map((row) => getPurchaseIn(db, organizationId, row.id)));
  return paginateResult(items, totalItems, page, pageSize);
}

export async function createPurchase(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    supplierId: string;
    currencyCode: PurchaseView['currencyCode'];
    notes?: string | undefined;
    supplierReference?: string | undefined;
    orderDate?: string | undefined;
    expectedDate?: string | undefined;
    destinationLocationId?: string | undefined;
    lines?:
      | Array<{
          variantId: string;
          quantity: string;
          unitPrice: string;
        }>
      | undefined;
    idempotencyKey?: string | undefined;
  },
): Promise<PurchaseView> {
  if (input.orderDate && input.expectedDate && input.expectedDate < input.orderDate) {
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'Expected date cannot be earlier than order date.',
    );
  }

  if (input.lines && input.lines.length > 0) {
    for (const line of input.lines) {
      positiveQuantity(line.quantity);
      if (!/^\d+(?:\.\d{1,4})?$/.test(line.unitPrice)) {
        throw new ProcurementDomainError(
          'VALIDATION_FAILED',
          'Unit price must be a non-negative decimal.',
        );
      }
    }
  }

  return db.transaction().execute(async (transaction) => {
    let startedRecordId: string | undefined;
    if (input.idempotencyKey) {
      const started = await beginIdempotent(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        operation: 'procurement.purchase.create',
        idempotencyKey: input.idempotencyKey,
        request: input,
      });
      if (started.replay) return started.replay as PurchaseView;
      startedRecordId = started.recordId;
    }

    const supplier = await sql<{
      id: string;
      status: string;
    }>`select id, status from procurement.suppliers where organization_id = ${input.organizationId} and id = ${input.supplierId} for key share`.execute(
      transaction,
    );
    if (!supplier.rows[0]) {
      throw new ProcurementDomainError('NOT_FOUND', 'Supplier was not found.');
    }
    if (supplier.rows[0].status !== 'ACTIVE') {
      throw new ProcurementDomainError(
        'SUPPLIER_UNAVAILABLE',
        'Supplier is not ACTIVE and cannot accept new purchase orders.',
      );
    }

    if (input.destinationLocationId) {
      const location = await sql<{
        id: string;
      }>`select id from warehouse.locations where organization_id = ${input.organizationId} and id = ${input.destinationLocationId}::uuid and status = 'ACTIVE' for key share`.execute(
        transaction,
      );
      if (!location.rows[0]) {
        throw new ProcurementDomainError(
          'NOT_FOUND',
          'Warehouse destination location was not found or is inactive.',
        );
      }
    }

    const purchaseNumber = await nextProcurementSequenceNumber(
      transaction,
      input.organizationId,
      'PURCHASE',
      'PO',
      'YEARLY',
    );

    const created = await sql<{
      id: string;
    }>`insert into procurement.purchases (
        organization_id, purchase_number, supplier_id, currency_code, notes,
        supplier_reference, order_date, expected_date, destination_location_id, created_by_actor_id
      ) values (
        ${input.organizationId}, ${purchaseNumber}, ${input.supplierId}, ${input.currencyCode},
        ${input.notes?.trim() || null}, ${input.supplierReference?.trim() || null},
        coalesce(${input.orderDate ?? null}::date, current_date), ${input.expectedDate ?? null}::date,
        ${input.destinationLocationId ?? null}::uuid, ${input.actorId}
      ) returning id`.execute(transaction);
    const purchaseId = created.rows[0]!.id;

    if (input.lines && input.lines.length > 0) {
      for (const line of input.lines) {
        const variant = await sql<{
          sku: string;
          title: string;
        }>`select variant.sku, product.title from catalog.product_variants variant join catalog.products product on product.id = variant.product_id where variant.organization_id = ${input.organizationId} and variant.id = ${line.variantId}`.execute(
          transaction,
        );
        if (!variant.rows[0]) {
          throw new ProcurementDomainError(
            'NOT_FOUND',
            `Catalog Variant was not found: ${line.variantId}`,
          );
        }
        await sql`insert into procurement.purchase_lines (organization_id, purchase_id, variant_id, sku_snapshot, product_title_snapshot, quantity, unit_price) values (${input.organizationId}, ${purchaseId}, ${line.variantId}, ${variant.rows[0].sku}, ${variant.rows[0].title}, ${line.quantity}::numeric, ${line.unitPrice}::numeric)`.execute(
          transaction,
        );
      }
    }

    const purchase = await getPurchaseIn(transaction, input.organizationId, purchaseId);

    if (startedRecordId) {
      await completeIdempotency(
        transaction,
        startedRecordId,
        'procurement.purchase',
        purchase.id,
        purchase,
      );
    }

    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.purchase.created',
      eventType: 'procurement.purchase.created',
      targetType: 'procurement.purchase',
      targetId: purchase.id,
    });
    return purchase;
  });
}

export async function updatePurchase(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    purchaseId: string;
    expectedVersion: number;
    supplierId?: string | undefined;
    currencyCode?: PurchaseView['currencyCode'] | undefined;
    notes?: string | null | undefined;
    supplierReference?: string | null | undefined;
    orderDate?: string | undefined;
    expectedDate?: string | null | undefined;
    destinationLocationId?: string | null | undefined;
  },
): Promise<PurchaseView> {
  if (input.orderDate && input.expectedDate && input.expectedDate < input.orderDate) {
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'Expected date cannot be earlier than order date.',
    );
  }

  return db.transaction().execute(async (transaction) => {
    const current = await sql<{
      supplier_id: string;
      currency_code: PurchaseView['currencyCode'];
      status: PurchaseStatus;
      version: string;
      line_count: string;
    }>`select purchase.supplier_id, purchase.currency_code, purchase.status, purchase.version::text,
        (select count(*)::text from procurement.purchase_lines line where line.purchase_id = purchase.id) as line_count
      from procurement.purchases purchase
      where purchase.organization_id = ${input.organizationId} and purchase.id = ${input.purchaseId}
      for update`.execute(transaction);
    const purchase = current.rows[0];
    if (!purchase) throw new ProcurementDomainError('NOT_FOUND', 'Purchase was not found.');
    if (purchase.status !== 'DRAFT') {
      throw new ProcurementDomainError('PURCHASE_NOT_EDITABLE', 'Only Draft Purchases can be edited.');
    }
    if (Number(purchase.version) !== input.expectedVersion) {
      throw new ProcurementDomainError(
        'STALE_VERSION',
        'This purchase changed after it was opened. Refresh and try again.',
      );
    }
    if (
      Number(purchase.line_count) > 0 &&
      ((input.supplierId !== undefined && purchase.supplier_id !== input.supplierId) ||
        (input.currencyCode !== undefined && purchase.currency_code !== input.currencyCode))
    ) {
      throw new ProcurementDomainError(
        'VALIDATION_FAILED',
        'Remove all purchase items before changing the supplier or currency.',
      );
    }

    if (input.supplierId && input.supplierId !== purchase.supplier_id) {
      const supplier = await sql<{ id: string; status: string }>`select id, status from procurement.suppliers
        where organization_id = ${input.organizationId} and id = ${input.supplierId}
        for key share`.execute(transaction);
      if (!supplier.rows[0]) throw new ProcurementDomainError('NOT_FOUND', 'Supplier was not found.');
      if (supplier.rows[0].status !== 'ACTIVE') {
        throw new ProcurementDomainError(
          'SUPPLIER_UNAVAILABLE',
          'Supplier is not ACTIVE and cannot accept purchase orders.',
        );
      }
    }

    const updated = await sql<{ id: string }>`update procurement.purchases set
        supplier_id = coalesce(${input.supplierId ?? null}, supplier_id),
        currency_code = coalesce(${input.currencyCode ?? null}, currency_code),
        supplier_reference = case when ${input.supplierReference !== undefined} then ${input.supplierReference?.trim() || null} else supplier_reference end,
        order_date = coalesce(${input.orderDate ?? null}::date, order_date),
        expected_date = case when ${input.expectedDate !== undefined} then ${input.expectedDate || null}::date else expected_date end,
        destination_location_id = case when ${input.destinationLocationId !== undefined} then ${input.destinationLocationId || null}::uuid else destination_location_id end,
        notes = case when ${input.notes !== undefined} then ${input.notes?.trim() || null} else notes end,
        version = version + 1,
        updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.purchaseId}
      returning id`.execute(transaction);
    if (!updated.rows[0]) throw new ProcurementDomainError('NOT_FOUND', 'Purchase was not found.');

    const view = await getPurchaseIn(transaction, input.organizationId, input.purchaseId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.purchase.updated',
      eventType: 'procurement.purchase.updated',
      targetType: 'procurement.purchase',
      targetId: input.purchaseId,
    });
    return view;
  });
}

export async function addPurchaseLine(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    purchaseId: string;
    variantId: string;
    quantity: string;
    unitPrice: string;
  },
): Promise<PurchaseView> {
  positiveQuantity(input.quantity);
  if (!/^\d+(?:\.\d{1,4})?$/.test(input.unitPrice)) {
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'Unit price must be a non-negative decimal.',
    );
  }
  return db.transaction().execute(async (transaction) => {
    const purchase = await sql<{
      status: PurchaseStatus;
    }>`select status from procurement.purchases where organization_id = ${input.organizationId} and id = ${input.purchaseId} for update`.execute(
      transaction,
    );
    if (!purchase.rows[0]) throw new ProcurementDomainError('NOT_FOUND', 'Purchase was not found.');
    if (purchase.rows[0].status !== 'DRAFT') {
      throw new ProcurementDomainError('PURCHASE_NOT_EDITABLE', 'Only Draft Purchases can be edited.');
    }
    const variant = await sql<{
      sku: string;
      title: string;
    }>`select variant.sku, product.title from catalog.product_variants variant join catalog.products product on product.id = variant.product_id where variant.organization_id = ${input.organizationId} and variant.id = ${input.variantId}`.execute(
      transaction,
    );
    if (!variant.rows[0]) {
      throw new ProcurementDomainError('NOT_FOUND', 'Catalog Variant was not found.');
    }
    await sql`insert into procurement.purchase_lines (organization_id, purchase_id, variant_id, sku_snapshot, product_title_snapshot, quantity, unit_price) values (${input.organizationId}, ${input.purchaseId}, ${input.variantId}, ${variant.rows[0].sku}, ${variant.rows[0].title}, ${input.quantity}::numeric, ${input.unitPrice}::numeric)`.execute(
      transaction,
    );
    await sql`update procurement.purchases set version = version + 1, updated_at = now() where id = ${input.purchaseId}`.execute(
      transaction,
    );
    const view = await getPurchaseIn(transaction, input.organizationId, input.purchaseId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.purchase.line_added',
      eventType: 'procurement.purchase.line_added',
      targetType: 'procurement.purchase',
      targetId: input.purchaseId,
      metadata: { variantId: input.variantId, quantity: input.quantity },
    });
    return view;
  });
}

export async function updatePurchaseLine(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    purchaseId: string;
    lineId: string;
    quantity?: string | undefined;
    unitPrice?: string | undefined;
  },
): Promise<PurchaseView> {
  if (input.quantity === undefined && input.unitPrice === undefined) {
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'At least one of quantity or unitPrice must be provided.',
    );
  }
  if (input.quantity !== undefined) {
    positiveQuantity(input.quantity);
  }
  if (input.unitPrice !== undefined && !/^\d+(?:\.\d{1,4})?$/.test(input.unitPrice)) {
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'Unit price must be a non-negative decimal.',
    );
  }
  return db.transaction().execute(async (transaction) => {
    const purchase = await sql<{
      status: PurchaseStatus;
    }>`select status from procurement.purchases where organization_id = ${input.organizationId} and id = ${input.purchaseId} for update`.execute(
      transaction,
    );
    if (!purchase.rows[0]) throw new ProcurementDomainError('NOT_FOUND', 'Purchase was not found.');
    if (purchase.rows[0].status !== 'DRAFT') {
      throw new ProcurementDomainError(
        'PURCHASE_NOT_EDITABLE',
        'Only Draft Purchase lines can be edited.',
      );
    }
    const updated = await sql<{
      id: string;
    }>`update procurement.purchase_lines set
        quantity = coalesce(${input.quantity ?? null}::numeric, quantity),
        unit_price = coalesce(${input.unitPrice ?? null}::numeric, unit_price),
        version = version + 1,
        updated_at = now()
      where organization_id = ${input.organizationId} and purchase_id = ${input.purchaseId} and id = ${input.lineId}
      returning id`.execute(transaction);
    if (!updated.rows[0]) {
      throw new ProcurementDomainError('NOT_FOUND', 'Purchase Line was not found.');
    }
    await sql`update procurement.purchases set version = version + 1, updated_at = now() where id = ${input.purchaseId}`.execute(
      transaction,
    );
    const view = await getPurchaseIn(transaction, input.organizationId, input.purchaseId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.purchase.line_updated',
      eventType: 'procurement.purchase.line_updated',
      targetType: 'procurement.purchase',
      targetId: input.purchaseId,
      metadata: { lineId: input.lineId, quantity: input.quantity, unitPrice: input.unitPrice },
    });
    return view;
  });
}

export async function removePurchaseLine(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; purchaseId: string; lineId: string },
): Promise<PurchaseView> {
  return db.transaction().execute(async (transaction) => {
    const purchase = await sql<{
      status: PurchaseStatus;
    }>`select status from procurement.purchases where organization_id = ${input.organizationId} and id = ${input.purchaseId} for update`.execute(
      transaction,
    );
    if (!purchase.rows[0]) throw new ProcurementDomainError('NOT_FOUND', 'Purchase was not found.');
    if (purchase.rows[0].status !== 'DRAFT') {
      throw new ProcurementDomainError(
        'PURCHASE_NOT_EDITABLE',
        'Only Draft Purchase lines can be removed.',
      );
    }
    const removed = await sql<{
      id: string;
    }>`delete from procurement.purchase_lines where organization_id = ${input.organizationId} and purchase_id = ${input.purchaseId} and id = ${input.lineId} returning id`.execute(
      transaction,
    );
    if (!removed.rows[0]) {
      throw new ProcurementDomainError('NOT_FOUND', 'Purchase Line was not found.');
    }
    await sql`update procurement.purchases set version = version + 1, updated_at = now() where id = ${input.purchaseId}`.execute(
      transaction,
    );
    const view = await getPurchaseIn(transaction, input.organizationId, input.purchaseId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.purchase.line_removed',
      eventType: 'procurement.purchase.line_removed',
      targetType: 'procurement.purchase',
      targetId: input.purchaseId,
      metadata: { lineId: input.lineId },
    });
    return view;
  });
}

export async function placePurchase(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    purchaseId: string;
    expectedVersion: number;
    idempotencyKey?: string | undefined;
  },
): Promise<PurchaseView> {
  return db.transaction().execute(async (transaction) => {
    let startedRecordId: string | undefined;
    if (input.idempotencyKey) {
      const started = await beginIdempotent(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        operation: 'procurement.purchase.place',
        idempotencyKey: input.idempotencyKey,
        request: input,
      });
      if (started.replay) return started.replay as PurchaseView;
      startedRecordId = started.recordId;
    }

    const purchase = await sql<{
      status: PurchaseStatus;
      version: string;
    }>`select status, version::text from procurement.purchases where organization_id = ${input.organizationId} and id = ${input.purchaseId} for update`.execute(
      transaction,
    );
    if (!purchase.rows[0]) throw new ProcurementDomainError('NOT_FOUND', 'Purchase was not found.');
    if (Number(purchase.rows[0].version) !== input.expectedVersion) {
      throw new ProcurementDomainError(
        'STALE_VERSION',
        'Purchase changed; reload before placing it.',
      );
    }
    if (purchase.rows[0].status !== 'DRAFT') {
      throw new ProcurementDomainError(
        'INVALID_TRANSITION',
        'Only a Draft Purchase can be placed.',
      );
    }
    const lines = await sql<{
      count: string;
    }>`select count(*)::text as count from procurement.purchase_lines where purchase_id = ${input.purchaseId}`.execute(
      transaction,
    );
    if (Number(lines.rows[0]?.count ?? 0) === 0) {
      throw new ProcurementDomainError('VALIDATION_FAILED', 'A Purchase needs at least one line.');
    }
    await sql`update procurement.purchases set status = 'PLACED', placed_at = now(), version = version + 1, updated_at = now() where id = ${input.purchaseId}`.execute(
      transaction,
    );
    const view = await getPurchaseIn(transaction, input.organizationId, input.purchaseId);

    if (startedRecordId) {
      await completeIdempotency(
        transaction,
        startedRecordId,
        'procurement.purchase',
        input.purchaseId,
        view,
      );
    }

    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.purchase.placed',
      eventType: 'procurement.purchase.placed',
      targetType: 'procurement.purchase',
      targetId: input.purchaseId,
    });
    return view;
  });
}

export async function closePurchase(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    purchaseId: string;
    expectedVersion: number;
    reason?: string | undefined;
    idempotencyKey?: string | undefined;
  },
): Promise<PurchaseView> {
  return db.transaction().execute(async (transaction) => {
    let startedRecordId: string | undefined;
    if (input.idempotencyKey) {
      const started = await beginIdempotent(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        operation: 'procurement.purchase.close',
        idempotencyKey: input.idempotencyKey,
        request: input,
      });
      if (started.replay) return started.replay as PurchaseView;
      startedRecordId = started.recordId;
    }

    const current = await sql<{
      status: PurchaseStatus;
      version: string;
    }>`select status, version::text from procurement.purchases where organization_id = ${input.organizationId} and id = ${input.purchaseId} for update`.execute(
      transaction,
    );
    const purchase = current.rows[0];
    if (!purchase) throw new ProcurementDomainError('NOT_FOUND', 'Purchase was not found.');
    if (Number(purchase.version) !== input.expectedVersion) {
      throw new ProcurementDomainError(
        'STALE_VERSION',
        'Purchase changed; reload before closing it.',
      );
    }
    if (purchase.status === 'CLOSED') {
      throw new ProcurementDomainError('INVALID_TRANSITION', 'Purchase is already closed.');
    }
    if (purchase.status === 'CANCELLED') {
      throw new ProcurementDomainError('INVALID_TRANSITION', 'Cancelled purchase cannot be closed.');
    }
    if (purchase.status === 'DRAFT') {
      throw new ProcurementDomainError(
        'INVALID_TRANSITION',
        'Draft purchase cannot be closed; place or cancel it instead.',
      );
    }

    const inFlight = await sql<{ count: string }>`
      select count(*)::text as count
      from inbound_shipment.purchase_line_allocations allocation
      join inbound_shipment.shipments shipment on shipment.id = allocation.shipment_id
      join procurement.purchase_lines line on line.id = allocation.purchase_line_id
      where line.purchase_id = ${input.purchaseId} and shipment.status in ('PLANNED', 'IN_TRANSIT')
    `.execute(transaction);
    if (Number(inFlight.rows[0]?.count ?? 0) > 0) {
      throw new ProcurementDomainError(
        'CONFLICT',
        'Cannot close purchase while associated shipments are in PLANNED or IN_TRANSIT status.',
      );
    }

    await sql`update procurement.purchases set
      status = 'CLOSED',
      closed_at = now(),
      closed_by_actor_id = ${input.actorId},
      close_reason = ${input.reason?.trim() || null},
      version = version + 1,
      updated_at = now()
      where id = ${input.purchaseId}`.execute(transaction);

    const view = await getPurchaseIn(transaction, input.organizationId, input.purchaseId);

    if (startedRecordId) {
      await completeIdempotency(
        transaction,
        startedRecordId,
        'procurement.purchase',
        input.purchaseId,
        view,
      );
    }

    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.purchase.closed',
      eventType: 'procurement.purchase.closed',
      targetType: 'procurement.purchase',
      targetId: input.purchaseId,
      metadata: { reason: input.reason?.trim() || null },
    });

    return view;
  });
}

export async function cancelPurchase(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    purchaseId: string;
    expectedVersion: number;
    reason: string;
    idempotencyKey?: string | undefined;
  },
): Promise<PurchaseView> {
  if (!input.reason.trim()) {
    throw new ProcurementDomainError('VALIDATION_FAILED', 'A cancellation reason is required.');
  }
  return db.transaction().execute(async (transaction) => {
    let startedRecordId: string | undefined;
    if (input.idempotencyKey) {
      const started = await beginIdempotent(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        operation: 'procurement.purchase.cancel',
        idempotencyKey: input.idempotencyKey,
        request: input,
      });
      if (started.replay) return started.replay as PurchaseView;
      startedRecordId = started.recordId;
    }

    const purchase = await sql<{
      status: PurchaseStatus;
      version: string;
    }>`select status, version::text from procurement.purchases where organization_id = ${input.organizationId} and id = ${input.purchaseId} for update`.execute(
      transaction,
    );
    if (!purchase.rows[0]) throw new ProcurementDomainError('NOT_FOUND', 'Purchase was not found.');
    if (Number(purchase.rows[0].version) !== input.expectedVersion) {
      throw new ProcurementDomainError(
        'STALE_VERSION',
        'Purchase changed; reload before cancelling it.',
      );
    }
    if (purchase.rows[0].status === 'CANCELLED') {
      throw new ProcurementDomainError('INVALID_TRANSITION', 'Purchase is already cancelled.');
    }
    if (purchase.rows[0].status === 'CLOSED') {
      throw new ProcurementDomainError('INVALID_TRANSITION', 'Closed purchase cannot be cancelled.');
    }

    const activeAllocations = await sql<{
      count: string;
    }>`select count(*)::text as count
      from inbound_shipment.purchase_line_allocations allocation
      join inbound_shipment.shipments shipment on shipment.id = allocation.shipment_id
      join procurement.purchase_lines line on line.id = allocation.purchase_line_id
      where line.purchase_id = ${input.purchaseId} and shipment.status <> 'CANCELLED'`.execute(
      transaction,
    );
    if (Number(activeAllocations.rows[0]?.count ?? 0) > 0) {
      throw new ProcurementDomainError(
        'CONFLICT',
        'A Purchase allocated to an active Shipment cannot be cancelled. Cancel or resolve the Shipment first.',
      );
    }

    await sql`update procurement.purchases set
        status = 'CANCELLED',
        cancelled_at = now(),
        notes = concat_ws(E'\n', notes, ${`Cancellation: ${input.reason.trim()}`}::text),
        version = version + 1,
        updated_at = now()
      where id = ${input.purchaseId}`.execute(transaction);

    const view = await getPurchaseIn(transaction, input.organizationId, input.purchaseId);

    if (startedRecordId) {
      await completeIdempotency(
        transaction,
        startedRecordId,
        'procurement.purchase',
        input.purchaseId,
        view,
      );
    }

    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.purchase.cancelled',
      eventType: 'procurement.purchase.cancelled',
      targetType: 'procurement.purchase',
      targetId: input.purchaseId,
      metadata: { reason: input.reason.trim() },
    });
    return view;
  });
}

async function getShipmentIn(
  db: DatabaseExecutor,
  organizationId: string,
  shipmentId: string,
): Promise<ShipmentView> {
  const header = await sql<{
    id: string;
    shipment_number: string;
    receiving_location_id: string;
    receiving_location_name: string;
    currency_code: 'BDT' | 'CNY' | 'USD';
    transport_mode: string;
    origin_text: string | null;
    tracking_reference: string | null;
    expected_arrival_date: string | null;
    departed_at: string | null;
    arrived_at: string | null;
    created_at: string;
    status: ShipmentStatus;
    receiving_status: ReceivingStatus;
    version: string;
  }>`select shipment.id, shipment.shipment_number, shipment.receiving_location_id, location.name as receiving_location_name,
      min(purchase.currency_code) as currency_code, shipment.transport_mode, shipment.origin_text, shipment.tracking_reference,
      shipment.expected_arrival_date::text, shipment.departed_at::text, shipment.arrived_at::text, shipment.created_at::text,
      shipment.status, shipment.receiving_status, shipment.version::text
    from inbound_shipment.shipments shipment
    join warehouse.locations location on location.id = shipment.receiving_location_id
    join inbound_shipment.purchase_line_allocations allocation on allocation.shipment_id = shipment.id
    join procurement.purchase_lines line on line.id = allocation.purchase_line_id
    join procurement.purchases purchase on purchase.id = line.purchase_id
    where shipment.organization_id = ${organizationId} and shipment.id = ${shipmentId}
    group by shipment.id, location.name`.execute(db);
  const row = header.rows[0];
  if (!row) throw new ProcurementDomainError('NOT_FOUND', 'Inbound Shipment was not found.');

  const allocations = await sql<{
    id: string;
    purchase_line_id: string;
    purchase_id: string;
    purchase_number: string;
    supplier_name: string;
    variant_id: string;
    product_id: string;
    sku_snapshot: string;
    product_title_snapshot: string;
    allocated_quantity: string;
    received_quantity: string;
    unit_price: string;
    option_summary: string | null;
  }>`select allocation.id, allocation.purchase_line_id, purchase.id as purchase_id, purchase.purchase_number,
      supplier.name as supplier_name, allocation.variant_id, variant.product_id, allocation.sku_snapshot,
      allocation.product_title_snapshot, allocation.allocated_quantity::text,
      coalesce(sum(case when receipt.status <> 'REVERSED' then receipt_line.quantity else 0 end), 0)::text as received_quantity,
      purchase_line.unit_price::text as unit_price,
      coalesce((
        select string_agg(axis.name || ': ' || val.display_value, ' · ' order by axis.position, val.position)
        from catalog.variant_option_values link
        join catalog.product_option_axes axis on axis.id = link.option_axis_id
        join catalog.product_option_values val on val.id = link.option_value_id
        where link.variant_id = allocation.variant_id and link.organization_id = ${organizationId}
      ), '') as option_summary
    from inbound_shipment.purchase_line_allocations allocation
    join procurement.purchase_lines purchase_line on purchase_line.id = allocation.purchase_line_id
    join procurement.purchases purchase on purchase.id = purchase_line.purchase_id
    join procurement.suppliers supplier on supplier.id = purchase.supplier_id
    join catalog.product_variants variant on variant.id = allocation.variant_id
    left join receiving.inbound_receipt_lines receipt_line on receipt_line.shipment_allocation_id = allocation.id
    left join receiving.inbound_receipts receipt on receipt.id = receipt_line.inbound_receipt_id
    where allocation.organization_id = ${organizationId} and allocation.shipment_id = ${shipmentId}
    group by allocation.id, purchase.id, purchase.purchase_number, supplier.name, variant.product_id, purchase_line.unit_price
    order by allocation.created_at, allocation.id`.execute(db);

  return {
    id: row.id,
    shipmentNumber: row.shipment_number,
    receivingLocationId: row.receiving_location_id,
    receivingLocationName: row.receiving_location_name,
    currencyCode: row.currency_code,
    transportMode: row.transport_mode,
    ...(row.origin_text ? { originText: row.origin_text } : {}),
    ...(row.tracking_reference ? { trackingReference: row.tracking_reference } : {}),
    ...(row.expected_arrival_date ? { expectedArrivalDate: row.expected_arrival_date } : {}),
    ...(row.departed_at ? { departedAt: row.departed_at } : {}),
    ...(row.arrived_at ? { arrivedAt: row.arrived_at } : {}),
    createdAt: row.created_at,
    status: row.status,
    receivingStatus: row.receiving_status,
    version: Number(row.version),
    allocations: allocations.rows.map((allocation) => ({
      id: allocation.id,
      purchaseLineId: allocation.purchase_line_id,
      purchaseId: allocation.purchase_id,
      purchaseNumber: allocation.purchase_number,
      supplierName: allocation.supplier_name,
      variantId: allocation.variant_id,
      productId: allocation.product_id,
      sku: allocation.sku_snapshot,
      productTitle: allocation.product_title_snapshot,
      allocatedQuantity: allocation.allocated_quantity,
      receivedQuantity: allocation.received_quantity,
      ...(allocation.option_summary ? { optionSummary: allocation.option_summary } : {}),
      ...(allocation.unit_price ? { unitPrice: allocation.unit_price } : {}),
    })),
  };
}

export async function getShipment(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; shipmentId: string },
): Promise<ShipmentView> {
  return getShipmentIn(db, input.organizationId, input.shipmentId);
}

export async function listShipments(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  options?: ShipmentListOptions,
): Promise<PaginatedProcurementResult<ShipmentView>> {
  const { page, pageSize, offset } = parsePagination(options);
  const searchPattern = options?.search?.trim() ? `%${options.search.trim()}%` : null;
  const statuses = parseDelimitedValues(options?.status);
  const receivingStatuses = parseDelimitedValues(options?.receivingStatus);
  const purchaseId = options?.purchaseId?.trim() || null;
  const receivingLocationId = options?.receivingLocationId?.trim() || null;
  const transportMode = options?.transportMode?.trim() || null;

  const where = sql`shipment.organization_id = ${organizationId}
    and (${searchPattern}::text is null or concat_ws(' ', shipment.shipment_number, shipment.tracking_reference, shipment.origin_text) ilike ${searchPattern}::text)
    and (${statuses.length === 0} or shipment.status = any(${statuses}::text[]))
    and (${receivingStatuses.length === 0} or shipment.receiving_status = any(${receivingStatuses}::text[]))
    and (${purchaseId}::uuid is null or exists (
      select 1 from inbound_shipment.purchase_line_allocations allocation
      join procurement.purchase_lines line on line.id = allocation.purchase_line_id
      where allocation.shipment_id = shipment.id and line.purchase_id = ${purchaseId}::uuid
    ))
    and (${receivingLocationId}::uuid is null or shipment.receiving_location_id = ${receivingLocationId}::uuid)
    and (${transportMode}::text is null or shipment.transport_mode = ${transportMode}::text)`;

  const sortBy = options?.sortBy ?? 'createdAt';
  const sortAsc = (options?.sortOrder ?? 'desc') === 'asc';

  let orderClause = sql`shipment.created_at desc, shipment.id desc`;
  if (sortBy === 'shipmentNumber') {
    orderClause = sortAsc ? sql`shipment.shipment_number asc, shipment.id desc` : sql`shipment.shipment_number desc, shipment.id desc`;
  } else if (sortBy === 'expectedArrivalDate') {
    orderClause = sortAsc ? sql`shipment.expected_arrival_date asc nulls last, shipment.id desc` : sql`shipment.expected_arrival_date desc nulls last, shipment.id desc`;
  } else if (sortBy === 'status') {
    orderClause = sortAsc ? sql`shipment.status asc, shipment.created_at desc` : sql`shipment.status desc, shipment.created_at desc`;
  } else if (sortBy === 'createdAt') {
    orderClause = sortAsc ? sql`shipment.created_at asc, shipment.id desc` : sql`shipment.created_at desc, shipment.id desc`;
  }

  const [idsResult, countResult] = await Promise.all([
    sql<{ id: string }>`select shipment.id
      from inbound_shipment.shipments shipment
      where ${where}
      order by ${orderClause}
      limit ${pageSize} offset ${offset}`.execute(db),
    sql<{ total: string }>`select count(*)::text as total
      from inbound_shipment.shipments shipment
      where ${where}`.execute(db),
  ]);

  const totalItems = Number(countResult.rows[0]?.total ?? 0);
  const items = await Promise.all(idsResult.rows.map((row) => getShipmentIn(db, organizationId, row.id)));
  return paginateResult(items, totalItems, page, pageSize);
}

export async function createShipment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    receivingLocationId: string;
    transportMode: 'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER';
    originText?: string | undefined;
    trackingReference?: string | undefined;
    expectedArrivalDate?: string | undefined;
    allocations: readonly { purchaseLineId: string; quantity: string }[];
    idempotencyKey?: string | undefined;
  },
): Promise<ShipmentView> {
  if (!input.allocations.length) {
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'A Shipment needs at least one Purchase line allocation.',
    );
  }
  const unique = new Set(input.allocations.map((allocation) => allocation.purchaseLineId));
  if (unique.size !== input.allocations.length) {
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'Each Purchase line may be allocated once per Shipment.',
    );
  }
  for (const allocation of input.allocations) {
    positiveQuantity(allocation.quantity, 'Allocation quantity');
  }

  return db.transaction().execute(async (transaction) => {
    let startedRecordId: string | undefined;
    if (input.idempotencyKey) {
      const started = await beginIdempotent(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        operation: 'inbound_shipment.create',
        idempotencyKey: input.idempotencyKey,
        request: input,
      });
      if (started.replay) return started.replay as ShipmentView;
      startedRecordId = started.recordId;
    }

    const location = await sql<{
      id: string;
    }>`select location.id from warehouse.locations location join warehouse.location_capabilities capability on capability.location_id = location.id and capability.organization_id = location.organization_id where location.organization_id = ${input.organizationId} and location.id = ${input.receivingLocationId} and location.status = 'ACTIVE' and capability.capability_code = 'PURCHASE_RECEIVING'`.execute(
      transaction,
    );
    if (!location.rows[0]) {
      throw new ProcurementDomainError(
        'VALIDATION_FAILED',
        'Receiving Location must be active and have PURCHASE_RECEIVING capability.',
      );
    }

    const shipmentNumber = await nextProcurementSequenceNumber(
      transaction,
      input.organizationId,
      'SHIPMENT',
      'SHP',
      'YEARLY',
    );

    const inserted = await sql<{
      id: string;
    }>`insert into inbound_shipment.shipments (
        organization_id, shipment_number, receiving_location_id, transport_mode,
        origin_text, tracking_reference, expected_arrival_date, created_by_actor_id
      ) values (
        ${input.organizationId}, ${shipmentNumber}, ${input.receivingLocationId},
        ${input.transportMode}, ${input.originText?.trim() || null}, ${input.trackingReference?.trim() || null},
        ${input.expectedArrivalDate ?? null}::date, ${input.actorId}
      ) returning id`.execute(transaction);
    const shipmentId = inserted.rows[0]!.id;

    let shipmentCurrency: PurchaseView['currencyCode'] | undefined;
    for (const allocation of [...input.allocations].sort((left, right) =>
      left.purchaseLineId.localeCompare(right.purchaseLineId),
    )) {
      const line = await sql<{
        id: string;
        variant_id: string;
        sku_snapshot: string;
        product_title_snapshot: string;
        quantity: string;
        currency_code: PurchaseView['currencyCode'];
      }>`select line.id, line.variant_id, line.sku_snapshot, line.product_title_snapshot, line.quantity::text, purchase.currency_code
        from procurement.purchase_lines line
        join procurement.purchases purchase on purchase.id = line.purchase_id
        where line.organization_id = ${input.organizationId} and line.id = ${allocation.purchaseLineId} and purchase.status = 'PLACED'
        for update of line`.execute(transaction);
      const purchaseLine = line.rows[0];
      if (!purchaseLine) {
        throw new ProcurementDomainError(
          'NOT_FOUND',
          'Placed Purchase Line was not found in this organization.',
        );
      }
      if (shipmentCurrency && shipmentCurrency !== purchaseLine.currency_code) {
        throw new ProcurementDomainError(
          'VALIDATION_FAILED',
          'A shipment can only contain purchase lines in one currency. Create a separate shipment for the other currency.',
        );
      }
      shipmentCurrency = purchaseLine.currency_code;

      const assigned = await sql<{
        quantity: string;
      }>`select coalesce(sum(allocation.allocated_quantity), 0)::text as quantity
        from inbound_shipment.purchase_line_allocations allocation
        join inbound_shipment.shipments other_shipment on other_shipment.id = allocation.shipment_id
        where allocation.organization_id = ${input.organizationId}
          and allocation.purchase_line_id = ${allocation.purchaseLineId}
          and other_shipment.status <> 'CANCELLED'`.execute(transaction);
      if (
        integer(assigned.rows[0]?.quantity ?? '0') + integer(allocation.quantity) >
        integer(purchaseLine.quantity)
      ) {
        throw new ProcurementDomainError(
          'CONFLICT',
          'Shipment allocation exceeds the unresolved Purchase Line quantity.',
        );
      }
      await ensureInventoryItemForVariantInTransaction(
        transaction,
        input.organizationId,
        purchaseLine.variant_id,
      );
      await sql`insert into inbound_shipment.purchase_line_allocations (organization_id, shipment_id, purchase_line_id, variant_id, sku_snapshot, product_title_snapshot, allocated_quantity) values (${input.organizationId}, ${shipmentId}, ${purchaseLine.id}, ${purchaseLine.variant_id}, ${purchaseLine.sku_snapshot}, ${purchaseLine.product_title_snapshot}, ${allocation.quantity}::numeric)`.execute(
        transaction,
      );
    }
    const shipment = await getShipmentIn(transaction, input.organizationId, shipmentId);

    if (startedRecordId) {
      await completeIdempotency(
        transaction,
        startedRecordId,
        'inbound_shipment.shipment',
        shipmentId,
        shipment,
      );
    }

    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inbound_shipment.created',
      eventType: 'inbound_shipment.created',
      targetType: 'inbound_shipment.shipment',
      targetId: shipmentId,
      metadata: { allocationCount: input.allocations.length },
    });
    return shipment;
  });
}

export async function updateShipment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    shipmentId: string;
    expectedVersion: number;
    trackingReference?: string | undefined;
    expectedArrivalDate?: string | undefined;
    originText?: string | undefined;
    transportMode?: 'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER' | undefined;
  },
): Promise<ShipmentView> {
  return db.transaction().execute(async (transaction) => {
    const current = await sql<{
      status: ShipmentStatus;
      version: string;
    }>`select status, version::text from inbound_shipment.shipments where organization_id = ${input.organizationId} and id = ${input.shipmentId} for update`.execute(
      transaction,
    );
    if (!current.rows[0]) {
      throw new ProcurementDomainError('NOT_FOUND', 'Inbound Shipment was not found.');
    }
    if (Number(current.rows[0].version) !== input.expectedVersion) {
      throw new ProcurementDomainError(
        'STALE_VERSION',
        'Shipment changed; reload before updating it.',
      );
    }
    if (current.rows[0].status === 'CANCELLED') {
      throw new ProcurementDomainError(
        'INVALID_TRANSITION',
        'A cancelled shipment cannot be edited.',
      );
    }

    await sql`update inbound_shipment.shipments set
      tracking_reference = case when ${input.trackingReference !== undefined} then ${input.trackingReference?.trim() || null} else tracking_reference end,
      origin_text = case when ${input.originText !== undefined} then ${input.originText?.trim() || null} else origin_text end,
      expected_arrival_date = case when ${input.expectedArrivalDate !== undefined} then ${input.expectedArrivalDate || null}::date else expected_arrival_date end,
      transport_mode = case when ${input.transportMode !== undefined} then ${input.transportMode} else transport_mode end,
      version = version + 1,
      updated_at = now()
      where id = ${input.shipmentId} and organization_id = ${input.organizationId}`.execute(transaction);

    const view = await getShipmentIn(transaction, input.organizationId, input.shipmentId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inbound_shipment.updated',
      eventType: 'inbound_shipment.updated',
      targetType: 'inbound_shipment.shipment',
      targetId: view.id,
      metadata: {
        ...(input.trackingReference !== undefined ? { trackingReference: input.trackingReference } : {}),
        ...(input.expectedArrivalDate !== undefined ? { expectedArrivalDate: input.expectedArrivalDate } : {}),
        ...(input.originText !== undefined ? { originText: input.originText } : {}),
        ...(input.transportMode !== undefined ? { transportMode: input.transportMode } : {}),
      },
    });
    return view;
  });
}

export async function updateShipmentAllocations(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    shipmentId: string;
    expectedVersion: number;
    allocations: readonly { purchaseLineId: string; quantity: string }[];
  },
): Promise<ShipmentView> {
  if (!input.allocations.length) {
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'A Shipment needs at least one Purchase line allocation.',
    );
  }
  const unique = new Set(input.allocations.map((a) => a.purchaseLineId));
  if (unique.size !== input.allocations.length) {
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'Each Purchase line may be allocated once per Shipment.',
    );
  }
  for (const allocation of input.allocations) {
    positiveQuantity(allocation.quantity, 'Allocation quantity');
  }

  return db.transaction().execute(async (transaction) => {
    const shipmentRow = await sql<{
      id: string;
      status: ShipmentStatus;
      version: string;
    }>`select id, status, version::text from inbound_shipment.shipments where organization_id = ${input.organizationId} and id = ${input.shipmentId} for update`.execute(transaction);
    const shipment = shipmentRow.rows[0];
    if (!shipment) throw new ProcurementDomainError('NOT_FOUND', 'Inbound Shipment was not found.');
    if (Number(shipment.version) !== input.expectedVersion) {
      throw new ProcurementDomainError(
        'STALE_VERSION',
        'Shipment changed; reload before updating allocations.',
      );
    }
    if (shipment.status !== 'PLANNED') {
      throw new ProcurementDomainError(
        'INVALID_TRANSITION',
        'Only a Planned Shipment can have its allocations modified.',
      );
    }

    let shipmentCurrency: PurchaseView['currencyCode'] | undefined;

    // Delete existing allocations for this shipment so available quantity calculation is clean
    await sql`delete from inbound_shipment.purchase_line_allocations where organization_id = ${input.organizationId} and shipment_id = ${input.shipmentId}`.execute(transaction);

    for (const allocation of [...input.allocations].sort((left, right) =>
      left.purchaseLineId.localeCompare(right.purchaseLineId),
    )) {
      const line = await sql<{
        id: string;
        variant_id: string;
        sku_snapshot: string;
        product_title_snapshot: string;
        quantity: string;
        currency_code: PurchaseView['currencyCode'];
      }>`select line.id, line.variant_id, line.sku_snapshot, line.product_title_snapshot, line.quantity::text, purchase.currency_code
        from procurement.purchase_lines line
        join procurement.purchases purchase on purchase.id = line.purchase_id
        where line.organization_id = ${input.organizationId} and line.id = ${allocation.purchaseLineId} and purchase.status = 'PLACED'
        for update of line`.execute(transaction);
      const purchaseLine = line.rows[0];
      if (!purchaseLine) {
        throw new ProcurementDomainError(
          'NOT_FOUND',
          'Placed Purchase Line was not found in this organization.',
        );
      }
      if (shipmentCurrency && shipmentCurrency !== purchaseLine.currency_code) {
        throw new ProcurementDomainError(
          'VALIDATION_FAILED',
          'A shipment can only contain purchase lines in one currency. Create a separate shipment for the other currency.',
        );
      }
      shipmentCurrency = purchaseLine.currency_code;

      const assigned = await sql<{ quantity: string }>`
        select coalesce(sum(allocation.allocated_quantity), 0)::text as quantity
        from inbound_shipment.purchase_line_allocations allocation
        join inbound_shipment.shipments other_shipment on other_shipment.id = allocation.shipment_id
        where allocation.organization_id = ${input.organizationId}
          and allocation.purchase_line_id = ${allocation.purchaseLineId}
          and other_shipment.status <> 'CANCELLED'
      `.execute(transaction);

      if (integer(assigned.rows[0]?.quantity ?? '0') + integer(allocation.quantity) > integer(purchaseLine.quantity)) {
        throw new ProcurementDomainError(
          'CONFLICT',
          'Shipment allocation exceeds the unresolved Purchase Line quantity.',
        );
      }

      await ensureInventoryItemForVariantInTransaction(transaction, input.organizationId, purchaseLine.variant_id);
      await sql`insert into inbound_shipment.purchase_line_allocations (
        organization_id, shipment_id, purchase_line_id, variant_id, sku_snapshot, product_title_snapshot, allocated_quantity
      ) values (
        ${input.organizationId}, ${input.shipmentId}, ${purchaseLine.id}, ${purchaseLine.variant_id},
        ${purchaseLine.sku_snapshot}, ${purchaseLine.product_title_snapshot}, ${allocation.quantity}::numeric
      )`.execute(transaction);
    }

    await sql`update inbound_shipment.shipments set version = version + 1, updated_at = now() where id = ${input.shipmentId}`.execute(transaction);
    const view = await getShipmentIn(transaction, input.organizationId, input.shipmentId);

    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inbound_shipment.allocations_updated',
      eventType: 'inbound_shipment.allocations_updated',
      targetType: 'inbound_shipment.shipment',
      targetId: input.shipmentId,
      metadata: { allocationCount: input.allocations.length },
    });

    return view;
  });
}

export async function markShipmentInTransit(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    shipmentId: string;
    expectedVersion: number;
    idempotencyKey: string;
  },
): Promise<ShipmentView> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'inbound-shipment.depart',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay) return started.replay as ShipmentView;
    const current = await sql<{
      status: ShipmentStatus;
      version: string;
    }>`select status, version::text from inbound_shipment.shipments where organization_id = ${input.organizationId} and id = ${input.shipmentId} for update`.execute(
      transaction,
    );
    if (!current.rows[0]) {
      throw new ProcurementDomainError('NOT_FOUND', 'Inbound Shipment was not found.');
    }
    if (Number(current.rows[0].version) !== input.expectedVersion) {
      throw new ProcurementDomainError(
        'STALE_VERSION',
        'Shipment changed; reload before recording departure.',
      );
    }
    if (current.rows[0].status !== 'PLANNED') {
      throw new ProcurementDomainError('INVALID_TRANSITION', 'Only a Planned Shipment can depart.');
    }
    await sql`update inbound_shipment.shipments set status = 'IN_TRANSIT', departed_at = now(), version = version + 1, updated_at = now() where id = ${input.shipmentId}`.execute(
      transaction,
    );
    const view = await getShipmentIn(transaction, input.organizationId, input.shipmentId);
    await completeIdempotency(
      transaction,
      started.recordId!,
      'inbound_shipment.shipment',
      view.id,
      view,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inbound_shipment.departed',
      eventType: 'inbound_shipment.departed',
      targetType: 'inbound_shipment.shipment',
      targetId: view.id,
    });
    return view;
  });
}

export async function cancelShipment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    shipmentId: string;
    expectedVersion: number;
    reason: string;
    idempotencyKey?: string | undefined;
  },
): Promise<ShipmentView> {
  if (!input.reason.trim()) {
    throw new ProcurementDomainError('VALIDATION_FAILED', 'A cancellation reason is required.');
  }
  return db.transaction().execute(async (transaction) => {
    let startedRecordId: string | undefined;
    if (input.idempotencyKey) {
      const started = await beginIdempotent(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        operation: 'inbound_shipment.cancel',
        idempotencyKey: input.idempotencyKey,
        request: input,
      });
      if (started.replay) return started.replay as ShipmentView;
      startedRecordId = started.recordId;
    }

    const current = await sql<{
      status: ShipmentStatus;
      version: string;
    }>`select status, version::text from inbound_shipment.shipments where organization_id = ${input.organizationId} and id = ${input.shipmentId} for update`.execute(
      transaction,
    );
    if (!current.rows[0]) {
      throw new ProcurementDomainError('NOT_FOUND', 'Inbound Shipment was not found.');
    }
    if (Number(current.rows[0].version) !== input.expectedVersion) {
      throw new ProcurementDomainError(
        'STALE_VERSION',
        'Shipment changed; reload before cancelling it.',
      );
    }
    if (current.rows[0].status !== 'PLANNED') {
      throw new ProcurementDomainError(
        'INVALID_TRANSITION',
        'Only a Planned Shipment can be cancelled. In-transit goods need an exception workflow.',
      );
    }
    await sql`update inbound_shipment.shipments set status = 'CANCELLED', version = version + 1, updated_at = now() where id = ${input.shipmentId}`.execute(
      transaction,
    );
    const view = await getShipmentIn(transaction, input.organizationId, input.shipmentId);

    if (startedRecordId) {
      await completeIdempotency(
        transaction,
        startedRecordId,
        'inbound_shipment.shipment',
        input.shipmentId,
        view,
      );
    }

    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inbound_shipment.cancelled',
      eventType: 'inbound_shipment.cancelled',
      targetType: 'inbound_shipment.shipment',
      targetId: view.id,
      metadata: { reason: input.reason.trim() },
    });
    return view;
  });
}

export async function markShipmentArrived(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    shipmentId: string;
    expectedVersion: number;
    idempotencyKey: string;
  },
): Promise<ShipmentView> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'inbound-shipment.arrive',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay) return started.replay as ShipmentView;
    const result = await sql<{
      id: string;
      status: ShipmentStatus;
      version: string;
    }>`select id, status, version::text from inbound_shipment.shipments where organization_id = ${input.organizationId} and id = ${input.shipmentId} for update`.execute(
      transaction,
    );
    const shipment = result.rows[0];
    if (!shipment) throw new ProcurementDomainError('NOT_FOUND', 'Inbound Shipment was not found.');
    if (Number(shipment.version) !== input.expectedVersion) {
      throw new ProcurementDomainError(
        'STALE_VERSION',
        'Shipment changed; reload before marking arrival.',
      );
    }
    if (!['PLANNED', 'IN_TRANSIT'].includes(shipment.status)) {
      throw new ProcurementDomainError(
        'INVALID_TRANSITION',
        'Only planned or in-transit Shipments can arrive.',
      );
    }
    await sql`update inbound_shipment.shipments set status = 'ARRIVED', arrived_at = now(), version = version + 1, updated_at = now() where id = ${input.shipmentId}`.execute(
      transaction,
    );
    const view = await getShipmentIn(transaction, input.organizationId, input.shipmentId);
    await completeIdempotency(
      transaction,
      started.recordId!,
      'inbound_shipment.shipment',
      view.id,
      view,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inbound_shipment.arrived',
      eventType: 'inbound_shipment.arrived',
      targetType: 'inbound_shipment.shipment',
      targetId: view.id,
    });
    return view;
  });
}

async function getReceiptIn(
  db: DatabaseExecutor,
  organizationId: string,
  receiptId: string,
): Promise<InboundReceiptView> {
  const header = await sql<{
    id: string;
    receipt_number: string;
    shipment_id: string;
    shipment_number: string;
    receiving_location_id: string;
    location_name: string;
    posted_inventory_transaction_id: string;
    status: InboundReceiptStatus;
    packing_slip_reference: string | null;
    notes: string | null;
    posted_at: string;
    reversed_at: string | null;
    reversed_by_actor_id: string | null;
    reversed_inventory_transaction_id: string | null;
    reversal_reason: string | null;
  }>`select receipt.id, receipt.receipt_number, receipt.shipment_id, shipment.shipment_number,
      receipt.receiving_location_id, location.name as location_name, receipt.posted_inventory_transaction_id,
      receipt.status, receipt.packing_slip_reference, receipt.notes, receipt.posted_at::text,
      receipt.reversed_at::text, receipt.reversed_by_actor_id, receipt.reversed_inventory_transaction_id,
      receipt.reversal_reason
    from receiving.inbound_receipts receipt
    join inbound_shipment.shipments shipment on shipment.id = receipt.shipment_id and shipment.organization_id = receipt.organization_id
    join warehouse.locations location on location.id = receipt.receiving_location_id and location.organization_id = receipt.organization_id
    where receipt.organization_id = ${organizationId} and receipt.id = ${receiptId}`.execute(
    db,
  );
  const receipt = header.rows[0];
  if (!receipt) throw new ProcurementDomainError('NOT_FOUND', 'Inbound Receipt was not found.');

  const lines = await sql<{
    id: string;
    shipment_allocation_id: string;
    variant_id: string;
    product_id: string;
    inventory_item_id: string | null;
    sku_snapshot: string;
    product_title_snapshot: string;
    condition_code: InventoryCondition;
    quantity: string;
  }>`select line.id, line.shipment_allocation_id, line.variant_id, variant.product_id, item.id as inventory_item_id,
      allocation.sku_snapshot, allocation.product_title_snapshot, line.condition_code, line.quantity::text
    from receiving.inbound_receipt_lines line
    join inbound_shipment.purchase_line_allocations allocation on allocation.id = line.shipment_allocation_id and allocation.organization_id = line.organization_id
    join catalog.product_variants variant on variant.id = line.variant_id
    left join inventory.inventory_items item on item.organization_id = line.organization_id and item.variant_id = line.variant_id
    where line.organization_id = ${organizationId} and line.inbound_receipt_id = ${receiptId}
    order by line.created_at, line.id`.execute(db);

  return {
    id: receipt.id,
    receiptNumber: receipt.receipt_number,
    shipmentId: receipt.shipment_id,
    shipmentNumber: receipt.shipment_number,
    locationId: receipt.receiving_location_id,
    locationName: receipt.location_name,
    inventoryTransactionId: receipt.posted_inventory_transaction_id,
    status: receipt.status,
    ...(receipt.packing_slip_reference
      ? { packingSlipReference: receipt.packing_slip_reference }
      : {}),
    ...(receipt.notes ? { notes: receipt.notes } : {}),
    postedAt: receipt.posted_at,
    ...(receipt.reversed_at ? { reversedAt: receipt.reversed_at } : {}),
    ...(receipt.reversed_by_actor_id ? { reversedByActorId: receipt.reversed_by_actor_id } : {}),
    ...(receipt.reversed_inventory_transaction_id
      ? { reversedInventoryTransactionId: receipt.reversed_inventory_transaction_id }
      : {}),
    ...(receipt.reversal_reason ? { reversalReason: receipt.reversal_reason } : {}),
    lines: lines.rows.map((line) => ({
      id: line.id,
      shipmentAllocationId: line.shipment_allocation_id,
      variantId: line.variant_id,
      productId: line.product_id,
      ...(line.inventory_item_id ? { inventoryItemId: line.inventory_item_id } : {}),
      sku: line.sku_snapshot,
      productTitle: line.product_title_snapshot,
      condition: line.condition_code,
      quantity: line.quantity,
    })),
  };
}

export async function listInboundReceipts(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  options?: InboundReceiptListOptions,
): Promise<PaginatedProcurementResult<InboundReceiptView>> {
  const { page, pageSize, offset } = parsePagination(options);
  const searchPattern = options?.search?.trim() ? `%${options.search.trim()}%` : null;
  const statuses = parseDelimitedValues(options?.status);
  const shipmentId = options?.shipmentId?.trim() || null;
  const locationId = options?.locationId?.trim() || null;
  const fromDate = options?.fromDate?.trim() || null;
  const toDate = options?.toDate?.trim() || null;

  const where = sql`receipt.organization_id = ${organizationId}
    and (${searchPattern}::text is null or concat_ws(' ', receipt.receipt_number, receipt.packing_slip_reference, receipt.notes) ilike ${searchPattern}::text)
    and (${statuses.length === 0} or receipt.status = any(${statuses}::text[]))
    and (${shipmentId}::uuid is null or receipt.shipment_id = ${shipmentId}::uuid)
    and (${locationId}::uuid is null or receipt.receiving_location_id = ${locationId}::uuid)
    and (${fromDate}::date is null or receipt.posted_at::date >= ${fromDate}::date)
    and (${toDate}::date is null or receipt.posted_at::date <= ${toDate}::date)`;

  const sortBy = options?.sortBy ?? 'postedAt';
  const sortAsc = (options?.sortOrder ?? 'desc') === 'asc';

  let orderClause = sql`receipt.posted_at desc, receipt.id desc`;
  if (sortBy === 'receiptNumber') {
    orderClause = sortAsc ? sql`receipt.receipt_number asc, receipt.id desc` : sql`receipt.receipt_number desc, receipt.id desc`;
  } else if (sortBy === 'postedAt') {
    orderClause = sortAsc ? sql`receipt.posted_at asc, receipt.id desc` : sql`receipt.posted_at desc, receipt.id desc`;
  } else if (sortBy === 'createdAt') {
    orderClause = sortAsc ? sql`receipt.created_at asc, receipt.id desc` : sql`receipt.created_at desc, receipt.id desc`;
  }

  const [idsResult, countResult] = await Promise.all([
    sql<{ id: string }>`select receipt.id
      from receiving.inbound_receipts receipt
      where ${where}
      order by ${orderClause}
      limit ${pageSize} offset ${offset}`.execute(db),
    sql<{ total: string }>`select count(*)::text as total
      from receiving.inbound_receipts receipt
      where ${where}`.execute(db),
  ]);

  const totalItems = Number(countResult.rows[0]?.total ?? 0);
  const items = await Promise.all(idsResult.rows.map((row) => getReceiptIn(db, organizationId, row.id)));
  return paginateResult(items, totalItems, page, pageSize);
}

export async function getInboundReceipt(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; receiptId: string },
): Promise<InboundReceiptView> {
  return getReceiptIn(db, input.organizationId, input.receiptId);
}

export async function postInboundReceipt(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    shipmentId: string;
    lines: readonly {
      shipmentAllocationId: string;
      condition: InventoryCondition;
      quantity: string;
    }[];
    idempotencyKey: string;
    packingSlipReference?: string | undefined;
    notes?: string | undefined;
    /** Test-only transactional probe; production callers must never provide it. */
    fault?: (() => void) | undefined;
  },
): Promise<InboundReceiptView> {
  if (!input.lines.length) {
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'An Inbound Receipt needs at least one counted line.',
    );
  }
  for (const line of input.lines) {
    positiveQuantity(line.quantity, 'Received quantity');
  }

  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'receiving.post-inbound-receipt',
      idempotencyKey: input.idempotencyKey,
      request: { ...input, fault: undefined },
    });
    if (started.replay) return started.replay as InboundReceiptView;

    const shipment = await sql<{
      id: string;
      status: ShipmentStatus;
      receiving_location_id: string;
    }>`select id, status, receiving_location_id from inbound_shipment.shipments where organization_id = ${input.organizationId} and id = ${input.shipmentId} for update`.execute(
      transaction,
    );
    const shipmentRow = shipment.rows[0];
    if (!shipmentRow) {
      throw new ProcurementDomainError('NOT_FOUND', 'Inbound Shipment was not found.');
    }
    if (shipmentRow.status !== 'ARRIVED') {
      throw new ProcurementDomainError(
        'INVALID_TRANSITION',
        'Only an arrived Shipment can be physically received.',
      );
    }

    const byAllocation = new Map<string, { condition: InventoryCondition; quantity: string }[]>();
    for (const line of input.lines) {
      const existing = byAllocation.get(line.shipmentAllocationId) ?? [];
      existing.push({ condition: line.condition, quantity: line.quantity });
      byAllocation.set(line.shipmentAllocationId, existing);
    }
    const allocationRows = new Map<
      string,
      { id: string; variant_id: string; allocated_quantity: string }
    >();
    for (const allocationId of [...byAllocation.keys()].sort()) {
      const locked = await sql<{
        id: string;
        variant_id: string;
        allocated_quantity: string;
      }>`select id, variant_id, allocated_quantity::text from inbound_shipment.purchase_line_allocations where organization_id = ${input.organizationId} and shipment_id = ${input.shipmentId} and id = ${allocationId} for update`.execute(
        transaction,
      );
      const allocation = locked.rows[0];
      if (!allocation) {
        throw new ProcurementDomainError(
          'NOT_FOUND',
          'Shipment Allocation was not found in this Shipment.',
        );
      }
      const alreadyReceived = await sql<{
        quantity: string;
      }>`select coalesce(sum(rline.quantity), 0)::text as quantity
        from receiving.inbound_receipt_lines rline
        join receiving.inbound_receipts receipt on receipt.id = rline.inbound_receipt_id
        where rline.shipment_allocation_id = ${allocationId} and receipt.status <> 'REVERSED'`.execute(
        transaction,
      );
      const newQuantity = byAllocation
        .get(allocationId)!
        .reduce((sum, line) => sum + integer(line.quantity), 0n);
      if (
        integer(alreadyReceived.rows[0]?.quantity ?? '0') + newQuantity >
        integer(allocation.allocated_quantity)
      ) {
        throw new ProcurementDomainError(
          'OVER_RECEIPT',
          'Receipt quantity exceeds the Shipment Allocation quantity.',
        );
      }
      allocationRows.set(allocationId, allocation);
    }

    const receiptNumber = await nextProcurementSequenceNumber(
      transaction,
      input.organizationId,
      'RECEIPT',
      'RCV',
      'YEARLY',
    );

    const receipt = await sql<{
      id: string;
    }>`insert into receiving.inbound_receipts (
        organization_id, receipt_number, shipment_id, receiving_location_id,
        packing_slip_reference, notes, created_by_actor_id
      ) values (
        ${input.organizationId}, ${receiptNumber}, ${input.shipmentId}, ${shipmentRow.receiving_location_id},
        ${input.packingSlipReference?.trim() || null}, ${input.notes?.trim() || null}, ${input.actorId}
      ) returning id`.execute(transaction);
    const receiptId = receipt.rows[0]!.id;

    for (const line of input.lines) {
      const allocation = allocationRows.get(line.shipmentAllocationId)!;
      await sql`insert into receiving.inbound_receipt_lines (
        organization_id, inbound_receipt_id, shipment_allocation_id, variant_id, condition_code, quantity
      ) values (
        ${input.organizationId}, ${receiptId}, ${line.shipmentAllocationId}, ${allocation.variant_id},
        ${line.condition}, ${line.quantity}::numeric
      )`.execute(transaction);
    }

    const inventory = await receiveInboundInventoryInTransaction(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receiptId,
      locationId: shipmentRow.receiving_location_id,
      idempotencyRecordId: started.recordId!,
      lines: input.lines.map((line) => ({
        variantId: allocationRows.get(line.shipmentAllocationId)!.variant_id,
        condition: line.condition,
        quantity: line.quantity,
      })),
    });

    await sql`update receiving.inbound_receipts set posted_inventory_transaction_id = ${inventory.transactionId}::uuid where id = ${receiptId}`.execute(
      transaction,
    );

    await createProvisionalCostLayersForInboundReceiptInTransaction(transaction, {
      organizationId: input.organizationId,
      receiptId,
      locationId: shipmentRow.receiving_location_id,
    });

    const totals = await sql<{
      allocated: string;
      received: string;
    }>`select
        coalesce(sum(allocation.allocated_quantity), 0)::text as allocated,
        coalesce((
          select sum(line.quantity)
          from receiving.inbound_receipt_lines line
          join receiving.inbound_receipts receipt on receipt.id = line.inbound_receipt_id
          join inbound_shipment.purchase_line_allocations allocation_line on allocation_line.id = line.shipment_allocation_id
          where allocation_line.shipment_id = ${input.shipmentId} and receipt.status <> 'REVERSED'
        ), 0)::text as received
      from inbound_shipment.purchase_line_allocations allocation
      where allocation.shipment_id = ${input.shipmentId}`.execute(transaction);

    const total = totals.rows[0]!;
    const receivingStatus: ReceivingStatus =
      integer(total.received) >= integer(total.allocated) ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

    await sql`update inbound_shipment.shipments set receiving_status = ${receivingStatus}, version = version + 1, updated_at = now() where id = ${input.shipmentId}`.execute(
      transaction,
    );

    input.fault?.();

    const view = await getReceiptIn(transaction, input.organizationId, receiptId);
    await completeIdempotency(
      transaction,
      started.recordId!,
      'receiving.inbound_receipt',
      receiptId,
      view,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'receiving.inbound_receipt.posted',
      eventType: 'receiving.inbound_receipt.posted',
      targetType: 'receiving.inbound_receipt',
      targetId: receiptId,
      metadata: { shipmentId: input.shipmentId, inventoryTransactionId: inventory.transactionId },
    });
    return view;
  });
}

export async function reverseInboundReceipt(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    receiptId: string;
    reason: string;
    idempotencyKey: string;
  },
): Promise<InboundReceiptView> {
  if (!input.reason.trim()) {
    throw new ProcurementDomainError('VALIDATION_FAILED', 'A reversal reason is required.');
  }

  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'receiving.reverse-inbound-receipt',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay) return started.replay as InboundReceiptView;

    const receiptRow = await sql<{
      id: string;
      status: InboundReceiptStatus;
      shipment_id: string;
      receiving_location_id: string;
      posted_inventory_transaction_id: string;
    }>`select id, status, shipment_id, receiving_location_id, posted_inventory_transaction_id
      from receiving.inbound_receipts
      where organization_id = ${input.organizationId} and id = ${input.receiptId}
      for update`.execute(transaction);
    const receipt = receiptRow.rows[0];
    if (!receipt) throw new ProcurementDomainError('NOT_FOUND', 'Inbound Receipt was not found.');
    if (receipt.status === 'REVERSED') {
      throw new ProcurementDomainError('INVALID_TRANSITION', 'Inbound receipt is already reversed.');
    }

    const finalizedLandedCost = await sql<{ count: string }>`
      select count(*)::text as count
      from landed_cost.allocation_targets target
      join receiving.inbound_receipt_lines rline on rline.shipment_allocation_id = target.shipment_allocation_id
      join landed_cost.worksheet_revisions revision on revision.id = target.worksheet_revision_id
      where rline.inbound_receipt_id = ${input.receiptId}
        and revision.organization_id = ${input.organizationId}
        and revision.status = 'FINALIZED'
    `.execute(transaction);
    if (Number(finalizedLandedCost.rows[0]?.count ?? 0) > 0) {
      throw new ProcurementDomainError(
        'CONFLICT',
        'Receipt cannot be reversed because landed costs have already been finalized.',
      );
    }

    const lines = await sql<{
      variant_id: string;
      condition_code: InventoryCondition;
      quantity: string;
    }>`select variant_id, condition_code, quantity::text
      from receiving.inbound_receipt_lines
      where inbound_receipt_id = ${input.receiptId} and organization_id = ${input.organizationId}`.execute(transaction);

    const reversalTx = await reverseInboundInventoryInTransaction(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receiptId: input.receiptId,
      locationId: receipt.receiving_location_id,
      idempotencyRecordId: started.recordId!,
      lines: lines.rows.map((l) => ({
        variantId: l.variant_id,
        condition: l.condition_code,
        quantity: l.quantity,
      })),
    });

    await reverseProvisionalCostLayersForInboundReceiptInTransaction(transaction, {
      organizationId: input.organizationId,
      receiptId: input.receiptId,
    });

    await sql`
      update receiving.inbound_receipts set
        status = 'REVERSED',
        reversed_at = now(),
        reversed_by_actor_id = ${input.actorId},
        reversed_inventory_transaction_id = ${reversalTx.transactionId}::uuid,
        reversal_reason = ${input.reason.trim()}
      where id = ${input.receiptId} and organization_id = ${input.organizationId}
    `.execute(transaction);

    const totals = await sql<{
      allocated: string;
      received: string;
    }>`
      select
        coalesce(sum(allocation.allocated_quantity), 0)::text as allocated,
        coalesce((
          select sum(line.quantity)
          from receiving.inbound_receipt_lines line
          join receiving.inbound_receipts r on r.id = line.inbound_receipt_id
          join inbound_shipment.purchase_line_allocations allocation_line on allocation_line.id = line.shipment_allocation_id
          where allocation_line.shipment_id = ${receipt.shipment_id}
            and r.status <> 'REVERSED'
        ), 0)::text as received
      from inbound_shipment.purchase_line_allocations allocation
      where allocation.shipment_id = ${receipt.shipment_id}
    `.execute(transaction);

    const total = totals.rows[0]!;
    const receivedBigInt = integer(total.received);
    const allocatedBigInt = integer(total.allocated);
    const newReceivingStatus: ReceivingStatus =
      receivedBigInt === 0n
        ? 'NOT_RECEIVED'
        : receivedBigInt >= allocatedBigInt
          ? 'RECEIVED'
          : 'PARTIALLY_RECEIVED';

    await sql`
      update inbound_shipment.shipments set
        receiving_status = ${newReceivingStatus},
        version = version + 1,
        updated_at = now()
      where id = ${receipt.shipment_id} and organization_id = ${input.organizationId}
    `.execute(transaction);

    const view = await getReceiptIn(transaction, input.organizationId, input.receiptId);
    await completeIdempotency(
      transaction,
      started.recordId!,
      'receiving.inbound_receipt',
      input.receiptId,
      view,
    );

    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'receiving.inbound_receipt.reversed',
      eventType: 'receiving.inbound_receipt.reversed',
      targetType: 'receiving.inbound_receipt',
      targetId: input.receiptId,
      metadata: {
        shipmentId: receipt.shipment_id,
        reason: input.reason.trim(),
        reversedInventoryTransactionId: reversalTx.transactionId,
      },
    });

    return view;
  });
}

export async function resolveReceiptLineCondition(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    receiptId: string;
    lineId: string;
    targetCondition: 'SELLABLE' | 'DAMAGED';
    quantity: string;
    reason?: string | undefined;
    idempotencyKey: string;
  },
): Promise<{ transactionId: string; inventoryItemId: string; receipt: InboundReceiptView }> {
  positiveQuantity(input.quantity, 'Resolution quantity');

  return db.transaction().execute(async (transaction) => {
    const receiptRow = await sql<{
      id: string;
      status: InboundReceiptStatus;
      receiving_location_id: string;
    }>`select id, status, receiving_location_id
      from receiving.inbound_receipts
      where organization_id = ${input.organizationId} and id = ${input.receiptId}
      for update`.execute(transaction);
    const receipt = receiptRow.rows[0];
    if (!receipt) throw new ProcurementDomainError('NOT_FOUND', 'Inbound Receipt was not found.');
    if (receipt.status === 'REVERSED') {
      throw new ProcurementDomainError(
        'INVALID_TRANSITION',
        'Cannot resolve conditions on a reversed receipt.',
      );
    }

    const lineRow = await sql<{
      id: string;
      variant_id: string;
      condition_code: InventoryCondition;
      quantity: string;
    }>`select id, variant_id, condition_code, quantity::text
      from receiving.inbound_receipt_lines
      where organization_id = ${input.organizationId} and inbound_receipt_id = ${input.receiptId} and id = ${input.lineId}`.execute(transaction);
    const line = lineRow.rows[0];
    if (!line) throw new ProcurementDomainError('NOT_FOUND', 'Receipt line was not found.');
    if (line.condition_code !== 'INSPECTION' && line.condition_code !== 'QUARANTINE') {
      throw new ProcurementDomainError(
        'VALIDATION_FAILED',
        `Line is in ${line.condition_code} condition; only INSPECTION or QUARANTINE can be resolved.`,
      );
    }
    if (integer(input.quantity) > integer(line.quantity)) {
      throw new ProcurementDomainError(
        'VALIDATION_FAILED',
        'Resolved quantity cannot exceed receipt line quantity.',
      );
    }

    const movement = await moveInventoryCondition(db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      variantId: line.variant_id,
      locationId: receipt.receiving_location_id,
      fromCondition: line.condition_code,
      toCondition: input.targetCondition,
      quantity: input.quantity,
      reason: input.reason ?? `Receipt condition resolution for line ${line.id}`,
      idempotencyKey: input.idempotencyKey,
    });

    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'receiving.condition_resolved',
      eventType: 'receiving.condition_resolved',
      targetType: 'receiving.inbound_receipt_line',
      targetId: line.id,
      metadata: {
        receiptId: input.receiptId,
        fromCondition: line.condition_code,
        toCondition: input.targetCondition,
        quantity: input.quantity,
        transactionId: movement.transactionId,
      },
    });

    const updatedReceipt = await getReceiptIn(transaction, input.organizationId, input.receiptId);
    return {
      transactionId: movement.transactionId,
      inventoryItemId: movement.inventoryItemId,
      receipt: updatedReceipt,
    };
  });
}

export async function getSupplyOverview(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<SupplyOverviewView> {
  const result = await sql<{
    active_suppliers: string;
    draft_purchases: string;
    open_purchases: string;
    planned_shipments: string;
    in_transit_shipments: string;
    awaiting_receipt_shipments: string;
    receipts_today: string;
    overdue_shipments: string;
  }>`select
      (select count(*) from procurement.suppliers where organization_id = ${organizationId} and status = 'ACTIVE')::text as active_suppliers,
      (select count(*) from procurement.purchases where organization_id = ${organizationId} and status = 'DRAFT')::text as draft_purchases,
      (select count(*) from procurement.purchases where organization_id = ${organizationId} and status = 'PLACED')::text as open_purchases,
      (select count(*) from inbound_shipment.shipments where organization_id = ${organizationId} and status = 'PLANNED')::text as planned_shipments,
      (select count(*) from inbound_shipment.shipments where organization_id = ${organizationId} and status = 'IN_TRANSIT')::text as in_transit_shipments,
      (select count(*) from inbound_shipment.shipments where organization_id = ${organizationId} and status = 'ARRIVED' and receiving_status <> 'RECEIVED')::text as awaiting_receipt_shipments,
      (select count(*) from receiving.inbound_receipts where organization_id = ${organizationId} and status <> 'REVERSED' and posted_at >= current_date)::text as receipts_today,
      (select count(*) from inbound_shipment.shipments where organization_id = ${organizationId} and status in ('PLANNED', 'IN_TRANSIT') and expected_arrival_date < current_date)::text as overdue_shipments
  `.execute(db);
  const row = result.rows[0]!;
  return {
    activeSuppliers: Number(row.active_suppliers),
    draftPurchases: Number(row.draft_purchases),
    openPurchases: Number(row.open_purchases),
    plannedShipments: Number(row.planned_shipments),
    inTransitShipments: Number(row.in_transit_shipments),
    awaitingReceiptShipments: Number(row.awaiting_receipt_shipments),
    receiptsToday: Number(row.receipts_today),
    overdueShipments: Number(row.overdue_shipments),
  };
}
