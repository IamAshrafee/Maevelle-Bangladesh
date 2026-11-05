import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { PaymentDomainError, getRefund } from '../payments.js';
import { requirePaymentCapability } from './authorization.js';
import { appendAuditEvent } from '../platform.js';

export async function changeRefundProcessingState(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    refundId: string;
    expectedVersion: number;
    state: 'PROCESSING' | 'UNKNOWN_EXTERNAL_OUTCOME' | 'FAILED' | 'CANCELLED_BEFORE_PROCESSING';
    evidenceReference: string;
  },
) {
  if (!input.evidenceReference.trim() || input.evidenceReference.length > 512)
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'An independent processing or reconciliation reference is required.',
    );
  return db.transaction().execute(async (tx) => {
    await requirePaymentCapability(tx, input.organizationId, input.actorId, 'refunds.manage');
    const link = (
      await sql<{
        payment_id: string;
      }>`select payment_id from payments.refunds where organization_id=${input.organizationId} and id=${input.refundId}`.execute(
        tx,
      )
    ).rows[0];
    if (!link) throw new PaymentDomainError('NOT_FOUND', 'Refund was not found.');
    await sql`select id from payments.payments where organization_id=${input.organizationId} and id=${link.payment_id} for update`.execute(
      tx,
    );
    const row = (
      await sql<{
        status: string;
        version: string;
      }>`select status,version::text from payments.refunds where organization_id=${input.organizationId}
      and id=${input.refundId} for update`.execute(tx)
    ).rows[0]!;
    if (Number(row.version) !== input.expectedVersion)
      throw new PaymentDomainError('CONFLICT', 'Refund changed. Reload before reconciling.');
    const allowed: Record<string, readonly string[]> = {
      REQUESTED: ['PROCESSING', 'CANCELLED_BEFORE_PROCESSING'],
      PROCESSING: ['UNKNOWN_EXTERNAL_OUTCOME', 'FAILED'],
      UNKNOWN_EXTERNAL_OUTCOME: ['FAILED'],
    };
    if (!allowed[row.status]?.includes(input.state))
      throw new PaymentDomainError(
        'CONFLICT',
        'This refund transition is unsafe. Unknown transfers require reconciliation before retry.',
      );
    await sql`update payments.refunds set status=${input.state},version=version+1,updated_at=now() where organization_id=${input.organizationId} and id=${input.refundId}`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.refund.processing_changed',
      targetType: 'payments.refund',
      targetId: input.refundId,
      metadata: { from: row.status, to: input.state, evidenceReference: input.evidenceReference },
    });
    return getRefund(tx, input.organizationId, input.refundId);
  });
}
