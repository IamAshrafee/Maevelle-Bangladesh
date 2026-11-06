import { sql, type Transaction } from 'kysely';
import type {
  CheckoutOrderPaymentDto,
  CheckoutPaymentClaimDto,
  CheckoutWalletInstructionsDto,
} from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { getOrderPaymentSummary } from '../payments.js';
import { CheckoutError } from '../checkout/types.js';
import { checkoutPaymentConfiguration } from './checkout-obligation.js';

type Tx = Transaction<DatabaseSchema>;
type Binding = {
  organizationId: string;
  orderId: string;
  intentId: string;
  terms: { method: CheckoutOrderPaymentDto['method']; payable: string };
};

type Intent = {
  status: CheckoutOrderPaymentDto['obligationStatus'];
  currency_code: string;
  payment_method_id: string;
  destination_id: string | null;
  destination_revision: string | null;
  operating_policy_id: string | null;
  instructions_snapshot: Partial<CheckoutWalletInstructionsDto>;
  expires_at: Date | null;
  review_expires_at: Date | null;
};

type WalletDecision =
  | { reason: 'AVAILABLE'; instructions: CheckoutWalletInstructionsDto }
  | {
      reason: Exclude<CheckoutOrderPaymentDto['claimAvailability'], 'AVAILABLE'>;
      instructions?: never;
    };

async function usableWallet(
  tx: Tx,
  organizationId: string,
  method: Exclude<Binding['terms']['method'], 'COD'>,
  intent: Intent,
): Promise<WalletDecision> {
  if (!intent.operating_policy_id) return { reason: 'POLICY_BLOCKED' };
  if (!intent.destination_id) return { reason: 'DESTINATION_UNAVAILABLE' };

  // Lock the exact current method, destination and linked Finance account through the decision.
  const active =
    await sql`select id from payments.payment_methods where organization_id=${organizationId}
    and id=${intent.payment_method_id} and code=${method} and status='ACTIVE' and method_type='MOBILE_WALLET'
    for share`.execute(tx);
  if (!active.rows.length) return { reason: 'PAYMENT_METHOD_UNAVAILABLE' };

  const destination = (
    await sql<{ financial_account_id: string }>`select financial_account_id
    from payments.receiving_destinations where organization_id=${organizationId} and id=${intent.destination_id}
      and revision=${intent.destination_revision}::bigint and state='APPROVED' for share`.execute(
      tx,
    )
  ).rows[0];
  if (!destination) return { reason: 'DESTINATION_UNAVAILABLE' };
  await sql`select id from finance.financial_accounts where organization_id=${organizationId}
    and id=${destination.financial_account_id} for share`.execute(tx);

  const configured = await checkoutPaymentConfiguration(tx, organizationId, {
    method,
    destinationId: intent.destination_id,
    operatingPolicyId: intent.operating_policy_id,
  }).catch((error: unknown) => {
    if (error instanceof CheckoutError && error.code === 'PAYMENT_METHOD_UNAVAILABLE') return null;
    throw error;
  });
  const current = configured?.destination;
  const { provider, accountType, transferAction, accountNumber, accountName, text } =
    intent.instructions_snapshot;
  const instructions = { provider, accountType, transferAction, accountNumber, accountName, text };
  if (
    !current ||
    configured.method.id !== intent.payment_method_id ||
    current.revision !== intent.destination_revision ||
    !provider ||
    !accountType ||
    !transferAction ||
    !accountNumber ||
    accountName === undefined ||
    text === undefined ||
    Object.entries(instructions).some(([key, value]) => current.instructions[key] !== value)
  ) {
    return { reason: 'DESTINATION_UNAVAILABLE' };
  }
  return {
    reason: 'AVAILABLE',
    instructions: { provider, accountType, transferAction, accountNumber, accountName, text },
  };
}

type ClaimRow = Omit<CheckoutPaymentClaimDto, 'submittedAt'> & { submittedAt: Date };

export async function readCheckoutClaims(tx: Tx, binding: Binding, claimId?: string) {
  const { organizationId, intentId } = binding;
  const selection = sql`select id, status, review_state as "reviewState", submitted_at as "submittedAt"
    from payments.payment_attempts where organization_id=${organizationId}
      and payment_intent_id=${intentId}`;
  const order = sql`order by submitted_at desc,id desc`;
  const rows = claimId
    ? await sql<ClaimRow>`${selection} and id=${claimId}`.execute(tx)
    : await sql<ClaimRow>`(${selection} ${order} limit 1)
        union (${selection} and status='PENDING_VERIFICATION' ${order} limit 5)
        order by "submittedAt" desc,id desc`.execute(tx);
  return rows.rows.map((row) => ({ ...row, submittedAt: row.submittedAt.toISOString() }));
}

