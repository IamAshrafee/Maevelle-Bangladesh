import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { manualPaymentFixture } from './manual-payment-fixture.js';
import {
  configurePaymentMethod,
  createPaymentIntentForOrder,
  recordCodCollection,
} from '../payments.js';
import { createLocation } from '../warehouse.js';
import {
  proposeCashShortfallPolicy,
  approveCashShortfallPolicy,
} from '../payments/cash-shortfall/policies.js';
import type { CashShortfallPolicyInputDto } from '@maevelle/contracts';

/** Real semantic COD receipt against explicitly synthetic delivered Order facts. Never provider evidence. */
export async function cashSettlementFixture(
  db: Kysely<DatabaseSchema>,
  overrides: Partial<CashShortfallPolicyInputDto> = {},
) {
  const f = await manualPaymentFixture(db);
  const reviewer = await f.actor([
    'payments.cash_policies.approve',
    'payments.cash_adjustments.approve',
    'payments.correct',
  ]);
  await configurePaymentMethod(db, {
    organizationId: f.organizationId,
    actorId: f.owner,
    code: 'COD',
    name: 'Synthetic COD',
    status: 'ACTIVE',
    displayOrder: 1,
  });
  const location = await createLocation(db, {
    organizationId: f.organizationId,
    actorId: f.owner,
    code: 'CASH',
    name: 'Synthetic cash collection',
    locationType: 'WAREHOUSE',
    capabilities: ['STOCK_HOLDING'],
  });
  const method = (
    await sql<{
      id: string;
    }>`insert into delivery.delivery_methods(organization_id,code,name,method_type)
    values(${f.organizationId},'HOME_DELIVERY','Synthetic courier','HOME_DELIVERY') returning id`.execute(
      db,
    )
  ).rows[0]!;
  const definition: CashShortfallPolicyInputDto = {
    revision: 'synthetic-cash-v1',
    scope: 'SYNTHETIC',
    maximumPerAdjustment: '1',
    maximumPerOrder: '1',
    maximumPerStaffDay: '10',
    selfApprovalLimit: '1',
    allowedOrderStates: ['PENDING', 'CONFIRMED', 'COMPLETED'],
    effectiveFrom: new Date(Date.now() - 60000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    accountingReference:
      'SYNTHETIC non-cash receivable reduction; no production accounting approval',
    invoiceTreatmentReference: 'SYNTHETIC no invoice effect approval',
    courierShortCollectionReference: 'SYNTHETIC courier permits exact documented short collection',
    ...overrides,
  };
  const proposal = await proposeCashShortfallPolicy(db, {
    organizationId: f.organizationId,
    actorId: f.owner,
    policy: definition,
  });
  const policy = await approveCashShortfallPolicy(db, {
    organizationId: f.organizationId,
    actorId: reviewer,
    proposalId: proposal.id,
    approvalReference: 'SYNTHETIC independent fixture approval only',
  });
  async function collect(received = '80', total = '81') {
    const order = (
      await sql<{
        id: string;
        order_number: string;
      }>`insert into orders.orders(organization_id,order_number,source,sales_channel,currency_code,payment_method,subtotal_amount,discount_amount,total_amount)
      values(${f.organizationId},${'SYN-' + crypto.randomUUID()},'MANUAL','ADMIN','BDT','COD',${total}::numeric,0,${total}::numeric) returning id,order_number`.execute(
        db,
      )
    ).rows[0]!;
    const intent = await createPaymentIntentForOrder(db, {
      organizationId: f.organizationId,
      orderId: order.id,
      orderNumber: order.order_number,
      currency: 'BDT',
      paymentMethod: 'COD',
      expectedAmount: total,
    });
    const fulfillment = (
      await sql<{
        id: string;
      }>`insert into fulfillment.fulfillments(organization_id,fulfillment_number,order_id,location_id,status)
      values(${f.organizationId},${'SYN-' + crypto.randomUUID()},${order.id},${location.id},'DISPATCHED') returning id`.execute(
        db,
      )
    ).rows[0]!;
    const delivery = (
      await sql<{
        id: string;
      }>`insert into delivery.deliveries(organization_id,delivery_number,order_id,fulfillment_id,delivery_method_id,
      operational_status,outcome_status,recipient_name,recipient_phone,address_snapshot,currency_code,cod_required,cod_expected_amount,delivered_at,manual_carrier_name)
      values(${f.organizationId},${'SYN-' + crypto.randomUUID()},${order.id},${fulfillment.id},${method.id},'DELIVERED','DELIVERED',
      'Synthetic customer','01700000000','{}','BDT',true,${total}::numeric,now(),'Synthetic courier') returning id`.execute(
        db,
      )
    ).rows[0]!;
    await sql`insert into delivery.cod_collection_instructions(organization_id,delivery_id,version_number,currency_code,expected_amount)
      values(${f.organizationId},${delivery.id},1,'BDT',${total}::numeric)`.execute(db);
    const payment = await recordCodCollection(db, {
      organizationId: f.organizationId,
      actorId: f.owner,
      deliveryId: delivery.id,
      amount: received,
      externalReference: 'SYN-' + crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
    });
    const input = {
      orderId: order.id,
      paymentId: payment.id,
      policyId: policy.id,
      amount: '1',
      reason: 'Synthetic genuine customer cash shortfall',
      collectionEvidenceReference: 'SYNTHETIC checked collection log',
    };
    return {
      orderId: order.id,
      paymentId: payment.id,
      intentId: intent.id,
      deliveryId: delivery.id,
      input,
    };
  }
  return { ...f, reviewer, policyId: policy.id, proposalId: proposal.id, definition, collect };
}
