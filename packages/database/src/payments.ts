import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';

export type PaymentMethodCode = 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';

export class PaymentDomainError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'PAYMENT_METHOD_UNAVAILABLE'
      | 'VALIDATION_FAILED'
      | 'PAYMENT_ATTEMPT_ALREADY_REVIEWED'
      | 'COD_DELIVERY_NOT_ELIGIBLE'
      | 'COD_COLLECTION_EXCEEDS_OUTSTANDING'
      | 'DUPLICATE_EXTERNAL_TRANSACTION'
      | 'PAYMENT_ALREADY_SATISFIED'
      | 'REFUND_EXCEEDS_REFUNDABLE'
      | 'REFUND_ALREADY_COMPLETED'
      | 'IDEMPOTENCY_CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'PaymentDomainError';
  }
}

export interface PaymentMethodView {
  readonly id: string;
  readonly code: PaymentMethodCode;
  readonly name: string;
  readonly methodType: 'COD' | 'MOBILE_WALLET';
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly instructions: { readonly accountNumber?: string; readonly text?: string };
  readonly paymentWindowMinutes: number | null;
  readonly displayOrder: number;
  readonly version: number;
}

export interface PaymentSummary {
  readonly method: PaymentMethodCode;
  readonly status:
    | 'UNPAID'
    | 'PAYMENT_PENDING'
    | 'PARTIALLY_PAID'
    | 'PAID'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED'
    | 'EXPIRED'
    | 'CANCELLED';
  readonly expected: string;
  readonly collected: string;
  readonly refunded: string;
  readonly netCollected: string;
  readonly outstanding: string;
  readonly intentStatus: string | null;
}

export interface PaymentAttemptView {
  readonly id: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly method: PaymentMethodCode;
  readonly methodName: string;
  readonly expectedAmount: string;
  readonly customerReference: string;
  readonly claimedAmount: string | null;
  readonly status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  readonly submittedAt: string;
}

export interface PendingCodCollectionView {
  readonly deliveryId: string;
  readonly deliveryNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly expectedAmount: string;
  readonly outstandingAmount: string;
  readonly currency: string;
  readonly carrierName: string | null;
  readonly trackingReference: string | null;
  readonly deliveredAt: string;
}

export interface PaymentView {
  readonly id: string;
  readonly paymentNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly method: PaymentMethodCode;
  readonly amount: string;
  readonly currency: string;
  readonly externalReference: string;
  readonly status: 'CONFIRMED' | 'VOIDED' | 'REVERSED';
  readonly confirmedAt: string;
  readonly refunded: string;
  readonly net: string;
  readonly financePosting: FinancePostingView | null;
}

export interface RefundView {
  readonly id: string;
  readonly refundNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly paymentId: string;
  readonly paymentNumber: string;
  readonly amount: string;
  readonly currency: string;
  readonly status: string;
  readonly reasonCode: string;
  readonly externalReference: string | null;
  readonly requestedAt: string;
  readonly completedAt: string | null;
  readonly version: number;
  readonly financePosting: FinancePostingView | null;
}

export interface PaginationView {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface PaginatedResultView<T> {
  readonly items: readonly T[];
  readonly pagination: PaginationView;
}

export interface PaymentListFilters {
  readonly page?: number;
  readonly pageSize?: number;
  readonly query?: string;
  readonly method?: PaymentMethodCode;
  readonly posting?: 'ALL' | 'POSTED' | 'UNPOSTED';
  readonly from?: string;
  readonly to?: string;
}

export interface RefundListFilters {
  readonly page?: number;
  readonly pageSize?: number;
  readonly query?: string;
  readonly status?: string;
  readonly posting?: 'ALL' | 'POSTED' | 'UNPOSTED';
  readonly from?: string;
  readonly to?: string;
}

export interface PaymentDetailView extends PaymentView {
  readonly order: {
    readonly status: string;
    readonly total: string;
    readonly currency: string;
    readonly paymentStatus: PaymentSummary['status'];
    readonly collected: string;
    readonly outstanding: string;
  };
  readonly customer: {
    readonly id: string | null;
    readonly name: string;
    readonly phone: string;
    readonly email: string | null;
  };
  readonly source:
    | { readonly type: 'MANUAL_SUBMISSION'; readonly id: string; readonly submittedAt: string }
    | {
        readonly type: 'COD_COLLECTION';
        readonly id: string;
        readonly deliveryNumber: string;
        readonly carrierName: string | null;
        readonly trackingReference: string | null;
        readonly deliveredAt: string | null;
      };
  readonly refunds: readonly RefundView[];
}

export interface FinancePostingView {
  readonly transactionId: string;
  readonly transactionNumber: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly postedAt: string;
}

interface PaymentRow {
  readonly id: string;
  readonly payment_number: string;
  readonly order_id: string;
  readonly order_number_snapshot: string;
  readonly code: PaymentMethodCode;
  readonly amount: string;
  readonly currency_code: string;
  readonly external_reference: string;
  readonly status: 'CONFIRMED' | 'VOIDED' | 'REVERSED';
  readonly confirmed_at: Date;
  readonly refunded: string;
  readonly net: string;
  readonly finance_transaction_id: string | null;
  readonly finance_transaction_number: string | null;
  readonly financial_account_id: string | null;
  readonly financial_account_name: string | null;
  readonly finance_posted_at: Date | null;
}

interface RefundRow {
  readonly id: string;
  readonly refund_number: string;
  readonly order_id: string;
  readonly order_number_snapshot: string;
  readonly payment_id: string;
  readonly payment_number: string;
  readonly amount: string;
  readonly currency_code: string;
  readonly status: string;
  readonly reason_code: string;
  readonly external_reference: string | null;
  readonly requested_at: Date;
  readonly completed_at: Date | null;
  readonly version: string;
  readonly finance_transaction_id: string | null;
  readonly finance_transaction_number: string | null;
  readonly financial_account_id: string | null;
  readonly financial_account_name: string | null;
  readonly finance_posted_at: Date | null;
}

function financePosting(row: {
  finance_transaction_id: string | null;
  finance_transaction_number: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  finance_posted_at: Date | null;
}): FinancePostingView | null {
  if (
    !row.finance_transaction_id ||
    !row.finance_transaction_number ||
    !row.financial_account_id ||
    !row.financial_account_name ||
    !row.finance_posted_at
  )
    return null;
  return {
    transactionId: row.finance_transaction_id,
    transactionNumber: row.finance_transaction_number,
    accountId: row.financial_account_id,
    accountName: row.financial_account_name,
    postedAt: row.finance_posted_at.toISOString(),
  };
}

function paymentView(row: PaymentRow): PaymentView {
  return {
    id: row.id,
    paymentNumber: row.payment_number,
    orderId: row.order_id,
    orderNumber: row.order_number_snapshot,
    method: row.code,
    amount: row.amount,
    currency: row.currency_code,
    externalReference: row.external_reference,
    status: row.status,
    confirmedAt: row.confirmed_at.toISOString(),
    refunded: row.refunded,
    net: row.net,
    financePosting: financePosting(row),
  };
}

function refundView(row: RefundRow): RefundView {
  return {
    id: row.id,
    refundNumber: row.refund_number,
    orderId: row.order_id,
    orderNumber: row.order_number_snapshot,
    paymentId: row.payment_id,
    paymentNumber: row.payment_number,
    amount: row.amount,
    currency: row.currency_code,
    status: row.status,
    reasonCode: row.reason_code,
    externalReference: row.external_reference,
    requestedAt: row.requested_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    version: Number(row.version),
    financePosting: financePosting(row),
  };
}

function pagination(page: number, pageSize: number, totalItems: number): PaginationView {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };
}

function normalizedPage(filters: { readonly page?: number; readonly pageSize?: number }) {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 25)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;

function checkedAmount(value: string, field: string): string {
  const trimmed = value.trim();
  if (!moneyPattern.test(trimmed) || /^0(?:\.0+)?$/.test(trimmed))
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      `${field} must be a positive decimal amount.`,
    );
  return trimmed;
}

export function normalizeExternalReference(value: string): string {
  const normalized = value.trim().replace(/\s+/g, '').toLocaleUpperCase();
  if (!/^[A-Z0-9-]{4,128}$/.test(normalized))
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'Transaction reference must contain 4–128 letters, numbers, or hyphens.',
    );
  return normalized;
}

function asInstructions(value: unknown): PaymentMethodView['instructions'] {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  return {
    ...(typeof input.accountNumber === 'string' ? { accountNumber: input.accountNumber } : {}),
    ...(typeof input.text === 'string' ? { text: input.text } : {}),
  };
}

