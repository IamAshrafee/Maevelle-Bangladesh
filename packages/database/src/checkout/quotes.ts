import { sql, type Kysely, type Transaction } from 'kysely';
import type {
  CreateCheckoutQuoteDto,
  AcknowledgeCheckoutQuoteDto,
  CheckoutQuoteDto,
  CheckoutQuoteIssue,
} from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { checkoutTransaction, receipt, audit } from './commands.js';
import { lockCheckoutAuthority } from './authority.js';
import { ownedDraft, draftStatus } from './queries.js';
import { CheckoutError, type CheckoutAuthority, type DraftRow } from './types.js';
import { evaluateCheckoutInTransaction } from './quote-evaluation.js';
import { loadQuote, quoteFacts, quoteChanges, type StoredQuote } from './quote-store.js';

const blockers = [
  'TAX_POLICY_UNRESOLVED',
  'PAYMENT_POLICY_UNRESOLVED',
  'COURIER_COMPATIBILITY_UNVERIFIED',
] as const;
function revision(value: string) {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775806n
  )
    throw new CheckoutError('INVALID_REQUEST', 'A valid draft revision is required.');
}
export function quoteCoupons(input: readonly string[] | undefined): readonly string[] {
  if (input === undefined) return [];
  if (
    !Array.isArray(input) ||
    input.length > 10 ||
    input.some(
      (c) =>
        typeof c !== 'string' ||
        c.length > 64 ||
        !/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(c.trim()),
    )
  )
    throw new CheckoutError('INVALID_REQUEST', 'Supply at most ten valid coupon codes.');
  return [...new Set(input.map((c) => c.trim().toUpperCase()))].sort();
}
async function completed(tx: Transaction<DatabaseSchema>, receiptId: string, quoteId: string) {
  await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_type='checkout.quote',result_entity_id=${quoteId},
    safe_response=${JSON.stringify({ quoteId })}::jsonb,completed_at=clock_timestamp(),expires_at=null where id=${receiptId}`.execute(
    tx,
  );
}
async function currentId(tx: Transaction<DatabaseSchema>, owner: CheckoutAuthority, id: string) {
  return (
    await sql<{ id: string | null }>`select current_quote_id id from orders.checkout_drafts
    where organization_id=${owner.organizationId} and id=${id}`.execute(tx)
  ).rows[0]!.id;
}
async function quoteView(
  tx: Transaction<DatabaseSchema>,
  owner: CheckoutAuthority,
  row: DraftRow,
  q: StoredQuote,
  cartToken?: string,
  evaluation?: Awaited<ReturnType<typeof evaluateCheckoutInTransaction>>,
): Promise<CheckoutQuoteDto> {
  const facts = await quoteFacts(tx, owner.organizationId, q);
  const state = (
    await sql<{
      expired: boolean;
      ack: boolean;
    }>`select ${q.expires_at}::timestamptz<=clock_timestamp() expired,
    exists(select 1 from orders.checkout_quote_acknowledgements where organization_id=${owner.organizationId} and quote_id=${q.id}) ack`.execute(
      tx,
    )
  ).rows[0]!;
  const issues: CheckoutQuoteIssue[] = [];
  if ((await draftStatus(tx, row)) !== 'ACTIVE') issues.push('DRAFT_EXPIRED');
  if (state.expired) issues.push('QUOTE_EXPIRED');
  if ((await currentId(tx, owner, row.id)) !== q.id) issues.push('SUPERSEDED');
  let changes = q.changes;
  if (!issues.length) {
    try {
      const current =
        evaluation ??
        (await evaluateCheckoutInTransaction(
          tx,
          owner,
          row,
          q.source_kind === 'BUY_NOW' ? q.coupons.map((c) => c.code) : [],
          cartToken,
        ));
      if (current.fingerprint !== q.fingerprint) {
        changes = quoteChanges({ facts, snapshot: q.snapshot }, current);
        issues.push(
          changes.includes('SOURCE')
            ? 'SOURCE_CHANGED'
            : changes.includes('DELIVERY')
              ? 'DELIVERY_CHANGED'
              : 'CONFIGURATION_CHANGED',
        );
      }
      if (row.revision !== q.draft_revision && !issues.length) issues.push('CONFIGURATION_CHANGED');
    } catch (error) {
      const allowed: readonly string[] = [
        'DRAFT_EXPIRED',
        'SOURCE_CHANGED',
        'DELIVERY_CHANGED',
        'ADDRESS_CHANGED',
        'CONFIGURATION_CHANGED',
        'VARIANT_UNAVAILABLE',
        'INSUFFICIENT_STOCK',
        'UNSUPPORTED_AREA',
        'DELIVERY_UNAVAILABLE',
      ];
      if (!(error instanceof CheckoutError) || !allowed.includes(error.code)) throw error;
      issues.push(error.code as CheckoutQuoteIssue);
    }
  }
  const expired = (
    await sql<{
      expired: boolean;
    }>`select ${q.expires_at}::timestamptz<=clock_timestamp() expired`.execute(tx)
  ).rows[0]!.expired;
  if (expired && !issues.includes('QUOTE_EXPIRED')) issues.push('QUOTE_EXPIRED');
  if ((await draftStatus(tx, row)) !== 'ACTIVE' && !issues.includes('DRAFT_EXPIRED'))
    issues.push('DRAFT_EXPIRED');
  const status = issues.includes('SUPERSEDED')
    ? 'SUPERSEDED'
    : issues.includes('QUOTE_EXPIRED')
      ? 'EXPIRED'
      : issues.length
        ? 'INVALIDATED'
        : 'CURRENT';
  return {
    id: q.id,
    draftId: q.draft_id,
    draftRevision: q.draft_revision,
    source:
      q.source_kind === 'CART'
        ? { kind: 'CART', cartId: q.source_cart_id!, cartRevision: q.source_revision! }
        : { kind: 'BUY_NOW' },
    fingerprint: q.fingerprint,
    evaluatedAt: q.evaluated_at.toISOString(),
    expiresAt: q.expires_at.toISOString(),
    facts,
    status,
    issues,
    acknowledged: state.ack,
    reviewRequired: status !== 'CURRENT' || !state.ack,
    changes,
    previousQuoteId: q.previous_quote_id,
    blockers,
    stockReserved: false,
    purchaseAvailable: false,
  };
}
export async function createCheckoutQuote(
  db: Kysely<DatabaseSchema>,
  owner: CheckoutAuthority,
  id: string,
  input: CreateCheckoutQuoteDto,
  key: string,
  cartToken?: string,
) {
  revision(input.revision);
  const codes = quoteCoupons(input.couponCodes);
  return checkoutTransaction(
    db,
    async (tx) => {
      await lockCheckoutAuthority(tx, owner);
      const row = await ownedDraft(tx, owner, id);
      const record = await receipt(tx, owner, key, 'quote.create', {
        id,
        revision: input.revision,
        couponCodes: codes,
      });
      if (record.draftId)
        return quoteView(
          tx,
          owner,
          row,
          await loadQuote(tx, owner.organizationId, id, record.draftId),
          cartToken,
        );
      if (row.revision !== input.revision)
        throw new CheckoutError('STALE_REVISION', 'Checkout changed. Restore it before quoting.');
      const count = await sql<{
        n: number;
      }>`select count(*)::integer n from orders.checkout_quotes where organization_id=${owner.organizationId} and draft_id=${id}`.execute(
        tx,
      );
      if (count.rows[0]!.n >= 64)
        throw new CheckoutError('QUOTE_LIMIT', 'Start a new Checkout after reviewing these items.');
      const evaluated = await evaluateCheckoutInTransaction(tx, owner, row, codes, cartToken);
      const previousId = await currentId(tx, owner, id);
      const previous = previousId
        ? await loadQuote(tx, owner.organizationId, id, previousId)
        : null;
      const changes = quoteChanges(
        previous
          ? {
              facts: await quoteFacts(tx, owner.organizationId, previous),
              snapshot: previous.snapshot,
            }
          : null,
        evaluated,
      );
      const r = String(BigInt(row.revision) + 1n),
        f = evaluated.facts;
      const inserted = await sql<{
        id: string;
      }>`insert into orders.checkout_quotes(organization_id,draft_id,draft_revision,source_kind,source_cart_id,source_revision,
      currency_code,evaluated_at,expires_at,fingerprint,merchandise_subtotal,discount_total,shipping,evaluated_total,snapshot,discounts,coupons,previous_quote_id,changes)
      values(${owner.organizationId},${id},${r}::bigint,${row.source_kind},${row.source_cart_id},${row.source_revision}::bigint,${row.currency_code},
      ${evaluated.at}::timestamptz,least(${row.expires_at}::timestamptz,transaction_timestamp()+interval '10 minutes'),${evaluated.fingerprint},
      ${f.merchandiseSubtotal}::numeric,${f.discountTotal}::numeric,${f.shipping}::numeric,${f.evaluatedTotal}::numeric,
      ${JSON.stringify(evaluated.snapshot)}::jsonb,${JSON.stringify(f.discounts)}::jsonb,${JSON.stringify(f.coupons)}::jsonb,${previousId},${[...changes]}::text[]) returning id`.execute(
        tx,
      );
      const quoteId = inserted.rows[0]!.id;
      await sql`insert into orders.checkout_quote_lines(organization_id,draft_id,quote_id,id,variant_id,product_id,title,sku,quantity,price_definition_id,unit_price,gross,discount,net)
      values ${sql.join(
        f.lines.map(
          (
            l,
          ) => sql`(${owner.organizationId},${id},${quoteId},${l.id},${l.variantId},${l.productId},${l.title},${l.sku},${l.quantity}::integer,
      ${l.priceDefinitionId},${l.unitPrice}::numeric,${l.gross}::numeric,${l.discount}::numeric,${l.net}::numeric)`,
        ),
      )}`.execute(tx);
      await sql`update orders.checkout_drafts set revision=${r}::bigint,current_quote_id=${quoteId},updated_at=clock_timestamp() where organization_id=${owner.organizationId} and id=${id}`.execute(
        tx,
      );
      await completed(tx, record.id, quoteId);
      await audit(tx, owner, id, 'quoted');
      // Check wall-clock expiry after all waits/writes. A failure rolls back the whole intent.
      const q = await loadQuote(tx, owner.organizationId, id, quoteId);
      const result = await quoteView(tx, owner, { ...row, revision: r }, q, cartToken, evaluated);
      if (result.status !== 'CURRENT')
        throw new CheckoutError('QUOTE_EXPIRED', 'Restore Checkout and request a fresh quote.');
      return result;
    },
    'repeatable read',
  );
}
export async function getCheckoutQuote(
  db: Kysely<DatabaseSchema>,
  owner: CheckoutAuthority,
  id: string,
  quoteId?: string,
  cartToken?: string,
) {
  return checkoutTransaction(
    db,
    async (tx) => {
      await lockCheckoutAuthority(tx, owner);
      const row = await ownedDraft(tx, owner, id);
      const selected = quoteId ?? (await currentId(tx, owner, id));
      if (!selected) return null;
      return quoteView(
        tx,
        owner,
        row,
        await loadQuote(tx, owner.organizationId, id, selected),
        cartToken,
      );
    },
    'repeatable read',
  );
}
export async function acknowledgeCheckoutQuote(
  db: Kysely<DatabaseSchema>,
  owner: CheckoutAuthority,
  id: string,
  quoteId: string,
  input: AcknowledgeCheckoutQuoteDto,
  key: string,
  cartToken?: string,
) {
  revision(input.revision);
  if (typeof input.fingerprint !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.fingerprint))
    throw new CheckoutError('INVALID_REQUEST', 'A quote fingerprint is required.');
  return checkoutTransaction(
    db,
    async (tx) => {
      await lockCheckoutAuthority(tx, owner);
      const row = await ownedDraft(tx, owner, id);
      const record = await receipt(tx, owner, key, 'quote.acknowledge', {
        id,
        quoteId,
        revision: input.revision,
        fingerprint: input.fingerprint,
      });
      const q = await loadQuote(tx, owner.organizationId, id, quoteId);
      const view = await quoteView(tx, owner, row, q, cartToken);
      if (record.draftId) return view;
      if (
        row.revision !== input.revision ||
        q.draft_revision !== input.revision ||
        q.fingerprint !== input.fingerprint
      )
        throw new CheckoutError('STALE_REVISION', 'Review the exact current quote.');
      if (view.status !== 'CURRENT')
        throw new CheckoutError(
          view.issues[0] ?? 'CONFIGURATION_CHANGED',
          'Request and review a fresh quote.',
        );
      await sql`insert into orders.checkout_quote_acknowledgements(organization_id,draft_id,quote_id) values(${owner.organizationId},${id},${quoteId}) on conflict do nothing`.execute(
        tx,
      );
      await completed(tx, record.id, quoteId);
      await audit(tx, owner, id, 'quote_acknowledged');
      return { ...view, acknowledged: true, reviewRequired: false };
    },
    'repeatable read',
  );
}
