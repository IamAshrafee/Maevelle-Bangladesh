import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { PaymentDomainError } from '../payments.js';
import { requirePaymentCapability } from './authorization.js';
import { appendAuditEvent } from '../platform.js';

/** A durable proposal records the actual proposing actor, never a caller-supplied identity. */
export async function proposePaymentOperatingPolicy(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    submissionMinutes: number;
    reviewMinutes: number;
  },
) {
  if (
    !Number.isInteger(input.submissionMinutes) ||
    input.submissionMinutes < 15 ||
    input.submissionMinutes > 10080 ||
    !Number.isInteger(input.reviewMinutes) ||
    input.reviewMinutes < 1 ||
    input.reviewMinutes > 10080
  )
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'Explicit bounded submission and review deadlines are required.',
    );
  return db.transaction().execute(async (tx) => {
    await requirePaymentCapability(
      tx,
      input.organizationId,
      input.actorId,
      'payments.destinations.edit',
    );
    const row = (
      await sql<{
        id: string;
      }>`insert into payments.operating_policy_proposals(organization_id,submission_minutes,review_minutes,created_by)
      values(${input.organizationId},${input.submissionMinutes},${input.reviewMinutes},${input.actorId}) returning id`.execute(
        tx,
      )
    ).rows[0]!;
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.operating_policy.proposed',
      targetType: 'payments.operating_policy',
      targetId: row.id,
      metadata: { submissionMinutes: input.submissionMinutes, reviewMinutes: input.reviewMinutes },
    });
    return row;
  });
}
/** No default deadlines are approved by code. Approval binds an actual immutable proposal. */
export async function approvePaymentOperatingPolicy(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; proposalId: string; approvalReference: string },
) {
  if (!input.approvalReference.trim() || input.approvalReference.length > 512)
    throw new PaymentDomainError('VALIDATION_FAILED', 'Independent approval evidence is required.');
  return db.transaction().execute(async (tx) => {
    await requirePaymentCapability(
      tx,
      input.organizationId,
      input.actorId,
      'payments.destinations.approve',
    );
    const proposal = (
      await sql<{
        id: string;
        created_by: string;
        submission_minutes: number;
        review_minutes: number;
      }>`select * from payments.operating_policy_proposals
      where organization_id=${input.organizationId} and id=${input.proposalId} for update`.execute(
        tx,
      )
    ).rows[0];
    if (!proposal)
      throw new PaymentDomainError('NOT_FOUND', 'Operating policy proposal was not found.');
    if (proposal.created_by === input.actorId)
      throw new PaymentDomainError(
        'FORBIDDEN',
        'Another authorized person must approve the proposal.',
      );
    const replay = (
      await sql<{
        id: string;
      }>`select id from payments.operating_policy_revisions where organization_id=${input.organizationId} and proposal_id=${input.proposalId}`.execute(
        tx,
      )
    ).rows[0];
    if (replay) return replay;
    const row = (
      await sql<{
        id: string;
      }>`insert into payments.operating_policy_revisions(organization_id,submission_minutes,review_minutes,approval_reference,created_by,approved_by,proposal_id)
      values(${input.organizationId},${proposal.submission_minutes},${proposal.review_minutes},${input.approvalReference.trim()},${proposal.created_by},${input.actorId},${proposal.id}) returning id`.execute(
        tx,
      )
    ).rows[0]!;
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.operating_policy.approved',
      targetType: 'payments.operating_policy',
      targetId: row.id,
      metadata: {
        proposalId: proposal.id,
        submissionMinutes: proposal.submission_minutes,
        reviewMinutes: proposal.review_minutes,
      },
    });
    return row;
  });
}
/** Future placement may only call a transaction-aware boundary after all gates close. */
export async function prepareCheckoutPaymentObligationInTransaction(
  _db: Kysely<DatabaseSchema>,
  _input: {
    organizationId: string;
    orderId: string;
    quoteId: string;
    quoteFingerprint: string;
    expectedRootRevision: string;
    method: 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';
    destinationId?: string;
    destinationRevision?: string;
    operatingPolicyId?: string;
  },
): Promise<never> {
  void _db;
  void _input;
  throw new PaymentDomainError(
    'POLICY_BLOCKED',
    'Final tax/payable, delivery, provider and placement approvals are unresolved.',
  );
}