function paymentMethodView(row: {
  id: string;
  code: PaymentMethodCode;
  name: string;
  method_type: 'COD' | 'MOBILE_WALLET';
  status: 'ACTIVE' | 'DISABLED';
  public_instructions: unknown;
  payment_window_minutes: number | null;
  display_order: number;
  version: string;
}): PaymentMethodView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    methodType: row.method_type,
    status: row.status,
    instructions: asInstructions(row.public_instructions),
    paymentWindowMinutes: row.payment_window_minutes,
    displayOrder: row.display_order,
    version: Number(row.version),
  };
}

export async function listPaymentMethods(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  activeOnly = false,
): Promise<readonly PaymentMethodView[]> {
  await ensureDefaultPaymentMethods(db, organizationId);
  const result = await sql<{
    id: string;
    code: PaymentMethodCode;
    name: string;
    method_type: 'COD' | 'MOBILE_WALLET';
    status: 'ACTIVE' | 'DISABLED';
    public_instructions: unknown;
    payment_window_minutes: number | null;
    display_order: number;
    version: string;
  }>`
    select id, code, name, method_type, status, public_instructions, payment_window_minutes, display_order, version::text
    from payments.payment_methods
    where organization_id = ${organizationId} and (${activeOnly} = false or status = 'ACTIVE')
    order by display_order, code
  `.execute(db);
  return result.rows.map(paymentMethodView);
}

/** New organisations receive the safe operational defaults once; later edits are explicit Admin configuration. */
export async function ensureDefaultPaymentMethods(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<void> {
  await sql`
    insert into payments.payment_methods (organization_id, code, name, method_type, status, public_instructions, display_order)
    values
      (${organizationId}, 'COD', 'Cash on Delivery', 'COD', 'ACTIVE', '{}'::jsonb, 10),
      (${organizationId}, 'BKASH_MANUAL', 'bKash Manual', 'MOBILE_WALLET', 'DISABLED', '{}'::jsonb, 20),
      (${organizationId}, 'NAGAD_MANUAL', 'Nagad Manual', 'MOBILE_WALLET', 'DISABLED', '{}'::jsonb, 30)
    on conflict (organization_id, code) do nothing
  `.execute(db);
}

export async function requireActivePaymentMethod(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; code: PaymentMethodCode },
): Promise<PaymentMethodView> {
  const methods = await listPaymentMethods(db, input.organizationId, true);
  const method = methods.find((candidate) => candidate.code === input.code);
  if (!method)
    throw new PaymentDomainError(
      'PAYMENT_METHOD_UNAVAILABLE',
      'This payment method is not available for this checkout.',
    );
  return method;
}

export async function configurePaymentMethod(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    code: PaymentMethodCode;
    name: string;
    status: 'ACTIVE' | 'DISABLED';
    instructions?: PaymentMethodView['instructions'];
    paymentWindowMinutes?: number | null;
    displayOrder: number;
  },
): Promise<PaymentMethodView> {
  if (!input.name.trim() || !Number.isInteger(input.displayOrder))
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'Payment method name and display order are required.',
    );
  const methodType = input.code === 'COD' ? 'COD' : 'MOBILE_WALLET';
  const paymentWindowMinutes = input.code === 'COD' ? null : input.paymentWindowMinutes;
  if (input.code !== 'COD') {
    const hasValidWindow =
      Number.isInteger(paymentWindowMinutes) &&
      paymentWindowMinutes !== null &&
      paymentWindowMinutes !== undefined &&
      paymentWindowMinutes >= 15 &&
      paymentWindowMinutes <= 10_080;
    if (
      (!hasValidWindow && input.status === 'ACTIVE') ||
      (paymentWindowMinutes != null && !hasValidWindow)
    )
      throw new PaymentDomainError(
        'VALIDATION_FAILED',
        'Manual payment methods require a payment window between 15 minutes and 7 days when configured.',
      );
  }
  return db.transaction().execute(async (transaction) => {
    const result = await sql<{
      id: string;
      code: PaymentMethodCode;
      name: string;
      method_type: 'COD' | 'MOBILE_WALLET';
      status: 'ACTIVE' | 'DISABLED';
      public_instructions: unknown;
      payment_window_minutes: number | null;
      display_order: number;
      version: string;
    }>`
      insert into payments.payment_methods (organization_id, code, name, method_type, status, public_instructions, payment_window_minutes, display_order)
      values (${input.organizationId}, ${input.code}, ${input.name.trim()}, ${methodType}, ${input.status}, ${JSON.stringify(input.instructions ?? {})}::jsonb, ${paymentWindowMinutes ?? null}, ${input.displayOrder})
      on conflict (organization_id, code) do update set name = excluded.name, status = excluded.status,
        public_instructions = excluded.public_instructions, payment_window_minutes = excluded.payment_window_minutes, display_order = excluded.display_order,
        version = payments.payment_methods.version + 1, updated_at = now()
      returning id, code, name, method_type, status, public_instructions, payment_window_minutes, display_order, version::text
    `.execute(transaction);
    const row = result.rows[0];
    if (!row) throw new Error('Payment method configuration did not return a record.');
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.payment_method.configured',
      targetType: 'payments.payment_method',
      targetId: row.id,
      metadata: { code: input.code, status: input.status, paymentWindowMinutes },
    });
    return paymentMethodView(row);
  });
}

/** Published Order→Payment boundary: creation is invoked from PlaceOrder but payments own their data. */
export async function createPaymentIntentForOrder(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    orderId: string;
    orderNumber: string;
    paymentMethod: PaymentMethodCode;
    currency: string;
    expectedAmount: string;
  },
): Promise<{ id: string; method: PaymentMethodCode }> {
  const method = await requireActivePaymentMethod(db, {
    organizationId: input.organizationId,
    code: input.paymentMethod,
  });
  const result = await sql<{ id: string }>`
    insert into payments.payment_intents (organization_id, order_id, order_number_snapshot, payment_method_id, currency_code, expected_amount, status, instructions_snapshot, expires_at)
    values (${input.organizationId}, ${input.orderId}, ${input.orderNumber}, ${method.id}, ${input.currency}, ${input.expectedAmount}::numeric, 'READY', ${JSON.stringify(method.instructions)}::jsonb,
      case when ${method.paymentWindowMinutes}::integer is null then null else now() + (${method.paymentWindowMinutes}::integer * interval '1 minute') end)
    returning id
  `.execute(db);
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Payment intent creation did not return an id.');
  return { id, method: method.code };
}

export async function getOrderPaymentSummary(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    orderId: string;
    paymentMethod: PaymentMethodCode;
    expectedAmount: string;
  },
): Promise<PaymentSummary> {
  const summary = await sql<{
    expected: string | null;
    intent_status: string | null;
    collected: string;
    refunded: string;
  }>`
    select
      (select expected_amount::text from payments.payment_intents where organization_id = ${input.organizationId} and order_id = ${input.orderId} order by created_at desc limit 1) as expected,
      (select status from payments.payment_intents where organization_id = ${input.organizationId} and order_id = ${input.orderId} order by created_at desc limit 1) as intent_status,
      coalesce((select sum(allocation.amount)::text from payments.payment_allocations allocation join payments.payments payment on payment.id = allocation.payment_id
        where allocation.organization_id = ${input.organizationId} and allocation.order_id = ${input.orderId} and payment.status = 'CONFIRMED'), '0.0000') as collected,
      coalesce((select sum(refund.amount)::text from payments.refunds refund where refund.organization_id = ${input.organizationId} and refund.order_id = ${input.orderId}
        and refund.status = 'COMPLETED'), '0.0000') as refunded
  `.execute(db);
  const row = summary.rows[0] ?? {
    expected: null,
    intent_status: null,
    collected: '0.0000',
    refunded: '0.0000',
  };
  const expected = row.expected ?? input.expectedAmount;
  const calculated = await sql<{ outstanding: string; net: string }>`
    select greatest(${expected}::numeric - ${row.collected}::numeric, 0)::text as outstanding,
      greatest(${row.collected}::numeric - ${row.refunded}::numeric, 0)::text as net
  `.execute(db);
  const amounts = calculated.rows[0]!;
  const status = await sql<{ status: PaymentSummary['status'] }>`
    select case
      when ${row.refunded}::numeric >= ${row.collected}::numeric and ${row.refunded}::numeric > 0 then 'REFUNDED'
      when ${row.refunded}::numeric > 0 then 'PARTIALLY_REFUNDED'
      when ${row.collected}::numeric >= ${expected}::numeric and ${expected}::numeric > 0 then 'PAID'
      when ${row.collected}::numeric > 0 then 'PARTIALLY_PAID'
      when exists (select 1 from payments.payment_attempts attempt join payments.payment_intents intent on intent.id = attempt.payment_intent_id
        where intent.organization_id = ${input.organizationId} and intent.order_id = ${input.orderId} and attempt.status = 'PENDING_VERIFICATION') then 'PAYMENT_PENDING'
      when ${row.intent_status}::text = 'EXPIRED' then 'EXPIRED'
      when ${row.intent_status}::text = 'CANCELLED' then 'CANCELLED'
      else 'UNPAID'
    end as status
  `.execute(db);
  return {
    method: input.paymentMethod,
    status: status.rows[0]!.status,
    expected,
    collected: row.collected,
    refunded: row.refunded,
    netCollected: amounts.net,
    outstanding: amounts.outstanding,
    intentStatus: row.intent_status,
  };
}