/** Keep the customer view and any new claim on the same Order/intent lock path as receipt verification. */
export async function readCheckoutOrderPayment(
  tx: Tx,
  binding: Binding,
  collectionAuthorized: boolean,
): Promise<CheckoutOrderPaymentDto> {
  const { organizationId, orderId, intentId, terms } = binding;
  const order = (
    await sql<{
      order_number: string;
      order_status: CheckoutOrderPaymentDto['orderStatus'];
      total_amount: string;
      payment_method: string;
    }>`select order_number,order_status,total_amount::text,payment_method from orders.orders
    where organization_id=${organizationId} and id=${orderId} for update`.execute(tx)
  ).rows[0]!;
  const intent = (
    await sql<Intent>`select status,currency_code,payment_method_id,destination_id,destination_revision::text,
    operating_policy_id,instructions_snapshot,expires_at,review_expires_at
    from payments.payment_intents where organization_id=${organizationId} and order_id=${orderId}
    and id=${intentId} for update`.execute(tx)
  ).rows[0]!;
  const summary = await getOrderPaymentSummary(tx, {
    organizationId,
    orderId,
    intentId,
    paymentMethod: terms.method,
    expectedAmount: order.total_amount,
  });
  const claims = terms.method === 'COD' ? [] : await readCheckoutClaims(tx, binding);
  const openClaims = claims.filter(({ status }) => status === 'PENDING_VERIFICATION');
  const financial = (
    await sql<{
      verified: string;
      unallocated_at_verification: string;
      has_late_receipt: boolean;
      reversed: boolean;
      refund_states: string[];
    }>`with receipts as (
      select p.amount,p.status,e.unallocated_amount,e.disposition
      from payments.payment_attempts a
      join payments.payments p on p.organization_id=a.organization_id and p.source_attempt_id=a.id
      left join payments.verified_receipt_evidence e on e.organization_id=p.organization_id
        and e.payment_id=p.id and e.order_id=${orderId}
      where a.organization_id=${organizationId} and a.payment_intent_id=${intentId}
    ) select
    coalesce(sum(amount) filter(where status='CONFIRMED' and disposition is not null),0.0000)::text verified,
    coalesce(sum(unallocated_amount) filter(where status='CONFIRMED'),0.0000)::text unallocated_at_verification,
    coalesce(bool_or(disposition='LATE_RECEIPT_LIABILITY' and status='CONFIRMED'),false) has_late_receipt,
    coalesce(bool_or(status in ('REVERSED','VOIDED')),false) reversed,
    array(select distinct status from payments.refunds where organization_id=${organizationId}
      and order_id=${orderId} order by status) refund_states from receipts`.execute(tx)
  ).rows[0]!;

  let claimAvailability: CheckoutOrderPaymentDto['claimAvailability'];
  let instructions: CheckoutWalletInstructionsDto | null = null;
  if (terms.method === 'COD') claimAvailability = 'COD';
  else if (order.order_status === 'CANCELLED' || intent.status === 'CANCELLED')
    claimAvailability = 'ORDER_CANCELLED';
  else if (intent.status === 'SATISFIED' || /^0(?:\.0+)?$/.test(summary.outstanding))
    claimAvailability = 'PAYMENT_ALREADY_SETTLED';
  else if (
    order.order_status !== 'PENDING' ||
    financial.reversed ||
    financial.refund_states.length ||
    summary.expected !== order.total_amount ||
    intent.currency_code !== 'BDT' ||
    order.payment_method !== terms.method
  )
    claimAvailability = 'PAYMENT_SUPPORT_REQUIRED';
  else {
    const wallet: WalletDecision =
      collectionAuthorized && intent.expires_at && intent.review_expires_at
        ? await usableWallet(tx, organizationId, terms.method, intent)
        : { reason: 'POLICY_BLOCKED' };
    // Evaluate database time after any configuration lock waits.
    const expired = (
      await sql<{ expired: boolean | null }>`select
      ${intent.expires_at}::timestamptz<=clock_timestamp() expired`.execute(tx)
    ).rows[0]?.expired;
    claimAvailability =
      intent.status === 'EXPIRED' || expired ? 'PAYMENT_WINDOW_EXPIRED' : wallet.reason;
    instructions = wallet.instructions ?? null;
  }
  const transferAvailability =
    claimAvailability === 'AVAILABLE' && openClaims.length
      ? 'CLAIM_UNDER_REVIEW'
      : claimAvailability;
  return {
    orderId,
    orderNumber: order.order_number,
    orderStatus: order.order_status,
    method: terms.method,
    currency: 'BDT',
    originalPayable: terms.payable,
    allocated: summary.collected,
    refundedFromAllocation: summary.refunded,
    outstanding: summary.outstanding,
    verifiedWalletReceipts: financial.verified,
    unallocatedAtVerification: financial.unallocated_at_verification,
    hasLateReceipt: financial.has_late_receipt,
    hasReceiptReversal: financial.reversed,
    refundStates: financial.refund_states,
    paymentStatus: summary.status,
    obligationStatus: intent.status,
    submissionDeadline: intent.expires_at?.toISOString() ?? null,
    reviewDeadline: intent.review_expires_at?.toISOString() ?? null,
    transferAvailability,
    claimAvailability,
    instructions: transferAvailability === 'AVAILABLE' ? instructions : null,
    latestClaim: claims[0] ?? null,
    openClaims,
  };
}
