import { sql, type Kysely } from 'kysely';
import type { ReceivingDestinationInputDto, ReceivingDestinationDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import { PaymentDomainError } from '../payments.js';
import { requirePaymentCapability } from './authorization.js';

type Context = { organizationId: string; actorId: string };
type DestinationRow = ReceivingDestinationInputDto & {
  id: string;
  revision: string;
  state: ReceivingDestinationDto['state'];
  providerEvidenceReference: string | null;
  createdBy: string;
  approvedBy: string | null;
};
const selection = sql`id,revision::text,state,provider,account_type as "accountType",
  receiving_number as "receivingNumber",recipient_name as "recipientName",transfer_action as "transferAction",
  instructions,financial_account_id as "financialAccountId",provider_evidence_reference as "providerEvidenceReference",
  created_by as "createdBy",approved_by as "approvedBy"`;
async function record(db: Kysely<DatabaseSchema>, c: Context, id: string, reason: string) {
  await sql`insert into payments.receiving_destination_history(organization_id,destination_id,revision,snapshot,actor_id,reason)
    select organization_id,id,revision,to_jsonb(d),${c.actorId},${reason} from payments.receiving_destinations d
    where organization_id=${c.organizationId} and id=${id}`.execute(db);
  await appendAuditEvent(db, {
    organizationId: c.organizationId,
    actorType: 'USER',
    actorId: c.actorId,
    action: 'payments.destination.changed',
    targetType: 'payments.receiving_destination',
    targetId: id,
    metadata: { reason },
  });
  const row = (
    await sql<DestinationRow>`select ${selection} from payments.receiving_destinations
    where organization_id=${c.organizationId} and id=${id}`.execute(db)
  ).rows[0]!;
  return { ...row, currency: 'BDT' as const };
}
export async function createReceivingDestination(
  db: Kysely<DatabaseSchema>,
  input: Context & ReceivingDestinationInputDto,
) {
  if (
    !['BKASH', 'NAGAD'].includes(input.provider) ||
    !['PERSONAL_RETAIL_ACCOUNT', 'MERCHANT'].includes(input.accountType) ||
    !['MERCHANT_PAYMENT', 'PAYMENT_QR', 'UNVERIFIED'].includes(input.transferAction) ||
    !/^01[3-9]\d{8}$/.test(input.receivingNumber) ||
    !input.recipientName.trim() ||
    input.recipientName.length > 160 ||
    !input.instructions.trim() ||
    input.instructions.length > 1000
  )
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'Check the receiving account and approved payment instructions.',
    );
  return db.transaction().execute(async (tx) => {
    await requirePaymentCapability(
      tx,
      input.organizationId,
      input.actorId,
      'payments.destinations.edit',
    );
    const account = (
      await sql<{
        id: string;
      }>`select id from finance.financial_accounts where organization_id=${input.organizationId}
      and id=${input.financialAccountId} and currency_code='BDT' and account_type='MOBILE_WALLET' and status='ACTIVE' for share`.execute(
        tx,
      )
    ).rows[0];
    if (!account)
      throw new PaymentDomainError(
        'VALIDATION_FAILED',
        'An active BDT wallet Finance account is required.',
      );
    const row = (
      await sql<{
        id: string;
      }>`insert into payments.receiving_destinations(organization_id,provider,account_type,receiving_number,
      recipient_name,transfer_action,instructions,financial_account_id,created_by)
      values(${input.organizationId},${input.provider},${input.accountType},${input.receivingNumber},${input.recipientName.trim()},
      ${input.transferAction},${input.instructions.trim()},${input.financialAccountId},${input.actorId}) returning id`.execute(
        tx,
      )
    ).rows[0]!;
    return record(tx, input, row.id, 'DRAFT_CREATED');
  });
}
export async function changeReceivingDestination(
  db: Kysely<DatabaseSchema>,
  input: Context & {
    id: string;
    expectedRevision: string;
    action: 'APPROVE' | 'SUSPEND' | 'RETIRE';
    reason: string;
    providerEvidenceReference?: string;
  },
) {
  if (
    !input.reason.trim() ||
    input.reason.length > 512 ||
    !/^[1-9]\d{0,18}$/.test(input.expectedRevision)
  )
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'A revision and bounded reason are required.',
    );
  return db.transaction().execute(async (tx) => {
    await requirePaymentCapability(
      tx,
      input.organizationId,
      input.actorId,
      input.action === 'APPROVE' ? 'payments.destinations.approve' : 'payments.destinations.edit',
    );
    const row = (
      await sql<DestinationRow>`select ${selection} from payments.receiving_destinations
      where organization_id=${input.organizationId} and id=${input.id} for update`.execute(tx)
    ).rows[0];
    if (!row) throw new PaymentDomainError('NOT_FOUND', 'Receiving destination was not found.');
    if (row.revision !== input.expectedRevision)
      throw new PaymentDomainError('CONFLICT', 'Receiving destination changed. Reload it.');
    if (row.state === 'RETIRED')
      throw new PaymentDomainError('CONFLICT', 'A retired destination cannot change.');
    if (input.action === 'APPROVE') {
      if (row.state !== 'DRAFT' || row.createdBy === input.actorId)
        throw new PaymentDomainError(
          'FORBIDDEN',
          'A different authorized person must approve a draft destination.',
        );
      if (
        !input.providerEvidenceReference?.trim() ||
        input.providerEvidenceReference.length > 512 ||
        row.transferAction === 'UNVERIFIED'
      )
        throw new PaymentDomainError(
          'POLICY_BLOCKED',
          'Independent provider account and collection evidence is required.',
        );
      // The actual Nagad category/workflow has not been confirmed. Do not mint approval.
      if (row.provider === 'NAGAD')
        throw new PaymentDomainError(
          'POLICY_BLOCKED',
          'Nagad account category and collection workflow remain unverified.',
        );
    }
    await sql`update payments.receiving_destinations set state=${input.action === 'APPROVE' ? 'APPROVED' : input.action === 'SUSPEND' ? 'SUSPENDED' : 'RETIRED'},
      revision=revision+1,approved_by=case when ${input.action}='APPROVE' then ${input.actorId}::uuid else approved_by end,
      approved_at=case when ${input.action}='APPROVE' then now() else approved_at end,
      provider_evidence_reference=case when ${input.action}='APPROVE' then ${input.providerEvidenceReference ?? null} else provider_evidence_reference end
      where organization_id=${input.organizationId} and id=${input.id}`.execute(tx);
    return record(tx, input, input.id, input.reason.trim());
  });
}
export async function listReceivingDestinations(
  db: Kysely<DatabaseSchema>,
  input: Context & { page?: number; pageSize?: number },
) {
  await requirePaymentCapability(
    db,
    input.organizationId,
    input.actorId,
    'payments.destinations.view',
  );
  const page = Math.max(1, Math.trunc(input.page ?? 1)),
    pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 25)));
  const rows = await sql<
    DestinationRow & { total: string }
  >`select ${selection},count(*) over()::text total from payments.receiving_destinations
    where organization_id=${input.organizationId} order by created_at desc,id desc limit ${pageSize} offset ${(page - 1) * pageSize}`.execute(
    db,
  );
  const totalItems =
    rows.rows[0]?.total ??
    (page > 1
      ? (
          await sql<{
            total: string;
          }>`select count(*)::text total from payments.receiving_destinations where organization_id=${input.organizationId}`.execute(
            db,
          )
        ).rows[0]!.total
      : '0');
  return {
    items: rows.rows.map(({ total, ...r }) => {
      void total;
      return { ...r, currency: 'BDT' as const };
    }),
    pagination: { page, pageSize, totalItems: Number(totalItems) },
  };
}