/**
 * A small reconciliation probe for operational checks and tests. It relies on
 * immutable allocation facts rather than maintaining a mutable payment total.
 */
export async function verifyPaymentIntegrity(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<{ valid: boolean; issues: readonly string[] }> {
  const result = await sql<{
    allocation_exceeds_payment: boolean;
    refund_allocation_mismatch: boolean;
  }>`
    select
      exists(
        select 1
        from payments.payments payment
        join payments.payment_allocations allocation on allocation.payment_id = payment.id
        where payment.organization_id = ${organizationId}
        group by payment.id, payment.amount
        having sum(allocation.amount) > payment.amount
      ) as allocation_exceeds_payment,
      exists(
        select 1
        from payments.refunds refund
        left join payments.refund_allocations allocation on allocation.refund_id = refund.id
        where refund.organization_id = ${organizationId}
        group by refund.id, refund.amount
        having coalesce(sum(allocation.amount), 0) <> refund.amount
      ) as refund_allocation_mismatch
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new Error('Payment integrity check returned no result.');
  const issues = [
    ...(row.allocation_exceeds_payment ? ['PAYMENT_ALLOCATION_EXCEEDS_PAYMENT'] : []),
    ...(row.refund_allocation_mismatch ? ['REFUND_ALLOCATION_MISMATCH'] : []),
  ];
  return { valid: issues.length === 0, issues };
}

export async function getOrderPaymentInstructions(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; orderId: string },
): Promise<{
  method: PaymentMethodCode;
  name: string;
  instructions: PaymentMethodView['instructions'];
} | null> {
  const result = await sql<{
    code: PaymentMethodCode;
    name: string;
    instructions_snapshot: unknown;
  }>`
    select method.code, method.name, intent.instructions_snapshot
    from payments.payment_intents intent join payments.payment_methods method on method.id = intent.payment_method_id
    where intent.organization_id = ${input.organizationId} and intent.order_id = ${input.orderId}
    order by intent.created_at desc limit 1
  `.execute(db);
  const row = result.rows[0];
  return row
    ? { method: row.code, name: row.name, instructions: asInstructions(row.instructions_snapshot) }
    : null;
}

/** Orders invoke this published boundary when their commercial lifecycle is cancelled. Confirmed money remains historical. */
export async function cancelPendingPaymentIntentsForOrder(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; orderId: string },
): Promise<void> {
  await sql`
    update payments.payment_intents set status = 'CANCELLED', version = version + 1, updated_at = now()
    where organization_id = ${input.organizationId} and order_id = ${input.orderId} and status = 'READY'
  `.execute(db);
}

/**
 * Orders may reduce an unpaid, pre-fulfillment commercial obligation. Payments
 * owns the intent and therefore validates that no collection workflow has
 * started before accepting the revised authoritative Order total.
 */
export async function reviseOpenPaymentIntentForOrder(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; orderId: string; expectedAmount: string },
): Promise<void> {
  const intent = await sql<{ id: string }>`
    select id
    from payments.payment_intents
    where organization_id = ${input.organizationId}
      and order_id = ${input.orderId}
      and status = 'READY'
    order by created_at desc, id desc
    limit 1
    for update
  `.execute(db);
  const row = intent.rows[0];
  if (!row)
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'The payment obligation is no longer open for an Order amendment.',
    );
  const activity = await sql<{ blocked: boolean }>`
    select exists (
      select 1 from payments.payment_attempts attempt
      where attempt.organization_id = ${input.organizationId}
        and attempt.payment_intent_id = ${row.id}
        and attempt.status = 'PENDING_VERIFICATION'
    ) or exists (
      select 1
      from payments.payment_allocations allocation
      join payments.payments payment
        on payment.organization_id = allocation.organization_id
        and payment.id = allocation.payment_id
      where allocation.organization_id = ${input.organizationId}
        and allocation.order_id = ${input.orderId}
        and payment.status = 'CONFIRMED'
    ) as blocked
  `.execute(db);
  if (activity.rows[0]?.blocked)
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'The Order cannot be amended after payment collection or verification has started.',
    );
  await sql`
    update payments.payment_intents
    set expected_amount = ${input.expectedAmount}::numeric,
        version = version + 1,
        updated_at = now()
    where organization_id = ${input.organizationId} and id = ${row.id}
  `.execute(db);
}

export async function submitManualPayment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    orderId: string;
    customerReference: string;
    payerReference?: string;
    claimedAmount?: string;
    idempotencyKey: string;
  },
): Promise<PaymentAttemptView> {
  const normalizedReference = normalizeExternalReference(input.customerReference);
  if (input.claimedAmount) checkedAmount(input.claimedAmount, 'Claimed amount');
  return db.transaction().execute(async (transaction) => {
    let recordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'GUEST_ORDER',
        principalId: input.orderId,
        operationType: 'payments.manual-submission',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: `${normalizedReference}:${input.claimedAmount?.trim() ?? ''}:${input.payerReference?.trim() ?? ''}`,
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED') {
          const replay = await sql<{
            id: string;
          }>`select result_entity_id::text as id from platform.idempotency_records where id = ${record.id}`.execute(
            transaction,
          );
          if (replay.rows[0]?.id)
            return getPaymentAttempt(transaction, input.organizationId, replay.rows[0].id);
        }
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'This payment submission is already in progress.',
        );
      }
      recordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was reused for different payment details.',
        );
      throw error;
    }
    const intent = await sql<{
      id: string;
      expected_amount: string;
      order_number_snapshot: string;
      code: PaymentMethodCode;
      name: string;
    }>`
      select intent.id, intent.expected_amount::text, intent.order_number_snapshot, method.code, method.name
      from payments.payment_intents intent
      join payments.payment_methods method on method.id = intent.payment_method_id
      where intent.organization_id = ${input.organizationId} and intent.order_id = ${input.orderId} and intent.status = 'READY'
      order by intent.created_at desc limit 1 for update
    `.execute(transaction);
    const intentRow = intent.rows[0];
    if (!intentRow || intentRow.code === 'COD')
      throw new PaymentDomainError(
        'PAYMENT_METHOD_UNAVAILABLE',
        'Manual payment submission is not available for this Order.',
      );
    const created = await sql<{ id: string }>`
      insert into payments.payment_attempts (organization_id, payment_intent_id, customer_reference, normalized_reference, payer_reference, claimed_amount)
      values (${input.organizationId}, ${intentRow.id}, ${input.customerReference.trim()}, ${normalizedReference}, ${input.payerReference?.trim() ?? null}, ${input.claimedAmount?.trim() ?? null}::numeric)
      returning id
    `.execute(transaction);
    const attemptId = created.rows[0]?.id;
    if (!attemptId) throw new Error('Payment attempt creation did not return an id.');
    await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = 'payments.payment_attempt', result_entity_id = ${attemptId}::uuid, safe_response = ${JSON.stringify({ attemptId })}::jsonb, completed_at = now() where id = ${recordId}`.execute(
      transaction,
    );
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'GUEST_ORDER',
      actorId: input.orderId,
      action: 'payments.payment_attempt.submitted',
      targetType: 'payments.payment_attempt',
      targetId: attemptId,
      metadata: { method: intentRow.code },
    });
    await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, 'payments.payment_attempt.submitted', 1, 'payments.payment_attempt', ${attemptId}, 1, ${JSON.stringify({ attemptId, orderId: input.orderId })}::jsonb, now())`.execute(
      transaction,
    );
    return getPaymentAttempt(transaction, input.organizationId, attemptId);
  });
}

export async function getPaymentAttempt(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  attemptId: string,
): Promise<PaymentAttemptView> {
  const result = await sql<{
    id: string;
    order_id: string;
    order_number_snapshot: string;
    code: PaymentMethodCode;
    name: string;
    expected_amount: string;
    customer_reference: string;
    claimed_amount: string | null;
    status: PaymentAttemptView['status'];
    submitted_at: Date;
  }>`
    select attempt.id, intent.order_id, intent.order_number_snapshot, method.code, method.name, intent.expected_amount::text,
      attempt.customer_reference, attempt.claimed_amount::text, attempt.status, attempt.submitted_at
    from payments.payment_attempts attempt join payments.payment_intents intent on intent.id = attempt.payment_intent_id
    join payments.payment_methods method on method.id = intent.payment_method_id
    where attempt.organization_id = ${organizationId} and attempt.id = ${attemptId}
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new PaymentDomainError('NOT_FOUND', 'Payment attempt was not found.');
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number_snapshot,
    method: row.code,
    methodName: row.name,
    expectedAmount: row.expected_amount,
    customerReference: row.customer_reference,
    claimedAmount: row.claimed_amount,
    status: row.status,
    submittedAt: row.submitted_at.toISOString(),
  };
}

