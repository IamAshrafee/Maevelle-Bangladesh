import { sql, type Kysely, type Transaction } from 'kysely';
import type {
  CheckoutPlacementMethod,
  CheckoutPlacementResultDto,
  PlaceCheckoutDto,
} from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { hashToken } from '@maevelle/security';
import { appendAuditEvent, isOperationalControlEnabled } from '../platform.js';
import {
  CustomerDomainError,
  resolveOrCreateOrderCustomerInTransaction,
  activeOrderCustomerRestrictions,
} from '../customers.js';
import { InventoryDomainError } from '../inventory.js';
import { PromotionCapacityError } from '../promotions-redemption.js';
import { CartDomainError } from '../cart/errors.js';
import { convertReviewedCartInTransaction } from '../cart/checkout-source.js';
import { writeCheckoutOrder, type PlacementCheckpoint } from '../orders/checkout-write.js';
import { insertCheckoutObligationInTransaction } from '../payments/checkout-obligation.js';
import { lockCheckoutAuthority } from './authority.js';
import { checkoutTransaction, receipt } from './commands.js';
import { draftStatus, ownedDraft } from './queries.js';
import { evaluateCheckoutInTransaction } from './quote-evaluation.js';
import { loadQuote } from './quote-store.js';
import { finalCheckoutTerms, type PlacementPolicy } from './final-terms.js';
import { lockPlacementConfiguration } from './placement-fence.js';
import { CheckoutError, type CheckoutAuthority, type DraftRow } from './types.js';
import { committedCheckoutRow } from './placement-status.js';
import { checkoutGuestOrderCredential } from './guest-order-credential.js';

type Tx = Transaction<DatabaseSchema>;
type ReviewInput = Omit<PlaceCheckoutDto, 'finalTermsFingerprint'>;
type Command = { draftId: string; owner: CheckoutAuthority; cartToken?: string | undefined };

function requirePolicy(policy: PlacementPolicy | null): PlacementPolicy {
  if (!policy)
    throw new CheckoutError(
      'POLICY_BLOCKED',
      'Final payment, tax and delivery approvals are unavailable.',
    );
  return policy;
}

async function assertLiveTerms(tx: Tx, draft: DraftRow, expiresAt: Date) {
  if ((await draftStatus(tx, draft)) !== 'ACTIVE')
    throw new CheckoutError('DRAFT_EXPIRED', 'Start a new Checkout.');
  const expired = await sql<{
    expired: boolean;
  }>`select ${expiresAt}::timestamptz<=clock_timestamp() expired`.execute(tx);
  if (expired.rows[0]!.expired) throw new CheckoutError('QUOTE_EXPIRED', 'Review a new quote.');
}

function assertPurchaseAllowed(restrictions: readonly string[], method: CheckoutPlacementMethod) {
  if (
    restrictions.includes('ORDERING_BLOCKED') ||
    restrictions.includes('ORDER_REVIEW_REQUIRED') ||
    (method === 'COD' && restrictions.includes('COD_RESTRICTED'))
  )
    throw new CheckoutError(
      'CUSTOMER_RESTRICTED',
      'This Checkout cannot use the selected payment method.',
    );
}

async function review(
  tx: Tx,
  cmd: Command,
  draft: DraftRow,
  input: ReviewInput,
  policy: PlacementPolicy,
) {
  const { owner, draftId, cartToken } = cmd;
  if (draft.revision !== input.revision || draft.current_quote_id !== input.quoteId)
    throw new CheckoutError('STALE_REVISION', 'Review the current Checkout.');
  const quote = await loadQuote(tx, owner.organizationId, draftId, input.quoteId);
  await assertLiveTerms(tx, draft, quote.expires_at);
  const acknowledgement = await sql`select 1 from orders.checkout_quote_acknowledgements
    where organization_id=${owner.organizationId} and draft_id=${draftId} and quote_id=${quote.id}`.execute(
    tx,
  );
  if (
    !acknowledgement.rows.length ||
    quote.draft_revision !== input.revision ||
    quote.fingerprint !== input.quoteFingerprint
  )
    throw new CheckoutError('QUOTE_REVIEW_REQUIRED', 'Acknowledge the exact current quote.');
  await lockPlacementConfiguration(tx);
  if (!(await isOperationalControlEnabled(tx, owner.organizationId, 'checkout_enabled')))
    throw new CheckoutError('CHECKOUT_DISABLED', 'Checkout is temporarily unavailable.');
  if (owner.kind === 'ACCOUNT')
    assertPurchaseAllowed(
      await activeOrderCustomerRestrictions(tx, owner.organizationId, owner.customerId),
      input.method,
    );
  const evaluation = await evaluateCheckoutInTransaction(
    tx,
    owner,
    draft,
    quote.source_kind === 'BUY_NOW' ? quote.coupons.map((c) => c.code) : [],
    cartToken,
  );
  if (evaluation.fingerprint !== quote.fingerprint)
    throw new CheckoutError('CONFIGURATION_CHANGED', 'Review the current commercial terms.');
  const final = await finalCheckoutTerms(
    tx,
    owner.organizationId,
    quote,
    evaluation,
    input.method,
    policy,
  );
  return { ...final, evaluation, quote };
}

