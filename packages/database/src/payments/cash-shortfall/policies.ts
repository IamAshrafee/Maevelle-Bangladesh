import { sql, type Kysely } from 'kysely';
import type { CashShortfallPolicyInputDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../../index.js';
import { PaymentDomainError } from '../../payments.js';
import { requirePaymentCapability } from '../authorization.js';
import { appendAuditEvent } from '../../platform.js';
import { parseMoney } from '../../cart/value.js';

export function validateCashPolicy(input: CashShortfallPolicyInputDto) {
  const max = parseMoney(input.maximumPerAdjustment),
    order = parseMoney(input.maximumPerOrder),
    day = parseMoney(input.maximumPerStaffDay),
    self = parseMoney(input.selfApprovalLimit);
  if (
    !input.revision.trim() ||
    input.revision.length > 64 ||
    !['SYNTHETIC', 'BUSINESS'].includes(input.scope) ||
    max <= 0n ||
    [max, order, day, self].some((n) => n % 10000n !== 0n) ||
    order < max ||
    day < max ||
    self > max ||
    !input.allowedOrderStates.length ||
    input.allowedOrderStates.some((s) => !['PENDING', 'CONFIRMED', 'COMPLETED'].includes(s)) ||
    !Number.isFinite(Date.parse(input.effectiveFrom)) ||
    !Number.isFinite(Date.parse(input.expiresAt)) ||
    Date.parse(input.expiresAt) <= Date.parse(input.effectiveFrom) ||
    [
      input.accountingReference,
      input.invoiceTreatmentReference,
      input.courierShortCollectionReference,
    ].some((v) => !v.trim() || v.length > 512)
  )
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'Explicit bounded cash, invoice, accounting and courier policy is required.',
    );
  return input;
}

export async function proposeCashShortfallPolicy(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; policy: CashShortfallPolicyInputDto },
) {
  const policy = validateCashPolicy(input.policy);
  return db.transaction().execute(async (tx) => {
    await requirePaymentCapability(
      tx,
      input.organizationId,
      input.actorId,
      'payments.cash_policies.manage',
    );
    const row = (
      await sql<{
        id: string;
      }>`insert into payments.cash_policy_proposals(organization_id,definition,created_by)
      values(${input.organizationId},${JSON.stringify(policy)}::jsonb,${input.actorId}) returning id`.execute(
        tx,
      )
    ).rows[0]!;
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.cash_policy.proposed',
      targetType: 'payments.cash_policy',
      targetId: row.id,
    });
    return row;
  });
}

export async function approveCashShortfallPolicy(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; proposalId: string; approvalReference: string },
) {
  if (!input.approvalReference.trim() || input.approvalReference.length > 512)
    throw new PaymentDomainError('VALIDATION_FAILED', 'Approval evidence is required.');
  return db.transaction().execute(async (tx) => {
    await requirePaymentCapability(
      tx,
      input.organizationId,
      input.actorId,
      'payments.cash_policies.approve',
    );
    const proposal = (
      await sql<{
        created_by: string;
        definition: CashShortfallPolicyInputDto;
      }>`select created_by,definition from payments.cash_policy_proposals
      where organization_id=${input.organizationId} and id=${input.proposalId} for share`.execute(
        tx,
      )
    ).rows[0];
    if (!proposal) throw new PaymentDomainError('NOT_FOUND', 'Cash policy proposal was not found.');
    if (proposal.created_by === input.actorId)
      throw new PaymentDomainError(
        'FORBIDDEN',
        'A different authorized operator must approve the policy.',
      );
    const p = validateCashPolicy(proposal.definition);
    const row = (
      await sql<{
        id: string;
      }>`insert into payments.cash_policy_revisions(organization_id,proposal_id,revision,scope,
      maximum_per_adjustment,maximum_per_order,maximum_per_staff_day,self_approval_limit,allowed_order_states,
      effective_from,expires_at,accounting_reference,invoice_reference,courier_reference,approved_by,approval_reference)
      values(${input.organizationId},${input.proposalId},${p.revision},${p.scope},${p.maximumPerAdjustment}::numeric,
      ${p.maximumPerOrder}::numeric,${p.maximumPerStaffDay}::numeric,${p.selfApprovalLimit}::numeric,${p.allowedOrderStates}::text[],
      ${p.effectiveFrom}::timestamptz,${p.expiresAt}::timestamptz,${p.accountingReference},${p.invoiceTreatmentReference},
      ${p.courierShortCollectionReference},${input.actorId},${input.approvalReference}) returning id`.execute(
        tx,
      )
    ).rows[0]!;
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.cash_policy.approved',
      targetType: 'payments.cash_policy',
      targetId: row.id,
    });
    return row;
  });
}