export async function listPendingPaymentAttempts(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly PaymentAttemptView[]> {
  const ids = await sql<{
    id: string;
  }>`select id from payments.payment_attempts where organization_id = ${organizationId} and status = 'PENDING_VERIFICATION' order by submitted_at, id limit 100`.execute(
    db,
  );
  return Promise.all(ids.rows.map((row) => getPaymentAttempt(db, organizationId, row.id)));
}

/**
 * Delivered COD parcels remain collection obligations until an operator records
 * the money actually collected. Delivery is physical truth; this queue does not
 * infer a Payment merely from a successful delivery outcome.
 */
export async function listPendingCodCollections(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly PendingCodCollectionView[]> {
  const result = await sql<{
    delivery_id: string;
    delivery_number: string;
    order_id: string;
    order_number: string;
    expected_amount: string;
    outstanding_amount: string;
    currency_code: string;
    manual_carrier_name: string | null;
    tracking_reference: string | null;
    delivered_at: Date;
  }>`
    select delivery.id as delivery_id, delivery.delivery_number, delivery.order_id,
      order_row.order_number,
      least(instruction.expected_amount, greatest(intent.expected_amount - coalesce(collected.amount, 0), 0))::numeric(20,4)::text as expected_amount,
      greatest(intent.expected_amount - coalesce(collected.amount, 0), 0)::numeric(20,4)::text as outstanding_amount,
      delivery.currency_code, delivery.manual_carrier_name, delivery.tracking_reference,
      delivery.delivered_at
    from delivery.deliveries delivery
    join orders.orders order_row on order_row.id = delivery.order_id
    join delivery.cod_collection_instructions instruction
      on instruction.delivery_id = delivery.id and instruction.status = 'ACTIVE'
    join payments.payment_intents intent
      on intent.organization_id = delivery.organization_id
      and intent.order_id = delivery.order_id
      and intent.status = 'READY'
    join payments.payment_methods method on method.id = intent.payment_method_id and method.code = 'COD'
    left join lateral (
      select sum(allocation.amount) as amount
      from payments.payment_allocations allocation
      join payments.payments payment on payment.id = allocation.payment_id
      where allocation.organization_id = delivery.organization_id
        and allocation.order_id = delivery.order_id
        and payment.status = 'CONFIRMED'
    ) collected on true
    where delivery.organization_id = ${organizationId}
      and delivery.outcome_status = 'DELIVERED'
      and delivery.cod_required
      and delivery.delivered_at is not null
      and greatest(intent.expected_amount - coalesce(collected.amount, 0), 0) > 0
      and not exists (
        select 1 from payments.payments payment
        where payment.organization_id = delivery.organization_id
          and payment.source_delivery_id = delivery.id
      )
    order by delivery.delivered_at asc, delivery.id asc
    limit 100
  `.execute(db);
  return result.rows.map((row) => ({
    deliveryId: row.delivery_id,
    deliveryNumber: row.delivery_number,
    orderId: row.order_id,
    orderNumber: row.order_number,
    expectedAmount: row.expected_amount,
    outstandingAmount: row.outstanding_amount,
    currency: row.currency_code,
    carrierName: row.manual_carrier_name,
    trackingReference: row.tracking_reference,
    deliveredAt: row.delivered_at.toISOString(),
  }));
}

export async function recordCodCollection(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    amount: string;
    externalReference: string;
    note?: string;
    idempotencyKey: string;
  },
): Promise<PaymentView> {
  const amount = checkedAmount(input.amount, 'Collected amount');
  const normalizedReference = normalizeExternalReference(input.externalReference);
  return db.transaction().execute(async (transaction) => {
    let recordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId,
        operationType: 'payments.cod-collection',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: `${input.deliveryId}:${amount}:${normalizedReference}:${input.note?.trim() ?? ''}`,
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED') {
          const replay = await sql<{ id: string }>`
            select result_entity_id::text as id from platform.idempotency_records where id = ${record.id}
          `.execute(transaction);
          if (replay.rows[0]?.id)
            return getPayment(transaction, input.organizationId, replay.rows[0].id);
        }
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'This COD collection is already in progress.',
        );
      }
      recordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was reused for a different COD collection.',
        );
      throw error;
    }

    const source = await sql<{
      delivery_number: string;
      order_id: string;
      order_number: string;
      outcome_status: string;
      cod_required: boolean;
      expected_amount: string;
      currency_code: string;
      intent_id: string;
      intent_status: string;
      intent_expected_amount: string;
      payment_method_id: string;
    }>`
      select delivery.delivery_number, delivery.order_id, order_row.order_number,
        delivery.outcome_status, delivery.cod_required, instruction.expected_amount::text,
        delivery.currency_code, intent.id as intent_id, intent.status as intent_status,
        intent.expected_amount::text as intent_expected_amount, intent.payment_method_id
      from delivery.deliveries delivery
      join orders.orders order_row on order_row.id = delivery.order_id
      join delivery.cod_collection_instructions instruction
        on instruction.delivery_id = delivery.id and instruction.status = 'ACTIVE'
      join payments.payment_intents intent
        on intent.organization_id = delivery.organization_id and intent.order_id = delivery.order_id
      join payments.payment_methods method on method.id = intent.payment_method_id and method.code = 'COD'
      where delivery.organization_id = ${input.organizationId} and delivery.id = ${input.deliveryId}
      order by intent.created_at desc
      limit 1
      for update of delivery, intent
    `.execute(transaction);
    const row = source.rows[0];
    if (!row) throw new PaymentDomainError('NOT_FOUND', 'COD delivery was not found.');
    if (!row.cod_required || row.outcome_status !== 'DELIVERED' || row.intent_status !== 'READY')
      throw new PaymentDomainError(
        'COD_DELIVERY_NOT_ELIGIBLE',
        'Only a delivered COD obligation with an open payment intent can be collected.',
      );

    const existing = await sql<{ id: string }>`
      select id from payments.payments
      where organization_id = ${input.organizationId} and source_delivery_id = ${input.deliveryId}
      for update
    `.execute(transaction);
    if (existing.rows[0])
      throw new PaymentDomainError(
        'COD_DELIVERY_NOT_ELIGIBLE',
        'A collection has already been recorded for this delivery.',
      );

    const totals = await sql<{ collected: string; maximum: string }>`
      select coalesce(sum(allocation.amount), 0)::numeric(20,4)::text as collected,
        least(${row.expected_amount}::numeric, greatest(${row.intent_expected_amount}::numeric - coalesce(sum(allocation.amount), 0), 0))::numeric(20,4)::text as maximum
      from payments.payment_allocations allocation
      join payments.payments payment on payment.id = allocation.payment_id and payment.status = 'CONFIRMED'
      where allocation.organization_id = ${input.organizationId} and allocation.order_id = ${row.order_id}
    `.execute(transaction);
    const available = totals.rows[0]!;
    const validity = await sql<{ allowed: boolean }>`
      select ${amount}::numeric <= ${available.maximum}::numeric and ${available.maximum}::numeric > 0 as allowed
    `.execute(transaction);
    if (!validity.rows[0]!.allowed)
      throw new PaymentDomainError(
        'COD_COLLECTION_EXCEEDS_OUTSTANDING',
        `Collected amount cannot exceed the delivery's outstanding COD amount of ${available.maximum} ${row.currency_code}.`,
      );

    const duplicate = await sql<{ id: string }>`
      select id from payments.payments
      where organization_id = ${input.organizationId}
        and payment_method_id = ${row.payment_method_id}
        and normalized_external_reference = ${normalizedReference}
        and status = 'CONFIRMED'
      for update
    `.execute(transaction);
    if (duplicate.rows[0])
      throw new PaymentDomainError(
        'DUPLICATE_EXTERNAL_TRANSACTION',
        'This collection reference is already used by another COD payment.',
      );

    const created = await sql<{ id: string }>`
      insert into payments.payments (
        organization_id, payment_number, payment_method_id, currency_code, amount,
        external_reference, normalized_external_reference, source_delivery_id, confirmed_by_actor_id
      ) values (
        ${input.organizationId}, 'PAY-' || upper(replace(uuidv7()::text, '-', '')),
        ${row.payment_method_id}, ${row.currency_code}, ${amount}::numeric,
        ${input.externalReference.trim()}, ${normalizedReference}, ${input.deliveryId}, ${input.actorId}
      ) returning id
    `.execute(transaction);
    const paymentId = created.rows[0]?.id;
    if (!paymentId) throw new Error('COD payment creation did not return an id.');
    await sql`
      insert into payments.payment_allocations (
        organization_id, payment_id, order_id, order_number_snapshot, amount
      ) values (
        ${input.organizationId}, ${paymentId}, ${row.order_id}, ${row.order_number}, ${amount}::numeric
      )
    `.execute(transaction);
    const remaining = await sql<{ amount: string }>`
      select greatest(${row.intent_expected_amount}::numeric - (${available.collected}::numeric + ${amount}::numeric), 0)::numeric(20,4)::text as amount
    `.execute(transaction);
    await sql`
      update payments.payment_intents
      set status = case when ${remaining.rows[0]!.amount}::numeric = 0 then 'SATISFIED' else status end,
        version = version + 1, updated_at = now()
      where id = ${row.intent_id}
    `.execute(transaction);
    await sql`
      update platform.idempotency_records
      set status = 'SUCCEEDED', result_entity_type = 'payments.payment',
        result_entity_id = ${paymentId}::uuid,
        safe_response = ${JSON.stringify({ paymentId })}::jsonb, completed_at = now()
      where id = ${recordId}
    `.execute(transaction);
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.cod_collection.recorded',
      targetType: 'payments.payment',
      targetId: paymentId,
      metadata: {
        deliveryId: input.deliveryId,
        orderId: row.order_id,
        amount,
        externalReference: input.externalReference.trim(),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      },
    });
    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id,
        aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'payments.cod_collection.recorded', 1,
        'payments.payment', ${paymentId}, 1,
        ${JSON.stringify({ paymentId, deliveryId: input.deliveryId, orderId: row.order_id })}::jsonb,
        now()
      )
    `.execute(transaction);
    return getPayment(transaction, input.organizationId, paymentId);
  });
}

export async function verifyManualPayment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    attemptId: string;
    confirmedAmount: string;
    idempotencyKey: string;
    fault?: () => void;
  },
): Promise<PaymentView> {
  const amount = checkedAmount(input.confirmedAmount, 'Verified amount');
  return db.transaction().execute(async (transaction) => {
    let recordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId,
        operationType: 'payments.manual-verification',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: `${input.attemptId}:${amount}`,
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED') {
          const replay = await sql<{
            id: string;
          }>`select result_entity_id::text as id from platform.idempotency_records where id = ${record.id}`.execute(
            transaction,
          );
          if (replay.rows[0]?.id)
            return getPayment(transaction, input.organizationId, replay.rows[0].id);
        }
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'This payment verification is already in progress.',
        );
      }
      recordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was reused for different verification details.',
        );
      throw error;
    }
    const attempt = await sql<{
      id: string;
      customer_reference: string;
      normalized_reference: string;
      status: string;
      intent_id: string;
      order_id: string;
      order_number_snapshot: string;
      currency_code: string;
      expected_amount: string;
      method_id: string;
      method_code: PaymentMethodCode;
    }>`
      select attempt.id, attempt.customer_reference, attempt.normalized_reference, attempt.status, intent.id as intent_id, intent.order_id, intent.order_number_snapshot,
        intent.currency_code, intent.expected_amount::text, method.id as method_id, method.code as method_code
      from payments.payment_attempts attempt join payments.payment_intents intent on intent.id = attempt.payment_intent_id
      join payments.payment_methods method on method.id = intent.payment_method_id
      where attempt.organization_id = ${input.organizationId} and attempt.id = ${input.attemptId}
      for update
    `.execute(transaction);
    const row = attempt.rows[0];
    if (!row) throw new PaymentDomainError('NOT_FOUND', 'Payment attempt was not found.');
    if (row.status !== 'PENDING_VERIFICATION')
      throw new PaymentDomainError(
        'PAYMENT_ATTEMPT_ALREADY_REVIEWED',
        'This payment attempt has already been reviewed.',
      );
    const intent = await sql<{
      id: string;
      status: string;
    }>`select id, status from payments.payment_intents where organization_id = ${input.organizationId} and id = ${row.intent_id} for update`.execute(
      transaction,
    );
    if (!intent.rows[0]) throw new PaymentDomainError('NOT_FOUND', 'Payment intent was not found.');
    if (intent.rows[0].status !== 'READY')
      throw new PaymentDomainError(
        'PAYMENT_METHOD_UNAVAILABLE',
        'This payment obligation is no longer open for verification.',
      );
    const duplicate = await sql<{
      id: string;
    }>`select id from payments.payments where organization_id = ${input.organizationId} and payment_method_id = ${row.method_id} and normalized_external_reference = ${row.normalized_reference} and status = 'CONFIRMED' for update`.execute(
      transaction,
    );
    if (duplicate.rows[0])
      throw new PaymentDomainError(
        'DUPLICATE_EXTERNAL_TRANSACTION',
        'This transaction reference is already verified for another payment.',
      );
    // The locked intent serializes verification/allocation for this obligation.
    const totals = await sql<{
      allocated: string;
    }>`select coalesce(sum(amount), 0)::text as allocated from payments.payment_allocations where organization_id = ${input.organizationId} and order_id = ${row.order_id}`.execute(
      transaction,
    );
    const allocation = await sql<{
      amount: string;
    }>`select least(${amount}::numeric, greatest(${row.expected_amount}::numeric - ${totals.rows[0]!.allocated}::numeric, 0))::text as amount`.execute(
      transaction,
    );
    if (allocation.rows[0]!.amount === '0')
      throw new PaymentDomainError(
        'PAYMENT_ALREADY_SATISFIED',
        'This Order does not have an outstanding payment balance.',
      );
    const created = await sql<{ id: string; payment_number: string }>`
      insert into payments.payments (organization_id, payment_number, payment_method_id, currency_code, amount, external_reference, normalized_external_reference, source_attempt_id, confirmed_by_actor_id)
      values (${input.organizationId}, 'PAY-' || upper(replace(uuidv7()::text, '-', '')), ${row.method_id}, ${row.currency_code}, ${amount}::numeric,
        ${row.customer_reference}, ${row.normalized_reference}, ${row.id}, ${input.actorId}) returning id, payment_number
    `.execute(transaction);
    const payment = created.rows[0];
    if (!payment) throw new Error('Payment creation did not return an id.');
    await sql`insert into payments.payment_allocations (organization_id, payment_id, order_id, order_number_snapshot, amount) values (${input.organizationId}, ${payment.id}, ${row.order_id}, ${row.order_number_snapshot}, ${allocation.rows[0]!.amount}::numeric)`.execute(
      transaction,
    );
    const after = await sql<{
      outstanding: string;
    }>`select greatest(${row.expected_amount}::numeric - (${totals.rows[0]!.allocated}::numeric + ${allocation.rows[0]!.amount}::numeric), 0)::text as outstanding`.execute(
      transaction,
    );
    await sql`update payments.payment_attempts set status = 'VERIFIED', resolved_at = now(), reviewed_by_actor_id = ${input.actorId}, version = version + 1 where id = ${row.id}`.execute(
      transaction,
    );
    await sql`update payments.payment_intents set status = case when ${after.rows[0]!.outstanding}::numeric = 0 then 'SATISFIED' else status end, version = version + 1, updated_at = now() where id = ${row.intent_id}`.execute(
      transaction,
    );
    input.fault?.();
    await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = 'payments.payment', result_entity_id = ${payment.id}::uuid, safe_response = ${JSON.stringify({ paymentId: payment.id })}::jsonb, completed_at = now() where id = ${recordId}`.execute(
      transaction,
    );
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.payment.verified',
      targetType: 'payments.payment',
      targetId: payment.id,
      metadata: { attemptId: row.id, orderId: row.order_id, amount },
    });
    await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, 'payments.payment.verified', 1, 'payments.payment', ${payment.id}, 1, ${JSON.stringify({ paymentId: payment.id, orderId: row.order_id })}::jsonb, now())`.execute(
      transaction,
    );
    return getPayment(transaction, input.organizationId, payment.id);
  });
}

export async function rejectManualPayment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    attemptId: string;
    reasonCode: string;
    note?: string;
  },
): Promise<PaymentAttemptView> {
  if (!input.reasonCode.trim())
    throw new PaymentDomainError('VALIDATION_FAILED', 'A rejection reason is required.');
  return db.transaction().execute(async (transaction) => {
    const row = await sql<{
      status: string;
    }>`select status from payments.payment_attempts where organization_id = ${input.organizationId} and id = ${input.attemptId} for update`.execute(
      transaction,
    );
    if (!row.rows[0]) throw new PaymentDomainError('NOT_FOUND', 'Payment attempt was not found.');
    if (row.rows[0].status !== 'PENDING_VERIFICATION')
      throw new PaymentDomainError(
        'PAYMENT_ATTEMPT_ALREADY_REVIEWED',
        'This payment attempt has already been reviewed.',
      );
    await sql`update payments.payment_attempts set status = 'REJECTED', rejection_reason_code = ${input.reasonCode.trim()}, reviewer_note = ${input.note?.trim() ?? null}, resolved_at = now(), reviewed_by_actor_id = ${input.actorId}, version = version + 1 where id = ${input.attemptId}`.execute(
      transaction,
    );
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.payment_attempt.rejected',
      targetType: 'payments.payment_attempt',
      targetId: input.attemptId,
      metadata: { reasonCode: input.reasonCode.trim() },
    });
    await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, 'payments.payment_attempt.rejected', 1, 'payments.payment_attempt', ${input.attemptId}, 1, ${JSON.stringify({ attemptId: input.attemptId })}::jsonb, now())`.execute(
      transaction,
    );
    return getPaymentAttempt(transaction, input.organizationId, input.attemptId);
  });
}