const reviewCodes = new Set([
  'STALE_REVISION',
  'DRAFT_EXPIRED',
  'QUOTE_EXPIRED',
  'QUOTE_REVIEW_REQUIRED',
  'FINAL_TERMS_CHANGED',
  'SOURCE_CHANGED',
  'SOURCE_INELIGIBLE',
  'CONFIGURATION_CHANGED',
  'VARIANT_UNAVAILABLE',
  'ADDRESS_CHANGED',
  'DELIVERY_CHANGED',
  'DELIVERY_UNAVAILABLE',
  'UNSUPPORTED_AREA',
  'INSUFFICIENT_STOCK',
  'PAYMENT_METHOD_UNAVAILABLE',
  'CUSTOMER_RESTRICTED',
]);
function reviewReason(error: unknown) {
  if (error instanceof CheckoutError && reviewCodes.has(error.code)) return error.code;
  if (error instanceof PromotionCapacityError) return 'PROMOTION_UNAVAILABLE';
  if (error instanceof InventoryDomainError && error.code === 'INSUFFICIENT_STOCK')
    return error.code;
  if (error instanceof CartDomainError && error.code === 'NOT_FOUND') return 'SOURCE_CHANGED';
  if (error instanceof CustomerDomainError && error.code === 'CUSTOMER_BLOCKED')
    return 'CUSTOMER_RESTRICTED';
  return null;
}

