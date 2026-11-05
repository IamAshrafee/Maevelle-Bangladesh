import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
type Context = { organizationId: string; actorId: string };

export async function appendPaymentOperationEvent(
  tx: Kysely<DatabaseSchema>,
  c: Context,
  id: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  await appendAuditEvent(tx, {
    organizationId: c.organizationId,
    actorId: c.actorId,
    actorType: 'USER',
    action,
    targetType: 'payments.payment',
    targetId: id,
    metadata,
  });
  await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    values(${c.organizationId},${action},1,'payments.payment',${id},1,${JSON.stringify(metadata)}::jsonb,now())`.execute(
    tx,
  );
}
