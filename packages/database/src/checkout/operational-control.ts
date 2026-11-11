import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import {
  appendAuditEvent,
  isOperationalControlEnabled,
  setOperationalControl,
} from '../platform.js';

export async function pauseCheckoutOrders(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    membershipId: string;
    actorId: string;
    reason: string;
    requestId: string;
  },
): Promise<boolean> {
  return db.transaction().execute(async (tx) => {
    // Recheck and hold the Owner membership through the control change.
    const owner = await sql`select id from iam.organization_memberships
      where id = ${input.membershipId} and organization_id = ${input.organizationId}
        and user_id = ${input.actorId} and status = 'ACTIVE' and membership_type = 'OWNER'
      for share`.execute(tx);
    if (!owner.rows.length) return false;

    // Serialize repeat pauses without taking a write lock across other organizations.
    await sql`select pg_advisory_xact_lock(hashtextextended(${`checkout-pause:${input.organizationId}`}, 0))`.execute(
      tx,
    );
    const enabled = await isOperationalControlEnabled(tx, input.organizationId, 'checkout_enabled');
    if (!enabled) return true;

    await setOperationalControl(tx, {
      organizationId: input.organizationId,
      key: 'checkout_enabled',
      type: 'KILL_SWITCH',
      enabled: false,
      actorId: input.actorId,
      reason: input.reason,
    });
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      actorType: 'USER',
      actorId: input.actorId,
      requestId: input.requestId,
      reason: input.reason,
      action: 'checkout.orders.paused',
      targetType: 'platform.operational_control',
      beforeDiff: { enabled: true },
      afterDiff: { enabled: false },
      metadata: { controlKey: 'checkout_enabled' },
    });
    return true;
  });
}