async function finishPlacement(
  tx: Tx,
  id: string,
  draftId: string,
  result: CheckoutPlacementResultDto,
) {
  const orderId = result.kind === 'COMMITTED' ? result.receipt.orderId : null;
  const safe = result.kind === 'COMMITTED' ? { kind: result.kind } : result;
  await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_type=${orderId ? 'orders.order' : 'checkout.review'},
    result_entity_id=${orderId ?? draftId},safe_response=${JSON.stringify(safe)}::jsonb,
    completed_at=clock_timestamp(),expires_at=null where id=${id}`.execute(tx);
}

/** Package-internal composition seam. Public exports are bound to the fail-closed resolver. */
export function checkoutPlacementEngine(
  policy: PlacementPolicy | null,
  fault?: (stage: PlacementCheckpoint) => void | Promise<void>,
) {
  return {
    review: (db: Kysely<DatabaseSchema>, cmd: Command, input: ReviewInput) =>
      checkoutTransaction(db, async (tx) => {
        await sql`set local transaction_timeout='12s'`.execute(tx);
        await lockCheckoutAuthority(tx, cmd.owner);
        const draft = await ownedDraft(tx, cmd.owner, cmd.draftId);
        const final = await review(tx, cmd, draft, input, requirePolicy(policy));
        await assertLiveTerms(tx, draft, final.quote.expires_at);
        return final.terms;
      }),
    place: (
      db: Kysely<DatabaseSchema>,
      cmd: Command,
      input: PlaceCheckoutDto,
      key: string,
    ): Promise<CheckoutPlacementResultDto> =>
      checkoutTransaction(db, async (tx) => {
        await sql`set local transaction_timeout='12s'`.execute(tx);
        const { owner, draftId } = cmd,
          org = owner.organizationId;
        await lockCheckoutAuthority(tx, owner, { customerWrite: true });
        const draft = await ownedDraft(tx, owner, draftId);
        const record = await receipt(tx, owner, key.toLowerCase(), 'placement.v1', {
          draftId,
          revision: input.revision,
          quoteId: input.quoteId,
          quoteFingerprint: input.quoteFingerprint,
          finalTermsFingerprint: input.finalTermsFingerprint,
          method: input.method,
        });
        if (record.draftId) {
          const stored = (
            await sql<{
              safe_response:
                | { kind: 'COMMITTED' }
                | Extract<CheckoutPlacementResultDto, { kind: 'REVIEW_REQUIRED' }>;
            }>`
            select safe_response from platform.idempotency_records where id=${record.id}`.execute(
              tx,
            )
          ).rows[0]!.safe_response;
          if (stored.kind === 'REVIEW_REQUIRED') return stored;
          const committed = await committedCheckoutRow(tx, org, draftId);
          if (!committed || committed.order_id !== record.draftId)
            throw new Error('Placement receipt is inconsistent.');
          return {
            kind: 'COMMITTED',
            receipt: {
              orderId: committed.order_id,
              orderNumber: committed.order_number,
              terms: committed.final_terms.terms,
            },
          };
        }
        if (draft.status === 'COMMITTED' || (await committedCheckoutRow(tx, org, draftId)))
          throw new CheckoutError(
            'CHECKOUT_COMMITTED',
            'Checkout already has an Order. Recover the committed result.',
          );
        const approvedPolicy = requirePolicy(policy);
        const limit = await sql<{
          reached: boolean;
        }>`select count(*)>=64 reached from platform.idempotency_records
          where organization_id=${org} and result_entity_id=${draftId} and
            operation_type='checkout.foundation.placement.v1' and result_entity_type='checkout.review'`.execute(
          tx,
        );
        if (limit.rows[0]!.reached)
          throw new CheckoutError('PLACEMENT_REVIEW_LIMIT', 'Start a new Checkout.');

        await sql`savepoint checkout_effects`.execute(tx);
        try {
          const final = await review(tx, cmd, draft, input, approvedPolicy);
          if (final.terms.fingerprint !== input.finalTermsFingerprint)
            throw new CheckoutError(
              'FINAL_TERMS_CHANGED',
              'Review the exact final payable and payment method.',
            );
          const actorId = owner.kind === 'ACCOUNT' ? owner.userId : owner.sessionId;
          const d = final.evaluation.delivery;
          const customer =
            owner.kind === 'ACCOUNT'
              ? {
                  customerId: owner.customerId,
                  activeRestrictions: await activeOrderCustomerRestrictions(
                    tx,
                    org,
                    owner.customerId,
                  ),
                }
              : await resolveOrCreateOrderCustomerInTransaction(tx, {
                  organizationId: org,
                  actorId,
                  actorType: 'GUEST_CHECKOUT',
                  displayName: d.recipientName,
                  phone: d.mobile,
                  source: 'STOREFRONT',
                });
          assertPurchaseAllowed(customer.activeRestrictions, input.method);

          const order = await writeCheckoutOrder(tx, {
            organizationId: org,
            draftId,
            actorId,
            actorType: owner.kind === 'GUEST' ? 'GUEST_CHECKOUT' : 'USER',
            customerId: customer.customerId,
            evaluation: final.evaluation,
            terms: final.terms,
            ...(fault ? { fault } : {}),
          });
          const intentId = await insertCheckoutObligationInTransaction(tx, {
            organizationId: org,
            orderId: order.orderId,
            method: input.method,
            payable: final.terms.payable,
            config: final.payment,
          });
          await fault?.('payment');
          if (draft.source_cart_id && draft.source_revision) {
            await convertReviewedCartInTransaction(tx, {
              organizationId: org,
              cartId: draft.source_cart_id,
              revision: draft.source_revision,
              customerId: customer.customerId,
            });
            await fault?.('cart');
          }
          const guestHash =
            owner.kind === 'GUEST'
              ? hashToken(checkoutGuestOrderCredential(owner, draftId, order.orderId))
              : null;
          await sql`insert into orders.checkout_placements(organization_id,draft_id,quote_id,order_id,intent_id,final_terms,
              delivery_instructions,guest_grant_hash,guest_grant_expires_at)
            values(${org},${draftId},${final.quote.id},${order.orderId},${intentId},
              ${JSON.stringify({ terms: final.terms, evidence: final.evidence })}::jsonb,${d.instructions ?? null},${guestHash},
              (select expires_at from orders.checkout_guest_sessions where organization_id=${org}
                and id=${owner.kind === 'GUEST' ? owner.sessionId : null}))`.execute(tx);
          await appendAuditEvent(tx, {
            organizationId: org,
            actorId,
            actorType: owner.kind === 'ACCOUNT' ? 'USER' : 'GUEST_CHECKOUT',
            action: 'orders.order.placed',
            targetType: 'orders.order',
            targetId: order.orderId,
            metadata: {
              orderNumber: order.orderNumber,
              paymentMethod: input.method,
              checkoutDraftId: draftId,
            },
          });
          await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
            values(${org},'orders.order.placed',1,'orders.order',${order.orderId},1,${JSON.stringify(order)}::jsonb,clock_timestamp())`.execute(
            tx,
          );
          await fault?.('outbox');
          await assertLiveTerms(tx, draft, final.quote.expires_at);
          await lockCheckoutAuthority(tx, owner);
          await sql`update orders.checkout_drafts set status='COMMITTED',revision=revision+1,updated_at=clock_timestamp()
            where organization_id=${org} and id=${draftId}`.execute(tx);
          const result = { kind: 'COMMITTED', receipt: { ...order, terms: final.terms } } as const;
          await finishPlacement(tx, record.id, draftId, result);
          return result;
        } catch (error) {
          const reason = reviewReason(error);
          if (!reason) throw error;
          await sql`rollback to savepoint checkout_effects`.execute(tx);
          const result = { kind: 'REVIEW_REQUIRED', reason } as const;
          await finishPlacement(tx, record.id, draftId, result);
          return result;
        }
      }),
  };
}

const disabledEngine = checkoutPlacementEngine(null);
export const reviewCheckoutFinalTerms = disabledEngine.review;
export const placeReviewedCheckout = disabledEngine.place;