export async function getPayment(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  paymentId: string,
): Promise<PaymentView> {
  const result = await sql<PaymentRow>`
    select payment.id, payment.payment_number, allocation.order_id, allocation.order_number_snapshot, method.code, payment.amount::text, payment.currency_code,
      payment.external_reference, payment.status, payment.confirmed_at,
      coalesce(sum(refund.amount) filter (where refund.status = 'COMPLETED'), 0)::numeric(20,4)::text as refunded,
      greatest(payment.amount - coalesce(sum(refund.amount) filter (where refund.status = 'COMPLETED'), 0), 0)::numeric(20,4)::text as net,
      finance_transaction.id as finance_transaction_id,
      finance_transaction.transaction_number as finance_transaction_number,
      financial_account.id as financial_account_id,
      financial_account.name as financial_account_name,
      finance_transaction.occurred_at as finance_posted_at
    from payments.payments payment join payments.payment_allocations allocation on allocation.payment_id = payment.id
    join payments.payment_methods method on method.id = payment.payment_method_id
    left join payments.refunds refund on refund.payment_id = payment.id
    left join finance.finance_transactions finance_transaction
      on finance_transaction.organization_id = payment.organization_id
      and finance_transaction.transaction_type = 'PAYMENT_SOURCE_POSTING'
      and finance_transaction.source_domain = 'payments.payment'
      and finance_transaction.source_id = payment.id
    left join finance.financial_account_entries finance_entry on finance_entry.finance_transaction_id = finance_transaction.id
    left join finance.financial_accounts financial_account on financial_account.id = finance_entry.financial_account_id
    where payment.organization_id = ${organizationId} and payment.id = ${paymentId}
    group by payment.id, allocation.order_id, allocation.order_number_snapshot, method.code,
      finance_transaction.id, financial_account.id
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new PaymentDomainError('NOT_FOUND', 'Payment was not found.');
  return paymentView(row);
}

export async function listPayments(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  filters: PaymentListFilters = {},
): Promise<PaginatedResultView<PaymentView>> {
  const { page, pageSize, offset } = normalizedPage(filters);
  const query = filters.query?.trim() || null;
  const method = filters.method ?? null;
  const posting = filters.posting ?? 'ALL';
  const from = filters.from ?? null;
  const to = filters.to ?? null;
  const [result, countResult] = await Promise.all([
    sql<PaymentRow>`
    select payment.id, payment.payment_number, allocation.order_id, allocation.order_number_snapshot, method.code,
      payment.amount::text, payment.currency_code, payment.external_reference, payment.status, payment.confirmed_at,
      coalesce(sum(refund.amount) filter (where refund.status = 'COMPLETED'), 0)::numeric(20,4)::text as refunded,
      greatest(payment.amount - coalesce(sum(refund.amount) filter (where refund.status = 'COMPLETED'), 0), 0)::numeric(20,4)::text as net,
      finance_transaction.id as finance_transaction_id,
      finance_transaction.transaction_number as finance_transaction_number,
      financial_account.id as financial_account_id,
      financial_account.name as financial_account_name,
      finance_transaction.occurred_at as finance_posted_at
    from payments.payments payment
    join payments.payment_allocations allocation on allocation.payment_id = payment.id
    join payments.payment_methods method on method.id = payment.payment_method_id
    left join payments.refunds refund on refund.payment_id = payment.id
    left join finance.finance_transactions finance_transaction
      on finance_transaction.organization_id = payment.organization_id
      and finance_transaction.transaction_type = 'PAYMENT_SOURCE_POSTING'
      and finance_transaction.source_domain = 'payments.payment'
      and finance_transaction.source_id = payment.id
    left join finance.financial_account_entries finance_entry on finance_entry.finance_transaction_id = finance_transaction.id
    left join finance.financial_accounts financial_account on financial_account.id = finance_entry.financial_account_id
    where payment.organization_id = ${organizationId} and payment.status = 'CONFIRMED'
      and (${query}::text is null or concat_ws(' ', payment.payment_number, allocation.order_number_snapshot, payment.external_reference, method.code) ilike '%' || ${query}::text || '%')
      and (${method}::text is null or method.code = ${method}::text)
      and (${from}::text is null or payment.confirmed_at >= ${from}::timestamptz)
      and (${to}::text is null or payment.confirmed_at <= ${to}::timestamptz)
      and (${posting}::text = 'ALL' or (${posting}::text = 'POSTED' and finance_transaction.id is not null) or (${posting}::text = 'UNPOSTED' and finance_transaction.id is null))
    group by payment.id, allocation.order_id, allocation.order_number_snapshot, method.code,
      finance_transaction.id, financial_account.id
    order by payment.confirmed_at desc, payment.id desc
    limit ${pageSize} offset ${offset}
  `.execute(db),
    sql<{ total: string }>`
      select count(distinct payment.id)::text as total
      from payments.payments payment
      join payments.payment_allocations allocation on allocation.payment_id = payment.id
      join payments.payment_methods method on method.id = payment.payment_method_id
      left join finance.finance_transactions finance_transaction
        on finance_transaction.organization_id = payment.organization_id
        and finance_transaction.transaction_type = 'PAYMENT_SOURCE_POSTING'
        and finance_transaction.source_domain = 'payments.payment'
        and finance_transaction.source_id = payment.id
      where payment.organization_id = ${organizationId} and payment.status = 'CONFIRMED'
        and (${query}::text is null or concat_ws(' ', payment.payment_number, allocation.order_number_snapshot, payment.external_reference, method.code) ilike '%' || ${query}::text || '%')
        and (${method}::text is null or method.code = ${method}::text)
        and (${from}::text is null or payment.confirmed_at >= ${from}::timestamptz)
        and (${to}::text is null or payment.confirmed_at <= ${to}::timestamptz)
        and (${posting}::text = 'ALL' or (${posting}::text = 'POSTED' and finance_transaction.id is not null) or (${posting}::text = 'UNPOSTED' and finance_transaction.id is null))
    `.execute(db),
  ]);
  const totalItems = Number(countResult.rows[0]?.total ?? 0);
  return {
    items: result.rows.map(paymentView),
    pagination: pagination(page, pageSize, totalItems),
  };
}

export async function createRefund(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    paymentId: string;
    amount: string;
    reasonCode: string;
    reasonText?: string;
    idempotencyKey: string;
  },
): Promise<RefundView> {
  const amount = checkedAmount(input.amount, 'Refund amount');
  if (!input.reasonCode.trim())
    throw new PaymentDomainError('VALIDATION_FAILED', 'A refund reason is required.');
  return db.transaction().execute(async (transaction) => {
    let recordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId,
        operationType: 'payments.refund-create',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: `${input.paymentId}:${amount}:${input.reasonCode.trim()}`,
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED') {
          const replay = await sql<{
            id: string;
          }>`select result_entity_id::text as id from platform.idempotency_records where id = ${record.id}`.execute(
            transaction,
          );
          if (replay.rows[0]?.id)
            return getRefund(transaction, input.organizationId, replay.rows[0].id);
        }
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'This refund request is already in progress.',
        );
      }
      recordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was reused for different refund details.',
        );
      throw error;
    }
    const payment = await sql<{
      id: string;
      currency_code: string;
      amount: string;
      payment_method_id: string;
      order_id: string;
    }>`
      select payment.id, payment.currency_code, payment.amount::text, payment.payment_method_id, allocation.order_id
      from payments.payments payment join payments.payment_allocations allocation on allocation.payment_id = payment.id
      where payment.organization_id = ${input.organizationId} and payment.id = ${input.paymentId} and payment.status = 'CONFIRMED' for update
    `.execute(transaction);
    const row = payment.rows[0];
    if (!row) throw new PaymentDomainError('NOT_FOUND', 'Payment was not found.');
    // The locked Payment serializes requests against the refundable balance.
    const already = await sql<{
      total: string;
    }>`select coalesce(sum(amount), 0)::text as total from payments.refunds where organization_id = ${input.organizationId} and payment_id = ${input.paymentId} and status in ('REQUESTED', 'PROCESSING', 'UNKNOWN_EXTERNAL_OUTCOME', 'COMPLETED')`.execute(
      transaction,
    );
    const permitted = await sql<{
      remaining: string;
    }>`select (${row.amount}::numeric - ${already.rows[0]!.total}::numeric)::text as remaining`.execute(
      transaction,
    );
    const accepted = await sql<{
      valid: boolean;
    }>`select ${amount}::numeric <= ${permitted.rows[0]!.remaining}::numeric as valid`.execute(
      transaction,
    );
    if (!accepted.rows[0]!.valid)
      throw new PaymentDomainError(
        'REFUND_EXCEEDS_REFUNDABLE',
        'Refund amount exceeds the remaining refundable payment balance.',
      );
    const created = await sql<{ id: string }>`
      insert into payments.refunds (organization_id, refund_number, order_id, payment_id, payment_method_id, currency_code, amount, reason_code, reason_text, requested_by_actor_id)
      values (${input.organizationId}, 'RFD-' || upper(replace(uuidv7()::text, '-', '')), ${row.order_id}, ${row.id}, ${row.payment_method_id}, ${row.currency_code}, ${amount}::numeric, ${input.reasonCode.trim()}, ${input.reasonText?.trim() ?? null}, ${input.actorId}) returning id
    `.execute(transaction);
    const refundId = created.rows[0]?.id;
    if (!refundId) throw new Error('Refund creation did not return an id.');
    await sql`
      insert into payments.refund_allocations (organization_id, refund_id, component_type, amount)
      values (${input.organizationId}, ${refundId}::uuid, 'ORDER_TOTAL', ${amount}::numeric)
    `.execute(transaction);
    await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = 'payments.refund', result_entity_id = ${refundId}::uuid, safe_response = ${JSON.stringify({ refundId })}::jsonb, completed_at = now() where id = ${recordId}`.execute(
      transaction,
    );
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.refund.created',
      targetType: 'payments.refund',
      targetId: refundId,
      metadata: { paymentId: input.paymentId, amount },
    });
    await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, 'payments.refund.created', 1, 'payments.refund', ${refundId}, 1, ${JSON.stringify({ refundId, paymentId: input.paymentId })}::jsonb, now())`.execute(
      transaction,
    );
    return getRefund(transaction, input.organizationId, refundId);
  });
}

/**
 * Creates the refund work that is inseparable from cancelling an Order which
 * has already collected money.  It deliberately works inside the caller's
 * transaction: Order cancellation, the refund obligation, and inventory
 * release must either all commit or all roll back together.
 */
export async function createCancellationRefundObligationsInTransaction(
  transaction: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    cancellationId: string;
    reasonText?: string;
  },
): Promise<readonly { refundId: string; amount: string }[]> {
  const payments = await sql<{
    id: string;
    currency_code: string;
    payment_method_id: string;
    allocated_amount: string;
  }>`
    select payment.id, payment.currency_code, payment.payment_method_id,
           allocation.amount::text as allocated_amount
    from payments.payment_allocations allocation
    join payments.payments payment
      on payment.organization_id = allocation.organization_id and payment.id = allocation.payment_id
    where allocation.organization_id = ${input.organizationId}
      and allocation.order_id = ${input.orderId}
      and payment.status = 'CONFIRMED'
    order by payment.id
    for update of payment
  `.execute(transaction);

  const obligations: { refundId: string; amount: string }[] = [];
  for (const payment of payments.rows) {
    // Locking the Payment above serializes this against normal refund creation.
    const committed = await sql<{ amount: string }>`
      select coalesce(sum(amount), 0)::text as amount
      from payments.refunds
      where organization_id = ${input.organizationId}
        and payment_id = ${payment.id}
        and status in ('REQUESTED', 'PROCESSING', 'UNKNOWN_EXTERNAL_OUTCOME', 'COMPLETED')
    `.execute(transaction);
    const remaining = await sql<{ amount: string }>`
      select greatest(${payment.allocated_amount}::numeric - ${committed.rows[0]?.amount ?? '0'}::numeric, 0)::text as amount
    `.execute(transaction);
    if (Number(remaining.rows[0]?.amount ?? 0) <= 0) continue;

    const created = await sql<{ id: string }>`
      insert into payments.refunds (
        organization_id, refund_number, order_id, payment_id, payment_method_id,
        currency_code, amount, reason_code, reason_text, requested_by_actor_id
      ) values (
        ${input.organizationId}, 'RFD-' || upper(replace(uuidv7()::text, '-', '')),
        ${input.orderId}, ${payment.id}, ${payment.payment_method_id}, ${payment.currency_code},
        ${remaining.rows[0]!.amount}::numeric, 'ORDER_CANCELLED', ${input.reasonText?.trim() ?? null},
        ${input.actorId}
      ) returning id
    `.execute(transaction);
    const refundId = created.rows[0]?.id;
    if (!refundId) throw new Error('Cancellation refund creation did not return an id.');
    await sql`
      insert into payments.refund_allocations (organization_id, refund_id, component_type, amount)
      values (${input.organizationId}, ${refundId}::uuid, 'ORDER_TOTAL', ${remaining.rows[0]!.amount}::numeric)
    `.execute(transaction);
    await sql`
      insert into orders.order_cancellation_refunds (organization_id, order_id, cancellation_id, refund_id)
      values (${input.organizationId}, ${input.orderId}, ${input.cancellationId}::uuid, ${refundId}::uuid)
    `.execute(transaction);
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.refund.created_for_order_cancellation',
      targetType: 'payments.refund',
      targetId: refundId,
      metadata: { orderId: input.orderId, paymentId: payment.id, amount: remaining.rows[0]!.amount },
    });
    await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, 'payments.refund.created', 1, 'payments.refund', ${refundId}, 1, ${JSON.stringify({ refundId, paymentId: payment.id, orderId: input.orderId, source: 'ORDER_CANCELLATION' })}::jsonb, now())`.execute(
      transaction,
    );
    obligations.push({ refundId, amount: remaining.rows[0]!.amount });
  }
  return obligations;
}

