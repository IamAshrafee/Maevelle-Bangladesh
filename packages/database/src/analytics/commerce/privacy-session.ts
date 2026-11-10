import { sql, type Kysely } from 'kysely';
import { generateOpaqueToken, hashToken } from '@maevelle/security';
import type { DatabaseSchema } from '../../index.js';
import type { ShopperPrincipal } from '../../shopper.js';
import { lockShopperSession } from '../../shopper-session-fence.js';

export class PrivacyAuthorityError extends Error {
  constructor(
    public readonly code:
      | 'SESSION_EXPIRED'
      | 'PRIVACY_CONTEXT_CHANGED'
      | 'CONSENT_REVISION_CONFLICT'
      | 'POLICY_CHANGED',
  ) {
    super(code);
  }
}
export interface PrivacyBrowserSession {
  id: string;
  expires_at: Date;
  token_hash: string;
  owner_binding: string;
}
export interface PrivacyOwner {
  organizationId: string;
  binding: string;
  shopper: ShopperPrincipal | null;
}

/** Same live session revocation fence as other shopper commands; no identity fallback on failure. */
export async function lockPrivacyOwner(tx: Kysely<DatabaseSchema>, owner: PrivacyOwner) {
  if (!owner.shopper) return;
  const p = owner.shopper;
  if (!p.sessionKeyHash || p.organizationId !== owner.organizationId)
    throw new PrivacyAuthorityError('SESSION_EXPIRED');
  await lockShopperSession(tx, p.sessionKeyHash);
  const active = await sql`select s.key_hash from iam.auth_kv_store s
    join customers.customer_accounts a on a.organization_id=${owner.organizationId} and a.id=${p.accountId}
      and a.user_id=${p.userId} and a.customer_id=${p.customerId} and a.status='ACTIVE'
    join customers.customers c on c.organization_id=a.organization_id and c.id=a.customer_id and c.status='ACTIVE'
    join iam.users u on u.id=a.user_id and u.status='ACTIVE' and u.email_verified
    where s.key_hash=${p.sessionKeyHash} and s.encrypted_value is not null and s.expires_at>clock_timestamp()
      and not exists(select 1 from iam.shopper_revoked_storage_keys where key_hash=s.key_hash)
    for share of s,a,c,u`.execute(tx);
  if (!active.rows.length) throw new PrivacyAuthorityError('SESSION_EXPIRED');
}

export async function privacyBrowserSession(
  tx: Kysely<DatabaseSchema>,
  owner: PrivacyOwner,
  token: string | undefined,
  create: boolean,
) {
  let row: PrivacyBrowserSession | undefined;
  if (token)
    row = (
      await sql<PrivacyBrowserSession>`select id,expires_at,token_hash,owner_binding
    from analytics.privacy_browser_sessions where organization_id=${owner.organizationId} and token_hash=${hashToken(token)}
      and owner_binding=${owner.binding} and expires_at>clock_timestamp() for update`.execute(tx)
    ).rows[0];
  if (row) return { session: row, token: undefined };
  if (!create) throw new PrivacyAuthorityError('PRIVACY_CONTEXT_CHANGED');
  const next = generateOpaqueToken();
  row = (
    await sql<PrivacyBrowserSession>`insert into analytics.privacy_browser_sessions(organization_id,token_hash,owner_binding)
    values(${owner.organizationId},${hashToken(next)},${owner.binding}) returning id,expires_at,token_hash,owner_binding`.execute(
      tx,
    )
  ).rows[0]!;
  return { session: row, token: next };
}
