import { sql, type Kysely } from 'kysely';
import type {
  CartMergeCommitRequestDto,
  CartMergePreviewDto,
  CartMergeSelectionDto,
} from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { assertActiveCartAccount, findAccountCart } from './account.js';
import { bumpCartVersion } from './commands.js';
import { findCart, type ResolvedCart } from './context.js';
import { CartDomainError } from './errors.js';
import { evaluateCart } from './queries.js';
import { mutateCart } from './receipts.js';
import { cartTransaction } from './transaction.js';
import type { AccountCartAuthority } from './types.js';
import { fingerprint } from './value.js';

async function resolveMergeGuest(
  db: Kysely<DatabaseSchema>,
  account: ResolvedCart,
  selection: CartMergeSelectionDto,
  token: string | undefined,
  lock: boolean,
): Promise<ResolvedCart<Date>> {
  if (account.ownerContext !== selection.ownerContext)
    throw new CartDomainError('OWNER_CHANGED', 'Resolve the current account Cart before merging.');
  if (!token) throw new CartDomainError('NOT_FOUND', 'The selected guest Cart is unavailable.');
  const guest = await findCart(db, token, lock);
  if (
    guest.id !== selection.guestCartId ||
    guest.ownerContext !== selection.guestOwnerContext ||
    guest.organizationId !== account.organizationId ||
    guest.currency !== account.currency
  )
    throw new CartDomainError('NOT_FOUND', 'The selected guest Cart is unavailable.');
  return guest;
}

async function buildMergePreview(
  db: Kysely<DatabaseSchema>,
  account: ResolvedCart<null>,
  guest: ResolvedCart<Date>,
  selection: CartMergeSelectionDto,
): Promise<CartMergePreviewDto> {
  const accountView = await evaluateCart(db, account);
  const guestView = await evaluateCart(db, guest);
  const accountLines = new Map(accountView.lines.map((line) => [line.variantId, line]));
  const proposed = new Map(
    accountView.lines.map((line) => [line.id, { id: line.id, quantity: Number(line.quantity) }]),
  );
  const lines = guestView.lines.map((line) => {
    const existing = accountLines.get(line.variantId);
    const survivingLineId = existing?.id ?? line.id;
    const accountQuantity = Number(existing?.quantity ?? 0);
    const guestQuantity = Number(line.quantity);
    const requestedQuantity = accountQuantity + guestQuantity;
    proposed.set(survivingLineId, { id: survivingLineId, quantity: requestedQuantity });
    return {
      variantId: line.variantId,
      guestLineId: line.id,
      survivingLineId,
      accountQuantity,
      guestQuantity,
      requestedQuantity,
    };
  });
  const blockers: CartMergePreviewDto['blockers'][number][] = [];
  if (!lines.length) blockers.push('EMPTY_GUEST');
  if (lines.some((line) => line.requestedQuantity > 99)) blockers.push('QUANTITY_LIMIT');
  if (proposed.size > 100) blockers.push('LINE_LIMIT');
  const projected = blockers.length
    ? null
    : await evaluateCart(db, account, { guestCartId: guest.id, lines: [...proposed.values()] });
  return {
    selection,
    accountRevision: accountView.intentRevision,
    guestRevision: guestView.intentRevision,
    reviewFingerprint: fingerprint({
      protocol: 1,
      owners: [selection.ownerContext, selection.guestCartId, selection.guestOwnerContext],
      account: accountView.calculationFingerprint,
      guest: guestView.calculationFingerprint,
      projected: projected?.calculationFingerprint ?? null,
      lines,
      blockers,
    }),
    status: blockers.length ? 'REVIEW_REQUIRED' : 'READY',
    blockers,
    lines,
    account: accountView,
    guest: guestView,
    projected,
  };
}

export function previewCartMerge(
  db: Kysely<DatabaseSchema>,
  owner: AccountCartAuthority,
  selection: CartMergeSelectionDto,
  token: string | undefined,
): Promise<CartMergePreviewDto> {
  return cartTransaction(db, async (tx) => {
    await assertActiveCartAccount(tx, owner, false);
    const account = await findAccountCart(tx, owner, false);
    const guest = await resolveMergeGuest(tx, account, selection, token, false);
    return buildMergePreview(tx, account, guest, selection);
  });
}

export function commitCartMerge(
  db: Kysely<DatabaseSchema>,
  owner: AccountCartAuthority,
  request: CartMergeCommitRequestDto,
  idempotencyKey: string,
  token: string | undefined,
) {
  // Guest credential never enters receipt identity. The exact account-scoped receipt
  // is resolved before consulting the guest, whose slot was revoked on success.
  return mutateCart(
    db,
    { ...request, account: owner, expectedVersion: request.version, idempotencyKey },
    'merge_guest',
    async (tx, account) => {
      const selection = {
        guestCartId: request.guestCartId,
        guestOwnerContext: request.guestOwnerContext,
        ownerContext: request.ownerContext,
      };
      const guest = await resolveMergeGuest(tx, account, selection, token, true);
      const preview = await buildMergePreview(
        tx,
        { ...account, expiresAt: null },
        guest,
        selection,
      );
      if (preview.reviewFingerprint !== request.reviewFingerprint)
        throw new CartDomainError(
          'MERGE_STALE',
          'Cart or commerce details changed. Review a new merge preview.',
        );
      if (!preview.projected)
        throw new CartDomainError(
          'MERGE_REVIEW_REQUIRED',
          'Resolve the merge blockers before continuing.',
        );

      // Preserve guest intent as history for collisions. Distinct lines move with
      // their existing ID. Both owner rows are locked (account first, guest second).
      const projectedById = new Map(preview.projected.lines.map((line) => [line.id, line]));
      const writes = preview.lines.map((line) => ({
        id: line.survivingLineId,
        quantity: line.requestedQuantity,
        unit_price: projectedById.get(line.survivingLineId)!.unitPrice,
      }));
      await sql`
      update cart.cart_lines line
      set cart_id=${account.id}, quantity=plan.quantity, last_seen_unit_price=plan.unit_price,
        version=line.version+1, updated_at=now()
      from jsonb_to_recordset(${JSON.stringify(writes)}::jsonb) as plan(id uuid,quantity integer,unit_price numeric)
      where line.cart_id in (${account.id},${guest.id}) and line.organization_id=${account.organizationId}
        and line.id=plan.id
    `.execute(tx);
      await sql`
      update cart.carts set status='MERGED',merged_into_id=${account.id},
        credential_state='RETIRED',public_token_hash='retired:' || public_token_hash,
        version=version+1,updated_at=now()
      where id=${guest.id}
    `.execute(tx);
      const version = await bumpCartVersion(tx, account.id, account.version);
      return evaluateCart(tx, { ...account, version, expiresAt: null });
    },
  );
}
