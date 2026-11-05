import { sql, type Kysely, type Transaction } from 'kysely';
import type {
  CreateCheckoutDraftDto,
  UpdateCheckoutDraftDto,
  CheckoutSourceDto,
} from '@maevelle/contracts';
import { hashToken } from '@maevelle/security';
import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from '../platform.js';
import { lockCheckoutAuthority } from './authority.js';
import { checkoutSourceLines, validateCheckoutSource } from './source.js';
import { draftView, ownedDraft } from './queries.js';
import { CheckoutError, type CheckoutAuthority, type CheckoutContext } from './types.js';

export async function checkoutTransaction<T>(
  db: Kysely<DatabaseSchema>,
  run: (tx: Transaction<DatabaseSchema>) => Promise<T>,
  isolation: 'read committed' | 'repeatable read' = 'read committed',
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db
        .transaction()
        .setIsolationLevel(isolation)
        .execute(async (tx) => {
          await sql`set local lock_timeout='2s'`.execute(tx);
          await sql`set local statement_timeout='5s'`.execute(tx);
          return run(tx);
        });
    } catch (error) {
      if (attempt >= 2 || !['40001', '40P01'].includes((error as { code?: string }).code ?? ''))
        throw error;
    }
  }
}

function principal(owner: CheckoutAuthority) {
  return owner.kind === 'GUEST' ? owner.sessionId : owner.accountId;
}
export async function receipt(
  tx: Transaction<DatabaseSchema>,
  owner: CheckoutAuthority,
  key: string,
  operation: string,
  body: unknown,
) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
    throw new CheckoutError('INVALID_REQUEST', 'A UUID idempotency key is required.');
  try {
    const record = await claimIdempotencyRecord(tx, {
      organizationId: owner.organizationId,
      principalType: `CHECKOUT_${owner.kind}`,
      principalId: principal(owner),
      operationType: `checkout.foundation.${operation}`,
      idempotencyKey: key,
      requestFingerprint: hashToken(JSON.stringify(body)),
    });
    if (record.created) return { id: record.id };
    const previous = await sql<{
      id: string;
    }>`select result_entity_id::text id from platform.idempotency_records
      where id=${record.id} and status='SUCCEEDED'`.execute(tx);
    if (!previous.rows[0]?.id)
      throw new CheckoutError('IDEMPOTENCY_CONFLICT', 'Checkout request is already in progress.');
    return { id: record.id, draftId: previous.rows[0].id };
  } catch (error) {
    if (error instanceof IdempotencyKeyReuseError)
      throw new CheckoutError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key was used for different content.',
      );
    throw error;
  }
}
export async function finish(
  tx: Transaction<DatabaseSchema>,
  receiptId: string,
  draftId: string,
  entityType = 'checkout.draft',
) {
  await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_type=${entityType},
    result_entity_id=${draftId},safe_response=${JSON.stringify(entityType === 'checkout.draft' ? { draftId } : { addressId: draftId })}::jsonb,completed_at=clock_timestamp(),expires_at=null
    where id=${receiptId}`.execute(tx);
}
async function capacity(tx: Transaction<DatabaseSchema>, owner: CheckoutAuthority) {
  const rows = await sql<{
    count: number;
  }>`select count(*)::integer count from orders.checkout_drafts
    where organization_id=${owner.organizationId} and status='ACTIVE' and expires_at>clock_timestamp()
      and ${owner.kind === 'GUEST' ? sql`guest_session_id=${owner.sessionId}` : sql`owner_account_id=${owner.accountId}`}`.execute(
    tx,
  );
  if (rows.rows[0]!.count >= 8)
    throw new CheckoutError(
      'DRAFT_LIMIT',
      'Resolve existing Checkout drafts before starting another.',
    );
}
async function lines(
  tx: Transaction<DatabaseSchema>,
  context: CheckoutContext,
  draftId: string,
  intent: Awaited<ReturnType<typeof checkoutSourceLines>>,
) {
  await sql`delete from orders.checkout_draft_lines where organization_id=${context.organizationId} and draft_id=${draftId}`.execute(
    tx,
  );
  await sql`insert into orders.checkout_draft_lines(organization_id,draft_id,variant_id,quantity,source_cart_line_id) values
    ${sql.join(intent.map((line) => sql`(${context.organizationId},${draftId},${line.variantId},${line.quantity}::integer,${line.cartLineId})`))}`.execute(
    tx,
  );
}
export async function audit(
  tx: Transaction<DatabaseSchema>,
  owner: CheckoutAuthority,
  id: string,
  action: string,
) {
  await appendAuditEvent(tx, {
    organizationId: owner.organizationId,
    actorType: owner.kind === 'GUEST' ? 'GUEST_CHECKOUT' : 'USER',
    actorId: owner.kind === 'GUEST' ? owner.sessionId : owner.userId,
    action: `checkout.draft.${action}`,
    targetType: 'checkout.draft',
    targetId: id,
    metadata: { implementationVersion: 2 },
  });
}
function contextMatches(context: CheckoutContext, owner: CheckoutAuthority) {
  if (context.organizationId !== owner.organizationId)
    throw new CheckoutError('NOT_FOUND', 'Checkout was not found.');
}
function canonicalSource(source: CheckoutSourceDto): CheckoutSourceDto {
  validateCheckoutSource(source);
  return source.kind === 'CART'
    ? { kind: 'CART', cartId: source.cartId.toLowerCase(), cartRevision: source.cartRevision }
    : { kind: 'BUY_NOW', variantId: source.variantId.toLowerCase(), quantity: source.quantity };
}
export async function createCheckoutDraft(
  db: Kysely<DatabaseSchema>,
  context: CheckoutContext,
  owner: CheckoutAuthority,
  input: CreateCheckoutDraftDto,
  key: string,
  cartToken?: string,
) {
  contextMatches(context, owner);
  const source = canonicalSource(input.source);
  return checkoutTransaction(db, async (tx) => {
    await lockCheckoutAuthority(tx, owner);
    const record = await receipt(tx, owner, key, 'initiate', {
      currency: context.currency,
      source,
    });
    if (record.draftId) return draftView(tx, await ownedDraft(tx, owner, record.draftId));
    await capacity(tx, owner);
    const intent = await checkoutSourceLines(tx, context, owner, source, cartToken);
    const row = await sql<{ id: string }>`insert into orders.checkout_drafts
      (organization_id,guest_session_id,owner_account_id,owner_customer_id,owner_user_id,source_kind,source_cart_id,source_revision,currency_code)
      values(${context.organizationId},${owner.kind === 'GUEST' ? owner.sessionId : null},${owner.kind === 'ACCOUNT' ? owner.accountId : null},
        ${owner.kind === 'ACCOUNT' ? owner.customerId : null},${owner.kind === 'ACCOUNT' ? owner.userId : null},${source.kind},
        ${source.kind === 'CART' ? source.cartId : null},${source.kind === 'CART' ? source.cartRevision : null}::bigint,${context.currency}) returning id`.execute(
      tx,
    );
    const id = row.rows[0]!.id;
    await lines(tx, context, id, intent);
    await finish(tx, record.id, id);
    await audit(tx, owner, id, 'created');
    return draftView(tx, await ownedDraft(tx, owner, id));
  });
}
export async function getCheckoutDraft(
  db: Kysely<DatabaseSchema>,
  owner: CheckoutAuthority,
  id: string,
) {
  return checkoutTransaction(db, async (tx) => {
    await lockCheckoutAuthority(tx, owner);
    return draftView(tx, await ownedDraft(tx, owner, id));
  });
}
export async function updateCheckoutDraft(
  db: Kysely<DatabaseSchema>,
  context: CheckoutContext,
  owner: CheckoutAuthority,
  id: string,
  input: UpdateCheckoutDraftDto,
  key: string,
  cartToken?: string,
) {
  contextMatches(context, owner);
  if (
    !/^[1-9][0-9]{0,18}$/.test(input.revision) ||
    (!input.source && input.action !== 'ABANDON') ||
    (input.source && input.action)
  )
    throw new CheckoutError(
      'INVALID_REQUEST',
      'Supply a revision and exactly one supported change.',
    );
  const source = input.source ? canonicalSource(input.source) : undefined;
  return checkoutTransaction(db, async (tx) => {
    await lockCheckoutAuthority(tx, owner);
    const record = await receipt(tx, owner, key, 'update', {
      id,
      revision: input.revision,
      source: source ?? null,
      action: input.action ?? null,
    });
    const row = await ownedDraft(tx, owner, record.draftId ?? id);
    if (record.draftId) return draftView(tx, row);
    const view = await draftView(tx, row);
    if (view.status !== 'ACTIVE')
      throw new CheckoutError('DRAFT_EXPIRED', 'Checkout draft is no longer active.');
    if (row.currency_code !== context.currency)
      throw new CheckoutError('SOURCE_CHANGED', 'Start a new Checkout for the current currency.');
    if (row.revision !== input.revision)
      throw new CheckoutError(
        'STALE_REVISION',
        'Checkout changed. Restore the draft before editing.',
      );
    if (source) {
      if (
        source.kind !== row.source_kind ||
        (source.kind === 'CART' &&
          !row.source_review_required &&
          source.cartId !== row.source_cart_id)
      )
        throw new CheckoutError(
          'SOURCE_CHANGED',
          'Start a new Checkout for a different purchase source.',
        );
      const intent = await checkoutSourceLines(tx, context, owner, source, cartToken);
      await lines(tx, context, id, intent);
    }
    await sql`update orders.checkout_drafts set revision=revision+1,updated_at=clock_timestamp(),
      status=${input.action === 'ABANDON' ? 'ABANDONED' : 'ACTIVE'},
      source_cart_id=${source?.kind === 'CART' ? source.cartId : row.source_cart_id},
      source_revision=${source?.kind === 'CART' ? source.cartRevision : row.source_revision}::bigint,
      source_review_required=${source ? false : row.source_review_required}
      where organization_id=${context.organizationId} and id=${id}`.execute(tx);
    await finish(tx, record.id, id);
    await audit(tx, owner, id, input.action === 'ABANDON' ? 'abandoned' : 'updated');
    return draftView(tx, await ownedDraft(tx, owner, id));
  });
}
export async function adoptCheckoutDraft(
  db: Kysely<DatabaseSchema>,
  account: Extract<CheckoutAuthority, { kind: 'ACCOUNT' }>,
  guest: Extract<CheckoutAuthority, { kind: 'GUEST' }>,
  id: string,
  revision: string,
  key: string,
) {
  if (account.organizationId !== guest.organizationId)
    throw new CheckoutError('NOT_FOUND', 'Checkout was not found.');
  return checkoutTransaction(db, async (tx) => {
    await lockCheckoutAuthority(tx, account);
    await lockCheckoutAuthority(tx, guest);
    const record = await receipt(tx, account, key, 'adopt', {
      id,
      revision,
      guestSessionId: guest.sessionId,
    });
    if (record.draftId) return draftView(tx, await ownedDraft(tx, account, record.draftId));
    const row = await ownedDraft(tx, guest, id);
    if ((await draftView(tx, row)).status !== 'ACTIVE')
      throw new CheckoutError('DRAFT_EXPIRED', 'Checkout draft is no longer active.');
    if (row.revision !== revision)
      throw new CheckoutError('STALE_REVISION', 'Checkout changed. Restore it before adopting.');
    await capacity(tx, account);
    await sql`update orders.checkout_drafts set guest_session_id=null,owner_account_id=${account.accountId},owner_customer_id=${account.customerId},
      owner_user_id=${account.userId},revision=revision+1,updated_at=clock_timestamp(),source_review_required=(source_kind='CART')
      where organization_id=${account.organizationId} and id=${id}`.execute(tx);
    await finish(tx, record.id, id);
    await audit(tx, account, id, 'adopted');
    return draftView(tx, await ownedDraft(tx, account, id));
  });
}