export async function completeManualRefund(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    refundId: string;
    externalReference: string;
    idempotencyKey: string;
    fault?: () => void;
  },
): Promise<RefundView> {
  const normalizedReference = normalizeExternalReference(input.externalReference);
  return db.transaction().execute(async (transaction) => {
    let recordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId,
        operationType: 'payments.refund-complete',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: `${input.refundId}:${normalizedReference}`,
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED')
          return getRefund(transaction, input.organizationId, input.refundId);
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'This refund completion is already in progress.',
        );
      }
      recordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was reused for different refund completion details.',
        );
      throw error;
    }
    const refund = await sql<{
      id: string;
      status: string;
    }>`select id, status from payments.refunds where organization_id = ${input.organizationId} and id = ${input.refundId} for update`.execute(
      transaction,
    );
    const row = refund.rows[0];
    if (!row) throw new PaymentDomainError('NOT_FOUND', 'Refund was not found.');
    if (row.status === 'COMPLETED')
      throw new PaymentDomainError(
        'REFUND_ALREADY_COMPLETED',
        'This refund has already been completed.',
      );
    if (!['REQUESTED', 'PROCESSING'].includes(row.status))
      throw new PaymentDomainError(
        'VALIDATION_FAILED',
        'This refund cannot be completed in its current state.',
      );
    await sql`update payments.refunds set status = 'COMPLETED', external_reference = ${input.externalReference.trim()}, normalized_external_reference = ${normalizedReference}, completed_at = now(), completed_by_actor_id = ${input.actorId}, version = version + 1, updated_at = now() where id = ${row.id}`.execute(
      transaction,
    );
    // A return's commercial state is a projection of linked financial records,
    // never an independently editable copy of refund truth.
    await sql`
      update returns.return_cases return_case
      set commercial_resolution_status = case
            when not exists (
              select 1
              from returns.return_refund_links link
              join payments.refunds linked_refund on linked_refund.id = link.refund_id
              where link.organization_id = return_case.organization_id
                and link.return_case_id = return_case.id
                and linked_refund.status <> 'COMPLETED'
            ) then 'REFUND_COMPLETED'
            else 'REFUND_PENDING'
          end,
          updated_at = now(), version = version + 1
      where return_case.organization_id = ${input.organizationId}
        and exists (
          select 1 from returns.return_refund_links link
          where link.organization_id = return_case.organization_id
            and link.return_case_id = return_case.id
            and link.refund_id = ${row.id}
        )
    `.execute(transaction);
    input.fault?.();
    await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = 'payments.refund', result_entity_id = ${row.id}::uuid, safe_response = ${JSON.stringify({ refundId: row.id })}::jsonb, completed_at = now() where id = ${recordId}`.execute(
      transaction,
    );
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.refund.completed',
      targetType: 'payments.refund',
      targetId: row.id,
    });
    await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, 'payments.refund.completed', 1, 'payments.refund', ${row.id}, 1, ${JSON.stringify({ refundId: row.id })}::jsonb, now())`.execute(
      transaction,
    );
    return getRefund(transaction, input.organizationId, row.id);
  });
}

