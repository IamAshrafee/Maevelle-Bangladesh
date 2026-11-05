import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { requirePaymentCapability } from './authorization.js';

export async function listReceiptExceptions(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; page?: number; pageSize?: number },
) {
  await requirePaymentCapability(db, input.organizationId, input.actorId, 'payments.review');
  const page = Math.max(1, Math.trunc(input.page ?? 1)),
    pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 25)));
  const rows = await sql<{
    paymentId: string;
    orderId: string;
    received: string;
    unallocated: string;
    disposition: string;
    status: string;
    total: string;
  }>`select e.payment_id as "paymentId",e.order_id as "orderId",p.amount::text received,e.unallocated_amount::text unallocated,
      e.disposition,p.status,count(*) over()::text total from payments.verified_receipt_evidence e join payments.payments p
      on p.organization_id=e.organization_id and p.id=e.payment_id
    where e.organization_id=${input.organizationId} and (e.unallocated_amount>0 or p.status='REVERSED')
    order by e.verified_at,e.payment_id limit ${pageSize} offset ${(page - 1) * pageSize}`.execute(
    db,
  );
  const totalItems =
    rows.rows[0]?.total ??
    (page > 1
      ? (
          await sql<{
            total: string;
          }>`select count(*)::text total from payments.verified_receipt_evidence e join payments.payments p on p.organization_id=e.organization_id and p.id=e.payment_id where e.organization_id=${input.organizationId} and (e.unallocated_amount>0 or p.status='REVERSED')`.execute(
            db,
          )
        ).rows[0]!.total
      : '0');
  return {
    items: rows.rows.map(({ total, ...r }) => {
      void total;
      return r;
    }),
    pagination: { page, pageSize, totalItems: Number(totalItems) },
  };
}
