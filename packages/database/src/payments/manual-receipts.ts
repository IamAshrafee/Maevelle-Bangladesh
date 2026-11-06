import { appendPaymentOperationEvent } from './events.js';
import { sql, type Kysely } from 'kysely';
import type { IndependentReceiptEvidenceDto, VerifiedReceiptDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { PaymentDomainError, getPayment, type PaymentView } from '../payments.js';
import { claimIdempotencyRecord, IdempotencyKeyReuseError } from '../platform.js';
import { postVerifiedReceiptInTransaction } from '../finance.js';
import { requirePaymentCapability } from './authorization.js';
import { hashToken } from '@maevelle/security';

type Context = { organizationId: string; actorId: string };
function validEvidence(
  e: IndependentReceiptEvidenceDto | undefined,
): asserts e is IndependentReceiptEvidenceDto {
  if (
    !e ||
    !/^[A-Za-z0-9-]{4,128}$/.test(e.transactionId) ||
    !/^01[3-9]\d{8}$/.test(e.receivingNumber) ||
    e.currency !== 'BDT' ||
    !['ACCOUNT_HISTORY', 'PROVIDER_STATEMENT'].includes(e.source) ||
    !e.evidenceReference.trim() ||
    e.evidenceReference.length > 512 ||
    !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(e.valueTime) ||
    !Number.isFinite(Date.parse(e.valueTime)) ||
    !e.financialAccountId
  )
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'Independent account-history or statement evidence is required.',
    );
}
/** Lock order: membership -> Order -> intent -> attempt -> receipt fence -> Finance account.
 * Cancellation/expiry lock the same Order first; real late funds never resurrect it.
 */
