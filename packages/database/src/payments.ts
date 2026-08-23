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
  readonly displayOrder: number;
  readonly version: number;
}

export interface PaymentSummary {
  readonly method: PaymentMethodCode;
  readonly status:
    'UNPAID' | 'PAYMENT_PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
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

export interface PaymentView {
  readonly id: string;
  readonly paymentNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly method: PaymentMethodCode;
  readonly amount: string;
  readonly currency: string;
  readonly externalReference: string;
  readonly confirmedAt: string;
  readonly refunded: string;
  readonly net: string;
}

export interface RefundView {
  readonly id: string;
  readonly refundNumber: string;
  readonly orderId: string;
  readonly paymentId: string;
  readonly amount: string;
  readonly status: string;
  readonly reasonCode: string;
  readonly externalReference: string | null;
  readonly requestedAt: string;
  readonly completedAt: string | null;
  readonly version: number;
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
    display_order: number;
    version: string;
  }>`
    select id, code, name, method_type, status, public_instructions, display_order, version::text
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
    displayOrder: number;
  },
): Promise<PaymentMethodView> {
  if (!input.name.trim() || !Number.isInteger(input.displayOrder))
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'Payment method name and display order are required.',
    );
  const methodType = input.code === 'COD' ? 'COD' : 'MOBILE_WALLET';
  return db.transaction().execute(async (transaction) => {
    const result = await sql<{
      id: string;
      code: PaymentMethodCode;
      name: string;
      method_type: 'COD' | 'MOBILE_WALLET';
      status: 'ACTIVE' | 'DISABLED';
      public_instructions: unknown;
      display_order: number;
      version: string;
    }>`
      insert into payments.payment_methods (organization_id, code, name, method_type, status, public_instructions, display_order)
      values (${input.organizationId}, ${input.code}, ${input.name.trim()}, ${methodType}, ${input.status}, ${JSON.stringify(input.instructions ?? {})}::jsonb, ${input.displayOrder})
      on conflict (organization_id, code) do update set name = excluded.name, status = excluded.status,
        public_instructions = excluded.public_instructions, display_order = excluded.display_order,
        version = payments.payment_methods.version + 1, updated_at = now()
      returning id, code, name, method_type, status, public_instructions, display_order, version::text
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
      metadata: { code: input.code, status: input.status },
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
    insert into payments.payment_intents (organization_id, order_id, order_number_snapshot, payment_method_id, currency_code, expected_amount, status, instructions_snapshot)
    values (${input.organizationId}, ${input.orderId}, ${input.orderNumber}, ${method.id}, ${input.currency}, ${input.expectedAmount}::numeric, 'READY', ${JSON.stringify(method.instructions)}::jsonb)
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
    }>`select id from payments.payment_intents where id = ${row.intent_id} for update`.execute(
      transaction,
    );
    if (!intent.rows[0]) throw new PaymentDomainError('NOT_FOUND', 'Payment intent was not found.');
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
  const result = await sql<{
    id: string;
    payment_number: string;
    order_id: string;
    order_number_snapshot: string;
    code: PaymentMethodCode;
    amount: string;
    currency_code: string;
    external_reference: string;
    confirmed_at: Date;
    refunded: string;
  }>`
    select payment.id, payment.payment_number, allocation.order_id, allocation.order_number_snapshot, method.code, payment.amount::text, payment.currency_code,
      payment.external_reference, payment.confirmed_at, coalesce(sum(refund.amount) filter (where refund.status = 'COMPLETED'), 0)::numeric(20,4)::text as refunded
    from payments.payments payment join payments.payment_allocations allocation on allocation.payment_id = payment.id
    join payments.payment_methods method on method.id = payment.payment_method_id
    left join payments.refunds refund on refund.payment_id = payment.id
    where payment.organization_id = ${organizationId} and payment.id = ${paymentId}
    group by payment.id, allocation.order_id, allocation.order_number_snapshot, method.code
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new PaymentDomainError('NOT_FOUND', 'Payment was not found.');
  const net = await sql<{
    net: string;
  }>`select greatest(${row.amount}::numeric - ${row.refunded}::numeric, 0)::text as net`.execute(
    db,
  );
  return {
    id: row.id,
    paymentNumber: row.payment_number,
    orderId: row.order_id,
    orderNumber: row.order_number_snapshot,
    method: row.code,
    amount: row.amount,
    currency: row.currency_code,
    externalReference: row.external_reference,
    confirmedAt: row.confirmed_at.toISOString(),
    refunded: row.refunded,
    net: net.rows[0]!.net,
  };
}

export async function listPayments(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly PaymentView[]> {
  const ids = await sql<{
    id: string;
  }>`select id from payments.payments where organization_id = ${organizationId} and status = 'CONFIRMED' order by confirmed_at desc, id desc limit 100`.execute(
    db,
  );
  return Promise.all(ids.rows.map((row) => getPayment(db, organizationId, row.id)));
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
  const result = await sql<{
    id: string;
    refund_number: string;
    order_id: string;
    payment_id: string;
    amount: string;
    status: string;
    reason_code: string;
    external_reference: string | null;
    requested_at: Date;
    completed_at: Date | null;
    version: string;
  }>`
    select id, refund_number, order_id, payment_id, amount::text, status, reason_code, external_reference, requested_at, completed_at, version::text
    from payments.refunds where organization_id = ${organizationId} and id = ${refundId}
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new PaymentDomainError('NOT_FOUND', 'Refund was not found.');
  return {
    id: row.id,
    refundNumber: row.refund_number,
    orderId: row.order_id,
    paymentId: row.payment_id,
    amount: row.amount,
    status: row.status,
    reasonCode: row.reason_code,
    externalReference: row.external_reference,
    requestedAt: row.requested_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    version: Number(row.version),
  };
}

export async function listRefunds(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly RefundView[]> {
  const ids = await sql<{
    id: string;
  }>`select id from payments.refunds where organization_id = ${organizationId} order by requested_at desc, id desc limit 100`.execute(
    db,
  );
  return Promise.all(ids.rows.map((row) => getRefund(db, organizationId, row.id)));
}
