import { sql, type Kysely } from 'kysely';
import type { SubmitCheckoutPaymentClaimDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import {
  normalizeExternalReference,
  PaymentDomainError,
  recordManualClaimInTransaction,
} from '../payments.js';
import {
  readCheckoutClaims,
  readCheckoutOrderPayment,
} from '../payments/checkout-order-payment.js';
import { checkoutPrincipalId, checkoutTransaction, finish, receipt } from './commands.js';
import { requireCheckoutOrderGrant, requireCommittedCheckout } from './placement-status.js';
import { CheckoutError, type CheckoutAuthority } from './types.js';

const claimOperation = 'order-payment-claim.v1';

type Access = { owner: CheckoutAuthority; draftId: string; guestCredential?: string };

function canonicalClaim(input: SubmitCheckoutPaymentClaimDto) {
  const transactionId = input.transactionId.trim();
  if (!/^[A-Za-z0-9-]{4,128}$/.test(transactionId))
    throw new CheckoutError('INVALID_REQUEST', 'Enter a valid transaction ID.');
  const sendingMobile = input.sendingMobile;
  if (sendingMobile !== undefined && !/^01[3-9][0-9]{8}$/.test(sendingMobile))
    throw new CheckoutError('INVALID_REQUEST', 'Enter a valid Bangladesh sending mobile.');
  return { transactionId, sendingMobile };
}

/** The eligible path is exercised inside disposable fixtures. Routes only use the disabled instance. */
export function checkoutOrderPaymentEngine(collectionAuthorized: boolean) {
  return {
    get(db: Kysely<DatabaseSchema>, access: Access) {
      const { owner, draftId, guestCredential } = access;
      return checkoutTransaction(db, async (tx) => {
        await sql`set local transaction_timeout='12s'`.execute(tx);
        const row = await requireCommittedCheckout(tx, owner, draftId, guestCredential);
        const result = await readCheckoutOrderPayment(
          tx,
          {
            organizationId: owner.organizationId,
            orderId: row.order_id,
            intentId: row.intent_id,
            terms: row.final_terms.terms,
          },
          collectionAuthorized,
        );
        await requireCheckoutOrderGrant(tx, owner, draftId, guestCredential);
        return result;
      });
    },
    recover(db: Kysely<DatabaseSchema>, access: Access, key: string) {
      const { owner, draftId, guestCredential } = access;
      return checkoutTransaction(db, async (tx) => {
        await sql`set local transaction_timeout='12s'`.execute(tx);
        const row = await requireCommittedCheckout(tx, owner, draftId, guestCredential);
        const prior = (
          await sql<{ id: string }>`select result_entity_id::text id
          from platform.idempotency_records where organization_id=${owner.organizationId}
            and principal_type=${`CHECKOUT_${owner.kind}`}
            and principal_id=${checkoutPrincipalId(owner)}
            and operation_type=${`checkout.foundation.${claimOperation}`}
            and idempotency_key=${key} and status='SUCCEEDED'
            and result_entity_type='payments.payment_attempt'`.execute(tx)
        ).rows[0];
        const [claim] = prior
          ? await readCheckoutClaims(
              tx,
              {
                organizationId: owner.organizationId,
                orderId: row.order_id,
                intentId: row.intent_id,
                terms: row.final_terms.terms,
              },
              prior.id,
            )
          : [];
        await requireCheckoutOrderGrant(tx, owner, draftId, guestCredential);
        if (!claim) throw new CheckoutError('NOT_FOUND', 'Payment claim was not found.');
        return claim;
      });
    },
    async submit(
      db: Kysely<DatabaseSchema>,
      access: Access,
      input: SubmitCheckoutPaymentClaimDto,
      key: string,
    ) {
      const { owner, draftId, guestCredential } = access;
      const claim = canonicalClaim(input);
      return checkoutTransaction(db, async (tx) => {
        await sql`set local transaction_timeout='12s'`.execute(tx);
        const row = await requireCommittedCheckout(tx, owner, draftId, guestCredential);
        const binding = {
          organizationId: owner.organizationId,
          orderId: row.order_id,
          intentId: row.intent_id,
          terms: row.final_terms.terms,
        };
        // Resolve exact retries before current commercial eligibility. Live ownership is always first.
        const record = await receipt(tx, owner, key, claimOperation, {
          orderId: row.order_id,
          ...claim,
        });
        let attemptId = record.draftId;
        if (!attemptId) {
          const view = await readCheckoutOrderPayment(tx, binding, collectionAuthorized);
          if (view.claimAvailability !== 'AVAILABLE' || view.method === 'COD')
            throw new CheckoutError(
              view.claimAvailability,
              'Payment details cannot be submitted for this Order.',
            );
          await requireCheckoutOrderGrant(tx, owner, draftId, guestCredential);
          // The Order and intent locks serialize distinct-key submissions with one another.
          const duplicate = await sql`select 1 from payments.payment_attempts
            where organization_id=${binding.organizationId} and payment_intent_id=${binding.intentId}
              and customer_reference=${claim.transactionId} and status in ('PENDING_VERIFICATION','VERIFIED')
            limit 1`.execute(tx);
          if (duplicate.rows.length)
            throw new CheckoutError(
              'CLAIM_ALREADY_SUBMITTED',
              'Review the payment details already submitted.',
            );
          try {
            attemptId = await recordManualClaimInTransaction(tx, {
              ...binding,
              method: view.method,
              customerReference: claim.transactionId,
              normalizedReference: normalizeExternalReference(claim.transactionId),
              ...(claim.sendingMobile ? { payerReference: claim.sendingMobile } : {}),
              actor:
                owner.kind === 'ACCOUNT'
                  ? { type: 'USER', id: owner.userId }
                  : { type: 'GUEST_CHECKOUT', id: owner.sessionId },
            });
          } catch (error) {
            if (error instanceof PaymentDomainError && error.code === 'CLAIM_LIMIT_REACHED')
              throw new CheckoutError(error.code, error.message);
            throw error;
          }
          await finish(tx, record.id, attemptId, 'payments.payment_attempt');
        }
        const [result] = await readCheckoutClaims(tx, binding, attemptId);
        if (!result)
          throw new Error('Checkout claim receipt does not match its payment obligation.');
        await requireCheckoutOrderGrant(tx, owner, draftId, guestCredential);
        return result;
      });
    },
  };
}

const publicEngine = checkoutOrderPaymentEngine(false);
export const getCheckoutOrderPayment = publicEngine.get;
export const submitCheckoutPaymentClaim = publicEngine.submit;
export const recoverCheckoutPaymentClaim = publicEngine.recover;