export async function verifyManualPayment(
  db: Kysely<DatabaseSchema>,
  input: Context & {
    attemptId: string;
    confirmedAmount: string;
    idempotencyKey: string;
    evidence?: IndependentReceiptEvidenceDto;
    fault?: () => void;
  },
): Promise<PaymentView> {
  validEvidence(input.evidence);
  const evidence = input.evidence;
  if (
    !/^\d{1,16}(?:\.\d{1,4})?$/.test(input.confirmedAmount) ||
    !/[1-9]/.test(input.confirmedAmount)
  )
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'Actual credited amount must be positive exact money.',
    );
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 128)
    throw new PaymentDomainError('VALIDATION_FAILED', 'A bounded idempotency key is required.');
  try {
    return await db.transaction().execute(async (tx) => {
      await sql`set local lock_timeout='3s'`.execute(tx);
      await sql`set local statement_timeout='10s'`.execute(tx);
      await requirePaymentCapability(tx, input.organizationId, input.actorId, 'payments.verify');
      const claim = await claimIdempotencyRecord(tx, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId,
        operationType: 'payments.manual-verification',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: hashToken(
          JSON.stringify([
            input.attemptId,
            input.confirmedAmount,
            evidence.transactionId,
            evidence.receivingNumber,
            evidence.currency,
            evidence.valueTime,
            evidence.source,
            evidence.evidenceReference,
            evidence.financialAccountId,
          ]),
        ),
      });
      if (!claim.created) {
        const result = (
          await sql<{
            id: string;
          }>`select result_entity_id::text id from platform.idempotency_records
        where id=${claim.id} and status='SUCCEEDED'`.execute(tx)
        ).rows[0];
        if (result) return getPayment(tx, input.organizationId, result.id);
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'Verification is already in progress. Retry the same request.',
        );
      }
      const link = (
        await sql<{
          order_id: string;
          intent_id: string;
        }>`select i.order_id,i.id intent_id from payments.payment_attempts a
      join payments.payment_intents i on i.organization_id=a.organization_id and i.id=a.payment_intent_id
      where a.organization_id=${input.organizationId} and a.id=${input.attemptId}`.execute(tx)
      ).rows[0];
      if (!link) throw new PaymentDomainError('NOT_FOUND', 'Payment claim was not found.');
      const order = (
        await sql<{ order_status: string }>`select order_status from orders.orders
      where organization_id=${input.organizationId} and id=${link.order_id} for update`.execute(tx)
      ).rows[0]!;
      const intent = (
        await sql<{
          id: string;
          expected_amount: string;
          status: string;
          order_number_snapshot: string;
          payment_method_id: string;
          instructions_snapshot: {
            accountNumber?: string;
            receivingNumber?: string;
            financialAccountId?: string;
          };
          currency_code: string;
          destination_id: string | null;
        }>`select * from payments.payment_intents where organization_id=${input.organizationId} and id=${link.intent_id} for update`.execute(
          tx,
        )
      ).rows[0]!;
      const attempt = (
        await sql<{
          status: string;
          customer_reference: string;
          normalized_reference: string;
        }>`select status,customer_reference,normalized_reference
      from payments.payment_attempts where organization_id=${input.organizationId} and id=${input.attemptId} for update`.execute(
          tx,
        )
      ).rows[0]!;
      if (attempt.status === 'VERIFIED') {
        const prior = (
          await sql<{
            id: string;
          }>`select p.id from payments.payments p join payments.verified_receipt_evidence e
          on e.organization_id=p.organization_id and e.payment_id=p.id where p.organization_id=${input.organizationId}
          and p.source_attempt_id=${input.attemptId} and p.amount=${input.confirmedAmount}::numeric
          and e.actual_transaction_id=${evidence.transactionId} and e.receiving_number=${evidence.receivingNumber}
          and e.value_time=${evidence.valueTime}::timestamptz and e.evidence_source=${evidence.source}
          and e.evidence_reference=${evidence.evidenceReference} and e.financial_account_id=${evidence.financialAccountId}`.execute(
            tx,
          )
        ).rows[0];
        if (prior) {
          await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_type='payments.payment',result_entity_id=${prior.id},completed_at=now()
            where id=${claim.id}`.execute(tx);
          return getPayment(tx, input.organizationId, prior.id);
        }
      }
      if (attempt.status !== 'PENDING_VERIFICATION')
        throw new PaymentDomainError(
          'PAYMENT_ATTEMPT_ALREADY_REVIEWED',
          'This claim has already been reviewed.',
        );
      const method = (
        await sql<{
          code: string;
        }>`select code from payments.payment_methods where organization_id=${input.organizationId}
      and id=${intent.payment_method_id}`.execute(tx)
      ).rows[0]!;
      if (method.code === 'COD')
        throw new PaymentDomainError(
          'VALIDATION_FAILED',
          'COD requires actual delivery collection semantics.',
        );
      if (
        intent.currency_code !== evidence.currency ||
        evidence.receivingNumber !==
          (intent.instructions_snapshot.receivingNumber ??
            intent.instructions_snapshot.accountNumber) ||
        evidence.transactionId !== attempt.customer_reference ||
        (intent.instructions_snapshot.financialAccountId &&
          intent.instructions_snapshot.financialAccountId !== evidence.financialAccountId)
      )
        throw new PaymentDomainError(
          'VALIDATION_FAILED',
          'The independently checked transaction, destination or currency does not match. Request corrected details.',
        );
      const valueTime = (
        await sql<{
          valid: boolean;
        }>`select ${evidence.valueTime}::timestamptz<=now() as valid`.execute(tx)
      ).rows[0]!;
      if (!valueTime.valid)
        throw new PaymentDomainError(
          'VALIDATION_FAILED',
          'Receipt value time cannot be in the future.',
        );
      // Preserve conservative legacy normalization as an additional local fence;
      // never infer provider-global uniqueness or rewrite the actual reference.
      const duplicate = (
        await sql`select 1 from payments.receipt_reference_fences where organization_id=${input.organizationId}
      and payment_method_id=${intent.payment_method_id} and reference=${attempt.normalized_reference}`.execute(
          tx,
        )
      ).rows[0];
      if (duplicate)
        throw new PaymentDomainError(
          'DUPLICATE_EXTERNAL_TRANSACTION',
          'This transaction reference has permanent financial history.',
        );
      const late =
        ['CANCELLED', 'EXPIRED'].includes(intent.status) ||
        ['CANCELLED', 'COMPLETED'].includes(order.order_status);
      const amounts = (
        await sql<{ allocated: string; unallocated: string; outstanding: string }>`with prior as (
      select coalesce(sum(a.amount),0) amount from payments.payment_allocations a join payments.payments p
        on p.organization_id=a.organization_id and p.id=a.payment_id
      where a.organization_id=${input.organizationId} and a.order_id=${link.order_id} and p.status='CONFIRMED'
    ), allocation as (select case when ${late} then 0 else least(${input.confirmedAmount}::numeric,
      greatest(${intent.expected_amount}::numeric-prior.amount,0)) end amount from prior)
    select allocation.amount::numeric(20,4)::text allocated,(${input.confirmedAmount}::numeric-allocation.amount)::numeric(20,4)::text unallocated,
      greatest(${intent.expected_amount}::numeric-prior.amount-allocation.amount,0)::numeric(20,4)::text outstanding from allocation,prior`.execute(
          tx,
        )
      ).rows[0]!;
      const payment = (
        await sql<{
          id: string;
        }>`insert into payments.payments(organization_id,payment_number,payment_method_id,currency_code,amount,
      external_reference,normalized_external_reference,source_attempt_id,confirmed_by_actor_id)
      values(${input.organizationId},'PAY-'||upper(replace(uuidv7()::text,'-','')),${intent.payment_method_id},'BDT',${input.confirmedAmount}::numeric,
      ${evidence.transactionId},${attempt.normalized_reference},${input.attemptId},${input.actorId}) returning id`.execute(
          tx,
        )
      ).rows[0]!;
      if (amounts.allocated !== '0.0000')
        await sql`insert into payments.payment_allocations(organization_id,payment_id,order_id,order_number_snapshot,amount)
      values(${input.organizationId},${payment.id},${link.order_id},${intent.order_number_snapshot},${amounts.allocated}::numeric)`.execute(
          tx,
        );
      const disposition = late
        ? 'LATE_RECEIPT_LIABILITY'
        : amounts.unallocated === '0.0000'
          ? 'ALLOCATED'
          : 'EXCESS_LIABILITY';
      await sql`insert into payments.verified_receipt_evidence(organization_id,payment_id,order_id,actual_transaction_id,receiving_number,currency_code,
      value_time,evidence_source,evidence_reference,financial_account_id,reviewer_id,allocated_amount,unallocated_amount,disposition)
      values(${input.organizationId},${payment.id},${link.order_id},${evidence.transactionId},${evidence.receivingNumber},'BDT',${evidence.valueTime}::timestamptz,
      ${evidence.source},${evidence.evidenceReference},${evidence.financialAccountId},${input.actorId},${amounts.allocated}::numeric,${amounts.unallocated}::numeric,${disposition})`.execute(
        tx,
      );
      await postVerifiedReceiptInTransaction(tx, {
        ...input,
        paymentId: payment.id,
        accountId: evidence.financialAccountId,
        amount: input.confirmedAmount,
        currency: 'BDT',
      });
      await sql`update payments.payment_attempts set status='VERIFIED',review_state='RESOLVED',resolved_at=now(),reviewed_by_actor_id=${input.actorId},
      version=version+1 where organization_id=${input.organizationId} and id=${input.attemptId}`.execute(
        tx,
      );
      if (!late)
        await sql`update payments.payment_intents set status=case when ${amounts.outstanding}::numeric=0 then 'SATISFIED' else status end,
      version=version+1,updated_at=now() where organization_id=${input.organizationId} and id=${link.intent_id}`.execute(
          tx,
        );
      input.fault?.();
      await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_type='payments.payment',result_entity_id=${payment.id},
      safe_response=${JSON.stringify({ paymentId: payment.id })}::jsonb,completed_at=now() where id=${claim.id}`.execute(
        tx,
      );
      await appendPaymentOperationEvent(tx, input, payment.id, 'payments.payment.verified', {
        paymentId: payment.id,
        orderId: link.order_id,
        disposition,
      });
      return getPayment(tx, input.organizationId, payment.id);
    });
  } catch (error) {
    if (error instanceof IdempotencyKeyReuseError)
      throw new PaymentDomainError(
        'IDEMPOTENCY_CONFLICT',
        'The key was reused with different receipt evidence.',
      );
    if ((error as { code?: string }).code === '23505')
      throw new PaymentDomainError(
        'DUPLICATE_EXTERNAL_TRANSACTION',
        'The external receipt already has financial history.',
      );
    throw error;
  }
}
export async function getVerifiedReceipt(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  paymentId: string,
): Promise<VerifiedReceiptDto> {
  const row = (
    await sql<VerifiedReceiptDto>`select p.id as "paymentId",e.order_id as "orderId",p.amount::text received,
    e.allocated_amount::text allocated,e.unallocated_amount::text unallocated,
    (case when p.status='REVERSED' then 0 else greatest(e.unallocated_amount-coalesce((select sum(a.amount)
      from payments.refund_allocations a join payments.refunds r on r.organization_id=a.organization_id and r.id=a.refund_id
      where r.organization_id=e.organization_id and r.payment_id=e.payment_id and r.status='COMPLETED'
      and a.component_type='UNALLOCATED_RECEIPT'),0),0) end)::numeric(20,4)::text as "remainingUnallocated",e.disposition,p.status='REVERSED' reversed,e.reviewer_id as "verifiedBy"
    from payments.verified_receipt_evidence e join payments.payments p on p.organization_id=e.organization_id and p.id=e.payment_id
    where e.organization_id=${organizationId} and e.payment_id=${paymentId}`.execute(db)
  ).rows[0];
  if (!row) throw new PaymentDomainError('NOT_FOUND', 'Verified receipt was not found.');
  return row;
}
