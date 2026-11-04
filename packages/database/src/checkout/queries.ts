import { sql, type Kysely } from 'kysely';
import type { CheckoutDraftDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { CheckoutError, type CheckoutAuthority, type DraftRow } from './types.js';

export async function ownedDraft(
  tx: Kysely<DatabaseSchema>,
  owner: CheckoutAuthority,
  id: string,
): Promise<DraftRow> {
  const rows =
    await sql<DraftRow>`select *, revision::text,source_revision::text from orders.checkout_drafts
    where organization_id=${owner.organizationId} and id=${id}
      and ${owner.kind === 'GUEST' ? sql`guest_session_id=${owner.sessionId}` : sql`owner_account_id=${owner.accountId}`}
    for update`.execute(tx);
  if (!rows.rows[0]) throw new CheckoutError('NOT_FOUND', 'Checkout draft was not found.');
  return rows.rows[0];
}
export async function draftView(
  tx: Kysely<DatabaseSchema>,
  row: DraftRow,
): Promise<CheckoutDraftDto> {
  // Expiry is derived after any lock wait, even before background cleanup.
  const state = await sql<{
    expired: boolean;
  }>`select ${row.expires_at}::timestamptz<=clock_timestamp() expired`.execute(tx);
  const lines = await sql<{
    id: string;
    variantId: string;
    quantity: string;
    sourceCartLineId: string | null;
  }>`
    select id,variant_id as "variantId",quantity::text,source_cart_line_id as "sourceCartLineId"
    from orders.checkout_draft_lines where organization_id=${row.organization_id} and draft_id=${row.id} order by id`.execute(
    tx,
  );
  return {
    id: row.id,
    implementationVersion: 2,
    revision: row.revision,
    ownerKind: row.owner_account_id ? 'ACCOUNT' : 'GUEST',
    status: row.status === 'ACTIVE' && state.rows[0]?.expired ? 'EXPIRED' : row.status,
    expiresAt: row.expires_at.toISOString(),
    currency: row.currency_code,
    sourceReviewRequired: row.source_review_required,
    source:
      row.source_kind === 'CART'
        ? { kind: 'CART', cartId: row.source_cart_id!, cartRevision: row.source_revision! }
        : { kind: 'BUY_NOW' },
    lines: lines.rows,
    purchaseAvailable: false,
  };
}
