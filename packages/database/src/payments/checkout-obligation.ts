import { sql, type Kysely, type Transaction } from 'kysely';
import type { CheckoutPlacementMethod } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { CheckoutError } from '../checkout/types.js';

type Tx = Transaction<DatabaseSchema>;
export type CheckoutPaymentSelection =
  | { method: 'COD' }
  | {
      method: Exclude<CheckoutPlacementMethod, 'COD'>;
      destinationId: string;
      destinationRevision?: string;
      operatingPolicyId: string;
    };

export async function checkoutPaymentConfiguration(
  tx: Kysely<DatabaseSchema>,
  organizationId: string,
  selection: CheckoutPaymentSelection,
  options?: { allowDisabled: boolean },
) {
  const unavailable = () =>
    new CheckoutError('PAYMENT_METHOD_UNAVAILABLE', 'Review the available payment methods.');
  const method = (
    await sql<{ id: string; revision: string }>`
    select id,version::text revision from payments.payment_methods
    where organization_id=${organizationId} and code=${selection.method}
      and (status='ACTIVE' or ${options?.allowDisabled ?? false})
      and method_type=${selection.method === 'COD' ? 'COD' : 'MOBILE_WALLET'}
  `.execute(tx)
  ).rows[0];
  if (!method) throw unavailable();
  if (selection.method === 'COD') return { method, destination: null, operatingPolicy: null };

  const destination = (
    await sql<{
      id: string;
      revision: string;
      instructions: Record<string, string>;
    }>`select d.id,d.revision::text,jsonb_build_object('provider',d.provider,'accountType',d.account_type,
      'transferAction',d.transfer_action,'accountNumber',d.receiving_number,'accountName',d.recipient_name,
      'text',d.instructions) instructions
    from payments.receiving_destinations d
    join payments.receiving_destination_history h on h.organization_id=d.organization_id
      and h.destination_id=d.id and h.revision=d.revision
    join finance.financial_accounts a on a.organization_id=d.organization_id and a.id=d.financial_account_id
    where d.organization_id=${organizationId} and d.id=${selection.destinationId}
      and h.snapshot @> jsonb_build_object('state',d.state,'provider',d.provider,'account_type',d.account_type,
        'receiving_number',d.receiving_number,'recipient_name',d.recipient_name,'transfer_action',d.transfer_action,
        'instructions',d.instructions,'financial_account_id',d.financial_account_id,'currency_code',d.currency_code)
      and d.state='APPROVED'
      and (${selection.destinationRevision ?? null}::bigint is null
        or d.revision=${selection.destinationRevision ?? null}::bigint)
      and d.approved_by is not null and d.approved_by<>d.created_by and d.approved_at is not null
      and length(btrim(d.provider_evidence_reference))>0
      and d.provider=${selection.method === 'BKASH_MANUAL' ? 'BKASH' : 'NAGAD'}
      and d.currency_code='BDT' and d.account_type='PERSONAL_RETAIL_ACCOUNT'
      and d.transfer_action='MERCHANT_PAYMENT' and a.status='ACTIVE' and a.currency_code='BDT' and a.account_type='MOBILE_WALLET'
  `.execute(tx)
  ).rows[0];
  const operatingPolicy = (
    await sql<{ id: string; submission_minutes: number; review_minutes: number }>`
    select id,submission_minutes,review_minutes from payments.operating_policy_revisions
    where organization_id=${organizationId} and id=${selection.operatingPolicyId}
      and length(btrim(approval_reference))>0
  `.execute(tx)
  ).rows[0];
  if (!destination || !operatingPolicy) throw unavailable();
  return { method, destination, operatingPolicy };
}

type Configuration = Awaited<ReturnType<typeof checkoutPaymentConfiguration>>;

/** Called only after placement has independently resolved and matched final terms under its fence. */
export async function insertCheckoutObligationInTransaction(
  tx: Tx,
  input: {
    organizationId: string;
    orderId: string;
    method: CheckoutPlacementMethod;
    payable: string;
    config: Configuration;
  },
) {
  const { method, destination, operatingPolicy } = input.config;
  const result = await sql<{ id: string }>`
    insert into payments.payment_intents(organization_id,order_id,order_number_snapshot,payment_method_id,
      currency_code,expected_amount,status,instructions_snapshot,expires_at,review_expires_at,
      destination_id,destination_revision,operating_policy_id)
    select o.organization_id,o.id,o.order_number,${method.id},o.currency_code,o.total_amount,'READY',
      ${JSON.stringify(destination?.instructions ?? {})}::jsonb,
      case when ${operatingPolicy?.submission_minutes ?? null}::integer is not null then
        statement_timestamp()+make_interval(mins=>${operatingPolicy?.submission_minutes ?? null}::integer) end,
      case when ${operatingPolicy?.review_minutes ?? null}::integer is not null then
        statement_timestamp()+make_interval(mins=>${operatingPolicy ? operatingPolicy.submission_minutes + operatingPolicy.review_minutes : null}::integer) end,
      ${destination?.id ?? null},${destination?.revision ?? null}::bigint,${operatingPolicy?.id ?? null}
    from orders.orders o where o.organization_id=${input.organizationId} and o.id=${input.orderId}
      and o.currency_code='BDT' and o.payment_method=${input.method} and o.total_amount=${input.payable}::numeric
    returning id`.execute(tx);
  if (!result.rows[0]) throw new Error('Checkout obligation does not match the Order.');
  return result.rows[0].id;
}
