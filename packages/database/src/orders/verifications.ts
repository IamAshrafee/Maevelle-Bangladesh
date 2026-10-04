import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import { OrderDomainError } from './types.js';

export type OrderVerificationType =
  | 'PHONE_CALL'
  | 'WHATSAPP_MESSAGE'
  | 'SMS_CONFIRMATION'
  | 'FRAUD_RISK_REVIEW'
  | 'MANUAL_APPROVAL';

export type OrderVerificationOutcome =
  | 'CONFIRMED'
  | 'UNREACHABLE'
  | 'WRONG_NUMBER'
  | 'CANCEL_REQUESTED'
  | 'ADDRESS_CORRECTION_REQUESTED'
  | 'FLAGGED_SUSPICIOUS'
  | 'APPROVED_OVERRIDE';

export interface RecordOrderVerificationInput {
  readonly organizationId: string;
  readonly orderId: string;
  readonly actorId: string;
  readonly verificationType: OrderVerificationType;
  readonly outcome: OrderVerificationOutcome;
  readonly notes?: string;
  readonly riskSnapshot?: Record<string, unknown>;
}

export interface OrderVerificationView {
  readonly id: string;
  readonly orderId: string;
  readonly actorId: string;
  readonly actorName?: string | null;
  readonly verificationType: OrderVerificationType;
  readonly outcome: OrderVerificationOutcome;
  readonly notes: string | null;
  readonly riskSnapshot: Record<string, unknown> | null;
  readonly createdAt: string;
}

const ALLOWED_TYPES = new Set<OrderVerificationType>([
  'PHONE_CALL',
  'WHATSAPP_MESSAGE',
  'SMS_CONFIRMATION',
  'FRAUD_RISK_REVIEW',
  'MANUAL_APPROVAL',
]);

const ALLOWED_OUTCOMES = new Set<OrderVerificationOutcome>([
  'CONFIRMED',
  'UNREACHABLE',
  'WRONG_NUMBER',
  'CANCEL_REQUESTED',
  'ADDRESS_CORRECTION_REQUESTED',
  'FLAGGED_SUSPICIOUS',
  'APPROVED_OVERRIDE',
]);

/**
 * Records an operational verification or customer contact event before dispatch.
 * Distinct from general notes: verifications represent structured COD confirmation
 * checks, call attempts, or fraud review decisions.
 */
export async function recordOrderVerification(
  db: Kysely<DatabaseSchema>,
  input: RecordOrderVerificationInput,
): Promise<OrderVerificationView> {
  if (!ALLOWED_TYPES.has(input.verificationType)) {
    throw new OrderDomainError(
      'VALIDATION_FAILED',
      `Invalid verification type: ${input.verificationType}`,
    );
  }
  if (!ALLOWED_OUTCOMES.has(input.outcome)) {
    throw new OrderDomainError(
      'VALIDATION_FAILED',
      `Invalid verification outcome: ${input.outcome}`,
    );
  }

  return db.transaction().execute(async (transaction) => {
    const order = await sql<{ id: string; order_number: string; order_status: string }>`
      select id, order_number, order_status
      from orders.orders
      where organization_id = ${input.organizationId} and id = ${input.orderId}
      for update
    `.execute(transaction);

    const row = order.rows[0];
    if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');

    const notesClean = input.notes?.trim() || null;

    const inserted = await sql<{
      id: string;
      order_id: string;
      actor_id: string;
      verification_type: OrderVerificationType;
      outcome: OrderVerificationOutcome;
      notes: string | null;
      risk_snapshot: Record<string, unknown> | null;
      created_at: Date;
    }>`
      insert into orders.order_verifications (
        organization_id, order_id, actor_id, verification_type, outcome, notes, risk_snapshot
      ) values (
        ${input.organizationId}, ${input.orderId}, ${input.actorId},
        ${input.verificationType}, ${input.outcome}, ${notesClean},
        ${input.riskSnapshot ? JSON.stringify(input.riskSnapshot) : null}::jsonb
      )
      returning id, order_id, actor_id, verification_type, outcome, notes, risk_snapshot, created_at
    `.execute(transaction);

    const result = inserted.rows[0]!;

    // Resolve actor name if available
    const actorRow = await sql<{ display_name: string | null }>`
      select coalesce(u.name, u.email) as display_name
      from iam.users u
      where u.id = ${input.actorId}
    `.execute(transaction);

    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'orders.order.verified',
      targetType: 'orders.order',
      targetId: input.orderId,
      metadata: {
        verificationId: result.id,
        verificationType: input.verificationType,
        outcome: input.outcome,
        hasNotes: Boolean(notesClean),
      },
    });

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id,
        aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'orders.order.verified', 1, 'orders.order', ${input.orderId}, 1,
        ${JSON.stringify({
          orderId: input.orderId,
          verificationId: result.id,
          verificationType: input.verificationType,
          outcome: input.outcome,
          actorId: input.actorId,
        })}::jsonb,
        now()
      )
    `.execute(transaction);

    return {
      id: result.id,
      orderId: result.order_id,
      actorId: result.actor_id,
      actorName: actorRow.rows[0]?.display_name ?? null,
      verificationType: result.verification_type,
      outcome: result.outcome,
      notes: result.notes,
      riskSnapshot: result.risk_snapshot,
      createdAt: result.created_at.toISOString(),
    };
  });
}

/**
 * Lists all verification records for an order.
 */
export async function listOrderVerifications(
  db: Kysely<DatabaseSchema>,
  input: {
    readonly organizationId: string;
    readonly orderId: string;
  },
): Promise<readonly OrderVerificationView[]> {
  const rows = await sql<{
    id: string;
    order_id: string;
    actor_id: string;
    actor_name: string | null;
    verification_type: OrderVerificationType;
    outcome: OrderVerificationOutcome;
    notes: string | null;
    risk_snapshot: Record<string, unknown> | null;
    created_at: Date;
  }>`
    select v.id, v.order_id, v.actor_id,
           coalesce(u.name, u.email) as actor_name,
           v.verification_type, v.outcome, v.notes, v.risk_snapshot, v.created_at
    from orders.order_verifications v
    left join iam.users u on u.id = v.actor_id
    where v.organization_id = ${input.organizationId} and v.order_id = ${input.orderId}
    order by v.created_at desc
  `.execute(db);

  return rows.rows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    verificationType: r.verification_type,
    outcome: r.outcome,
    notes: r.notes,
    riskSnapshot: r.risk_snapshot,
    createdAt: r.created_at.toISOString(),
  }));
}