export async function getRefund(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  refundId: string,
): Promise<RefundView> {
  const result = await sql<RefundRow>`
    select refund.id, refund.refund_number, refund.order_id, allocation.order_number_snapshot,
      refund.payment_id, payment.payment_number, refund.amount::text, refund.currency_code,
      refund.status, refund.reason_code, refund.external_reference, refund.requested_at,
      refund.completed_at, refund.version::text,
      finance_transaction.id as finance_transaction_id,
      finance_transaction.transaction_number as finance_transaction_number,
      financial_account.id as financial_account_id,
      financial_account.name as financial_account_name,
      finance_transaction.occurred_at as finance_posted_at
    from payments.refunds refund
    join payments.payments payment on payment.id = refund.payment_id
    join payments.payment_allocations allocation on allocation.payment_id = payment.id
    left join finance.finance_transactions finance_transaction
      on finance_transaction.organization_id = refund.organization_id
      and finance_transaction.transaction_type = 'REFUND_SOURCE_POSTING'
      and finance_transaction.source_domain = 'payments.refund'
      and finance_transaction.source_id = refund.id
    left join finance.financial_account_entries finance_entry on finance_entry.finance_transaction_id = finance_transaction.id
    left join finance.financial_accounts financial_account on financial_account.id = finance_entry.financial_account_id
    where refund.organization_id = ${organizationId} and refund.id = ${refundId}
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new PaymentDomainError('NOT_FOUND', 'Refund was not found.');
  return refundView(row);
}

export async function listRefunds(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  filters: RefundListFilters = {},
): Promise<PaginatedResultView<RefundView>> {
  const { page, pageSize, offset } = normalizedPage(filters);
  const query = filters.query?.trim() || null;
  const status = filters.status?.trim() || 'ALL';
  const posting = filters.posting ?? 'ALL';
  const from = filters.from ?? null;
  const to = filters.to ?? null;
  const [result, countResult] = await Promise.all([
    sql<RefundRow>`
      select refund.id, refund.refund_number, refund.order_id, allocation.order_number_snapshot,
        refund.payment_id, payment.payment_number, refund.amount::text, refund.currency_code,
        refund.status, refund.reason_code, refund.external_reference, refund.requested_at,
        refund.completed_at, refund.version::text,
        finance_transaction.id as finance_transaction_id,
        finance_transaction.transaction_number as finance_transaction_number,
        financial_account.id as financial_account_id,
        financial_account.name as financial_account_name,
        finance_transaction.occurred_at as finance_posted_at
      from payments.refunds refund
      join payments.payments payment on payment.id = refund.payment_id
      join payments.payment_allocations allocation on allocation.payment_id = payment.id
      left join finance.finance_transactions finance_transaction
        on finance_transaction.organization_id = refund.organization_id
        and finance_transaction.transaction_type = 'REFUND_SOURCE_POSTING'
        and finance_transaction.source_domain = 'payments.refund'
        and finance_transaction.source_id = refund.id
      left join finance.financial_account_entries finance_entry on finance_entry.finance_transaction_id = finance_transaction.id
      left join finance.financial_accounts financial_account on financial_account.id = finance_entry.financial_account_id
      where refund.organization_id = ${organizationId}
        and (${query}::text is null or concat_ws(' ', refund.refund_number, allocation.order_number_snapshot, payment.payment_number, refund.external_reference, refund.reason_code) ilike '%' || ${query}::text || '%')
        and (${status}::text = 'ALL' or refund.status = ${status}::text)
        and (${from}::text is null or refund.requested_at >= ${from}::timestamptz)
        and (${to}::text is null or refund.requested_at <= ${to}::timestamptz)
        and (${posting}::text = 'ALL' or (${posting}::text = 'POSTED' and finance_transaction.id is not null) or (${posting}::text = 'UNPOSTED' and finance_transaction.id is null))
      order by refund.requested_at desc, refund.id desc
      limit ${pageSize} offset ${offset}
    `.execute(db),
    sql<{ total: string }>`
      select count(distinct refund.id)::text as total
      from payments.refunds refund
      join payments.payments payment on payment.id = refund.payment_id
      join payments.payment_allocations allocation on allocation.payment_id = payment.id
      left join finance.finance_transactions finance_transaction
        on finance_transaction.organization_id = refund.organization_id
        and finance_transaction.transaction_type = 'REFUND_SOURCE_POSTING'
        and finance_transaction.source_domain = 'payments.refund'
        and finance_transaction.source_id = refund.id
      where refund.organization_id = ${organizationId}
        and (${query}::text is null or concat_ws(' ', refund.refund_number, allocation.order_number_snapshot, payment.payment_number, refund.external_reference, refund.reason_code) ilike '%' || ${query}::text || '%')
        and (${status}::text = 'ALL' or refund.status = ${status}::text)
        and (${from}::text is null or refund.requested_at >= ${from}::timestamptz)
        and (${to}::text is null or refund.requested_at <= ${to}::timestamptz)
        and (${posting}::text = 'ALL' or (${posting}::text = 'POSTED' and finance_transaction.id is not null) or (${posting}::text = 'UNPOSTED' and finance_transaction.id is null))
    `.execute(db),
  ]);
  const totalItems = Number(countResult.rows[0]?.total ?? 0);
  return { items: result.rows.map(refundView), pagination: pagination(page, pageSize, totalItems) };
}

export async function getPaymentDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  paymentId: string,
): Promise<PaymentDetailView> {
  const [payment, context, refundIds] = await Promise.all([
    getPayment(db, organizationId, paymentId),
    sql<{
      order_status: string;
      order_total: string;
      order_currency: string;
      payment_method: PaymentMethodCode;
      customer_id: string | null;
      customer_name: string;
      customer_phone: string;
      customer_email: string | null;
      source_attempt_id: string | null;
      attempt_submitted_at: Date | null;
      source_delivery_id: string | null;
      delivery_number: string | null;
      carrier_name: string | null;
      tracking_reference: string | null;
      delivered_at: Date | null;
    }>`
      select order_row.order_status, order_row.total_amount::text as order_total,
        order_row.currency_code as order_currency, order_row.payment_method,
        customer.customer_id, customer.display_name as customer_name,
        customer.phone as customer_phone, customer.email as customer_email,
        payment.source_attempt_id, attempt.submitted_at as attempt_submitted_at,
        payment.source_delivery_id, delivery.delivery_number,
        delivery.manual_carrier_name as carrier_name, delivery.tracking_reference,
        delivery.delivered_at
      from payments.payments payment
      join payments.payment_allocations allocation
        on allocation.organization_id = payment.organization_id and allocation.payment_id = payment.id
      join orders.orders order_row
        on order_row.organization_id = allocation.organization_id and order_row.id = allocation.order_id
      join orders.order_customer_snapshots customer
        on customer.organization_id = order_row.organization_id and customer.order_id = order_row.id
      left join payments.payment_attempts attempt on attempt.id = payment.source_attempt_id
      left join delivery.deliveries delivery on delivery.id = payment.source_delivery_id
      where payment.organization_id = ${organizationId} and payment.id = ${paymentId}
      limit 1
    `.execute(db),
    sql<{ id: string }>`
      select id from payments.refunds
      where organization_id = ${organizationId} and payment_id = ${paymentId}
      order by requested_at desc, id desc
    `.execute(db),
  ]);
  const row = context.rows[0];
  if (!row) throw new PaymentDomainError('NOT_FOUND', 'Payment context was not found.');
  const [summary, refunds] = await Promise.all([
    getOrderPaymentSummary(db, {
      organizationId,
      orderId: payment.orderId,
      paymentMethod: row.payment_method,
      expectedAmount: row.order_total,
    }),
    Promise.all(refundIds.rows.map((refund) => getRefund(db, organizationId, refund.id))),
  ]);
  const source: PaymentDetailView['source'] = row.source_attempt_id
    ? {
        type: 'MANUAL_SUBMISSION',
        id: row.source_attempt_id,
        submittedAt: row.attempt_submitted_at?.toISOString() ?? payment.confirmedAt,
      }
    : {
        type: 'COD_COLLECTION',
        id: row.source_delivery_id as string,
        deliveryNumber: row.delivery_number ?? 'Delivery',
        carrierName: row.carrier_name,
        trackingReference: row.tracking_reference,
        deliveredAt: row.delivered_at?.toISOString() ?? null,
      };
  return {
    ...payment,
    order: {
      status: row.order_status,
      total: row.order_total,
      currency: row.order_currency,
      paymentStatus: summary.status,
      collected: summary.collected,
      outstanding: summary.outstanding,
    },
    customer: {
      id: row.customer_id,
      name: row.customer_name,
      phone: row.customer_phone,
      email: row.customer_email,
    },
    source,
    refunds,
  };
}
