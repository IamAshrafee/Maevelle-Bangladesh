import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { findActiveAdminContext } from '../platform.js';
import { PaymentDomainError } from '../payments.js';

/** Lock membership through commit so revocation cannot race a financial command. */
export async function requirePaymentCapability(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  actorId: string,
  capability: string,
) {
  await sql`select id from iam.organization_memberships where organization_id=${organizationId}
    and user_id=${actorId} for share`.execute(db);
  const context = await findActiveAdminContext(db, actorId, {
    organizationId,
    requiredCapability: capability,
  });
  if (
    !context ||
    context.scopes.some((s) => s.capabilityCode === null || s.capabilityCode === capability)
  )
    throw new PaymentDomainError(
      'FORBIDDEN',
      'This payment operation requires an unrestricted capability.',
    );
  return context;
}
