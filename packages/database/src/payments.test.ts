import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { addGuestCartLine, createGuestCart } from './cart.js';
import * as finance from './finance.js';
import { createDatabase } from './index.js';
import {
  createDelivery,
  dispatchDelivery,
  markDelivered,
  recordManualCourierBooking,
} from './delivery.js';
import { createFulfillment, dispatchFulfillment, transitionFulfillment } from './fulfillment.js';
import {
  adjustInventory,
  listInventoryReservations,
  verifyInventoryIntegrity,
} from './inventory.js';
import {
  cancelOrder,
  createCheckout,
  placeOrder,
  processExpiredPaymentOrders,
  updateCheckoutAddress,
  updateCheckoutContact,
  updateCheckoutPaymentMethod,
} from './orders.js';
import {
  completeManualRefund,
  configurePaymentMethod,
  createRefund,
  getPayment,
  getPaymentDetail,
  getRefund,
  getOrderPaymentSummary,
  getPaymentAttempt,
  listPayments,
  listPendingCodCollections,
  listRefunds,
  recordCodCollection,
  rejectManualPayment,
  submitManualPayment,
  verifyManualPayment,
  verifyPaymentIntegrity,
} from './payments.js';
import { createOrganization } from './platform.js';
import { createPriceDefinition } from './pricing.js';
import { createLocation } from './warehouse.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 12,
});
const decimal = (value: string | undefined) => Number(value).toFixed(4);
afterAll(async () => database.close());

async function fixture(quantity = '4') {
  const organization = await createOrganization(database.db, {
    code: `pay-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'Payment test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const actorId = crypto.randomUUID();
  const type = await sql<{
    id: string;
  }>`insert into catalog.product_types (organization_id, code, name) values (${organization.id}, ${`pay-${crypto.randomUUID().slice(0, 6)}`}, 'Payment type') returning id`.execute(
    database.db,
  );
  const product = await sql<{
    id: string;
  }>`insert into catalog.products (organization_id, product_type_id, handle, title, status, publication_status, published_at) values (${organization.id}, ${type.rows[0]!.id}, ${`payment-${crypto.randomUUID().slice(0, 8)}`}, 'Payment Product', 'ACTIVE', 'PUBLISHED', now()) returning id`.execute(
    database.db,
  );
  const skuString = `PAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const variant = await sql<{
    id: string;
  }>`insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature) values (${organization.id}, ${product.rows[0]!.id}, ${skuString}, ${skuString}, ${crypto.randomUUID()}) returning id`.execute(
    database.db,
  );
  const location = await createLocation(database.db, {
    organizationId: organization.id,
    actorId,
    code: `PAY-${crypto.randomUUID().slice(0, 5)}`,
    name: 'Payment stock',
    locationType: 'WAREHOUSE',
    capabilities: ['STOCK_HOLDING'],
  });
  await adjustInventory(database.db, {
    organizationId: organization.id,
    actorId,
    variantId: variant.rows[0]!.id,
    locationId: location.id,
    condition: 'SELLABLE',
    quantityDelta: quantity,
    reasonCode: 'OPENING_BALANCE',
    idempotencyKey: crypto.randomUUID(),
  });
  await createPriceDefinition(database.db, {
    organizationId: organization.id,
    actorId,
    variantId: variant.rows[0]!.id,
    currency: 'BDT',
    amount: '1161.0000',
  });
  await configurePaymentMethod(database.db, {
    organizationId: organization.id,
    actorId,
    code: 'BKASH_MANUAL',
    name: 'bKash Manual',
    status: 'ACTIVE',
    paymentWindowMinutes: 60,
    displayOrder: 20,
    instructions: { accountNumber: '01700000000', text: 'Send money to the Maevelle test wallet.' },
  });
  await configurePaymentMethod(database.db, {
    organizationId: organization.id,
    actorId,
    code: 'NAGAD_MANUAL',
    name: 'Nagad Manual',
    status: 'ACTIVE',
    paymentWindowMinutes: 60,
    displayOrder: 30,
    instructions: { accountNumber: '01800000000', text: 'Send money to the Maevelle test wallet.' },
  });
  return {
    organizationId: organization.id,
    actorId,
    variantId: variant.rows[0]!.id,
    locationId: location.id,
  };
}

async function orderFor(
  input: Awaited<ReturnType<typeof fixture>>,
  paymentMethod: 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL' = 'COD',
) {
  const cart = await createGuestCart(database.db, {
    organizationId: input.organizationId,
    currency: 'BDT',
  });
  await addGuestCartLine(database.db, {
    token: cart.token,
    variantId: input.variantId,
    quantity: '1',
    expectedVersion: cart.cart.version,
    idempotencyKey: crypto.randomUUID(),
  });
  const checkout = await createCheckout(database.db, { cartToken: cart.token });
  const contact = await updateCheckoutContact(database.db, {
    checkoutToken: checkout.token,
    cartToken: cart.token,
    expectedVersion: checkout.checkout.version,
    contact: { name: 'Payment Buyer', phone: '01700000000' },
  });
  const address = await updateCheckoutAddress(database.db, {
    checkoutToken: checkout.token,
    cartToken: cart.token,
    expectedVersion: contact.version,
    address: {
      recipientName: 'Payment Buyer',
      phone: '01700000000',
      addressLine1: 'Payment Road',
      countryCode: 'BD',
    },
  });
  const selected =
    paymentMethod === 'COD'
      ? address
      : await updateCheckoutPaymentMethod(database.db, {
          checkoutToken: checkout.token,
          cartToken: cart.token,
          expectedVersion: address.version,
          paymentMethod,
        });
  const placed = await placeOrder(database.db, {
    checkoutToken: checkout.token,
    cartToken: cart.token,
    acceptedCalculationVersion: selected.calculationVersion,
    acceptedCalculationFingerprint: selected.calculationFingerprint,
    idempotencyKey: crypto.randomUUID(),
  });
  if (placed.kind !== 'PLACED') throw new Error('Expected Order placement.');
  return { checkoutToken: checkout.token, order: placed.order };
}

async function deliverCodOrder(
  input: Awaited<ReturnType<typeof fixture>>,
  order: Awaited<ReturnType<typeof orderFor>>['order'],
) {
  const line = await sql<{ id: string; quantity: string }>`
    select id, quantity::text from orders.order_lines where order_id = ${order.id}
  `.execute(database.db);
  const created = await createFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    orderId: order.id,
    locationId: input.locationId,
    lines: [{ orderLineId: line.rows[0]!.id, quantity: line.rows[0]!.quantity }],
    idempotencyKey: crypto.randomUUID(),
  });
  const ready = await transitionFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    fulfillmentId: created.id,
    expectedVersion: created.version,
    nextStatus: 'READY',
  });
  const picking = await transitionFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    fulfillmentId: ready.id,
    expectedVersion: ready.version,
    nextStatus: 'PICKING',
  });
  const packed = await transitionFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    fulfillmentId: picking.id,
    expectedVersion: picking.version,
    nextStatus: 'PACKED',
  });
  const dispatched = await dispatchFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    fulfillmentId: packed.id,
    expectedVersion: packed.version,
    idempotencyKey: crypto.randomUUID(),
  });
  const delivery = await createDelivery(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    fulfillmentId: dispatched.id,
    idempotencyKey: crypto.randomUUID(),
  });
  const booked = await recordManualCourierBooking(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    deliveryId: delivery.id,
    expectedVersion: delivery.version,
    carrierName: 'Test courier',
    trackingReference: `COD-${crypto.randomUUID().slice(0, 8)}`,
    idempotencyKey: crypto.randomUUID(),
  });
  const inTransit = await dispatchDelivery(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    deliveryId: booked.id,
    expectedVersion: booked.version,
    idempotencyKey: crypto.randomUUID(),
  });
  return markDelivered(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    deliveryId: inTransit.id,
    expectedVersion: inTransit.version,
    idempotencyKey: crypto.randomUUID(),
  });
}

describe('payment facts, manual wallet verification, and refunds', () => {
  it('requires a bounded timeout policy before a manual payment method can be active', async () => {
    await expect(
      configurePaymentMethod(database.db, {
        organizationId: crypto.randomUUID(),
        actorId: crypto.randomUUID(),
        code: 'BKASH_MANUAL',
        name: 'bKash Manual',
        status: 'ACTIVE',
        displayOrder: 20,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      configurePaymentMethod(database.db, {
        organizationId: crypto.randomUUID(),
        actorId: crypto.randomUUID(),
        code: 'NAGAD_MANUAL',
        name: 'Nagad Manual',
        status: 'DISABLED',
        paymentWindowMinutes: 10,
        displayOrder: 30,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('applies the configured manual-payment window and expires only unclaimed unpaid Orders', async () => {
    const input = await fixture();
    const expiring = await orderFor(input, 'BKASH_MANUAL');
    const intent = await sql<{ id: string; expires_at: Date | null }>`
      select id, expires_at
      from payments.payment_intents
      where organization_id = ${input.organizationId} and order_id = ${expiring.order.id}
    `.execute(database.db);
    expect(intent.rows[0]!.expires_at).not.toBeNull();
    await sql`update payments.payment_intents set expires_at = now() - interval '1 minute' where id = ${intent.rows[0]!.id}`.execute(
      database.db,
    );

    expect(await processExpiredPaymentOrders(database.db)).toBe(1);
    expect(await processExpiredPaymentOrders(database.db)).toBe(0);
    const expired = await sql<{
      order_status: string;
      intent_status: string;
      reserved: string;
      audit: string;
    }>`
      select order_row.order_status, payment_intent.status as intent_status,
        (select sum(level.reserved_quantity)::text
          from inventory.inventory_levels level
          join inventory.inventory_items item on item.id = level.inventory_item_id
          where item.organization_id = ${input.organizationId} and item.variant_id = ${input.variantId}) as reserved,
        (select count(*)::text from audit.audit_events
          where organization_id = ${input.organizationId}
            and target_id = order_row.id
            and action = 'orders.order.cancelled'
            and actor_type = 'SYSTEM') as audit
      from orders.orders order_row
      join payments.payment_intents payment_intent
        on payment_intent.organization_id = order_row.organization_id
        and payment_intent.order_id = order_row.id
      where order_row.id = ${expiring.order.id}
    `.execute(database.db);
    expect(expired.rows[0]).toEqual({
      order_status: 'CANCELLED',
      intent_status: 'CANCELLED',
      reserved: '0.000000',
      audit: '1',
    });
  });

  it('defers timeout while a payment claim awaits review, then expires after rejection', async () => {
    const input = await fixture();
    const flow = await orderFor(input, 'NAGAD_MANUAL');
    const attempt = await submitManualPayment(database.db, {
      organizationId: input.organizationId,
      orderId: flow.order.id,
      customerReference: 'TIMEOUT-REVIEW-001',
      idempotencyKey: crypto.randomUUID(),
    });
    await sql`update payments.payment_intents set expires_at = now() - interval '1 minute' where order_id = ${flow.order.id}`.execute(
      database.db,
    );

    expect(await processExpiredPaymentOrders(database.db)).toBe(0);
    const awaitingReview = await listInventoryReservations(database.db, input.organizationId);
    expect(awaitingReview.items[0]).toMatchObject({
      attentionCode: 'PAYMENT_REVIEW_OVERDUE',
      owner: { orderId: flow.order.id, paymentStatus: 'PAYMENT_REVIEW' },
    });
    await rejectManualPayment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      attemptId: attempt.id,
      reasonCode: 'REFERENCE_NOT_FOUND',
    });
    const rejected = await listInventoryReservations(database.db, input.organizationId);
    expect(rejected.items[0]).toMatchObject({
      attentionCode: 'PAYMENT_REJECTED',
      owner: { orderId: flow.order.id, paymentStatus: 'PAYMENT_REJECTED' },
    });
    expect(await processExpiredPaymentOrders(database.db)).toBe(1);
  });

  it('reports an active reservation owned by a terminal Order as an integrity failure', async () => {
    const input = await fixture();
    const flow = await orderFor(input, 'COD');
    await sql`update orders.orders set order_status = 'CANCELLED' where organization_id = ${input.organizationId} and id = ${flow.order.id}`.execute(
      database.db,
    );

    await expect(verifyInventoryIntegrity(database.db, input.organizationId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RESERVATION_TERMINAL_ORDER_OWNER' }),
      ]),
    );
  });
  it('keeps COD as a due payment obligation without inventing a confirmed Payment', async () => {
    const input = await fixture();
    const flow = await orderFor(input, 'COD');
    const payments = await sql<{
      count: string;
    }>`select count(*)::text as count from payments.payments where organization_id = ${input.organizationId}`.execute(
      database.db,
    );
    expect(payments.rows[0]!.count).toBe('0');
    expect(flow.order.payment).toMatchObject({
      method: 'COD',
      status: 'UNPAID',
      collected: '0.0000',
      outstanding: '1161.0000',
    });
  });

  it('records delivered COD as an idempotent collection without conflating delivery and payment', async () => {
    const input = await fixture();
    const flow = await orderFor(input, 'COD');
    const delivered = await deliverCodOrder(input, flow.order);

    const queue = await listPendingCodCollections(database.db, input.organizationId);
    expect(queue).toEqual([
      expect.objectContaining({
        deliveryId: delivered.id,
        orderId: flow.order.id,
        expectedAmount: '1161.0000',
        outstandingAmount: '1161.0000',
      }),
    ]);
    await expect(
      finance.getFinanceOverview(database.db, input.organizationId),
    ).resolves.toMatchObject({ attention: { pendingCodCollections: 1 } });

    const idempotencyKey = crypto.randomUUID();
    const payment = await recordCodCollection(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: delivered.id,
      amount: '1161.0000',
      externalReference: 'COD-DELIVERED-001',
      note: 'Courier confirmed collection.',
      idempotencyKey,
    });
    expect(payment).toMatchObject({
      orderId: flow.order.id,
      method: 'COD',
      amount: '1161.0000',
      externalReference: 'COD-DELIVERED-001',
    });
    expect(
      (
        await recordCodCollection(database.db, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          deliveryId: delivered.id,
          amount: '1161.0000',
          externalReference: 'COD-DELIVERED-001',
          note: 'Courier confirmed collection.',
          idempotencyKey,
        })
      ).id,
    ).toBe(payment.id);
    await expect(listPendingCodCollections(database.db, input.organizationId)).resolves.toEqual([]);
    await expect(
      finance.getFinanceOverview(database.db, input.organizationId),
    ).resolves.toMatchObject({ attention: { pendingCodCollections: 0 } });
    await expect(
      recordCodCollection(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        deliveryId: delivered.id,
        amount: '1.0000',
        externalReference: 'COD-DUPLICATE-001',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'COD_DELIVERY_NOT_ELIGIBLE' });
    await expect(
      getOrderPaymentSummary(database.db, {
        organizationId: input.organizationId,
        orderId: flow.order.id,
        paymentMethod: 'COD',
        expectedAmount: '1161.0000',
      }),
    ).resolves.toMatchObject({ status: 'PAID', outstanding: '0.0000' });
    const evidence = await sql<{ audit: string; outbox: string }>`
      select
        (select count(*) from audit.audit_events where organization_id = ${input.organizationId} and action = 'payments.cod_collection.recorded')::text as audit,
        (select count(*) from platform.outbox_events where organization_id = ${input.organizationId} and event_type = 'payments.cod_collection.recorded')::text as outbox
    `.execute(database.db);
    expect(evidence.rows[0]).toEqual({ audit: '1', outbox: '1' });
  });

  it('settles courier-held COD through partial remittances with explicit deductions', async () => {
    const input = await fixture();
    const flow = await orderFor(input, 'COD');
    const delivered = await deliverCodOrder(input, flow.order);
    const payment = await recordCodCollection(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: delivered.id,
      amount: '1161.0000',
      externalReference: `COD-${crypto.randomUUID()}`,
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      finance.listOutstandingCodSettlementPayments(database.db, input.organizationId),
    ).resolves.toEqual([
      expect.objectContaining({
        paymentId: payment.id,
        carrierName: 'Test courier',
        outstandingAmount: '1161.0000',
        sourceAccountId: null,
        canSettle: false,
      }),
    ]);
    await expect(
      finance.getFinanceOverview(database.db, input.organizationId),
    ).resolves.toMatchObject({
      metrics: { outstandingCodHeld: '1161.0000' },
      attention: { outstandingCodPayments: 1 },
    });

    const financeActor = undefined as never;
    await expect(
      finance.createCodSettlement(database.db, {
        organizationId: input.organizationId,
        actorId: financeActor,
        destinationAccountId: crypto.randomUUID(),
        remittanceReference: 'UNPOSTED-REMITTANCE',
        allocations: [{ paymentId: payment.id, amount: '100.0000' }],
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const holding = await finance.createFinancialAccount(database.db, {
      organizationId: input.organizationId,
      actorId: financeActor,
      accountNumber: `COURIER-${crypto.randomUUID().slice(0, 8)}`,
      name: 'Test courier receivable',
      accountType: 'OTHER',
      currencyCode: 'BDT',
      idempotencyKey: crypto.randomUUID(),
    });
    const bank = await finance.createFinancialAccount(database.db, {
      organizationId: input.organizationId,
      actorId: financeActor,
      accountNumber: `BANK-${crypto.randomUUID().slice(0, 8)}`,
      name: 'Settlement bank',
      accountType: 'BANK',
      currencyCode: 'BDT',
      idempotencyKey: crypto.randomUUID(),
    });
    await finance.postPaymentToFinancialAccount(database.db, {
      organizationId: input.organizationId,
      actorId: financeActor,
      paymentId: payment.id,
      accountId: holding.id,
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      finance.createCodSettlement(database.db, {
        organizationId: input.organizationId,
        actorId: financeActor,
        destinationAccountId: bank.id,
        remittanceReference: 'MISSING-DEDUCTION-NOTE',
        deductionAmount: '1.0000',
        allocations: [{ paymentId: payment.id, amount: '100.0000' }],
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      finance.createCodSettlement(database.db, {
        organizationId: input.organizationId,
        actorId: financeActor,
        destinationAccountId: holding.id,
        remittanceReference: 'SAME-ACCOUNT',
        allocations: [{ paymentId: payment.id, amount: '100.0000' }],
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const idempotencyKey = crypto.randomUUID();
    const first = await finance.createCodSettlement(database.db, {
      organizationId: input.organizationId,
      actorId: financeActor,
      destinationAccountId: bank.id,
      remittanceReference: 'TEST-REMIT-001',
      deductionAmount: '50.0000',
      deductionNote: 'Courier delivery charge withheld from remittance.',
      allocations: [{ paymentId: payment.id, amount: '600.0000' }],
      idempotencyKey,
    });
    await expect(
      finance.createCodSettlement(database.db, {
        organizationId: input.organizationId,
        actorId: financeActor,
        destinationAccountId: bank.id,
        remittanceReference: 'TEST-REMIT-001',
        deductionAmount: '50.0000',
        deductionNote: 'Courier delivery charge withheld from remittance.',
        allocations: [{ paymentId: payment.id, amount: '600.0000' }],
        idempotencyKey,
      }),
    ).resolves.toEqual(first);
    await expect(
      finance.createCodSettlement(database.db, {
        organizationId: input.organizationId,
        actorId: financeActor,
        destinationAccountId: bank.id,
        remittanceReference: ' test-remit-001 ',
        allocations: [{ paymentId: payment.id, amount: '1.0000' }],
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      finance.createCodSettlement(database.db, {
        organizationId: input.organizationId,
        actorId: financeActor,
        destinationAccountId: bank.id,
        remittanceReference: 'TEST-REMIT-OVER',
        allocations: [{ paymentId: payment.id, amount: '562.0000' }],
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      finance.listOutstandingCodSettlementPayments(database.db, input.organizationId),
    ).resolves.toEqual([
      expect.objectContaining({
        paymentId: payment.id,
        settledAmount: '600.0000',
        outstandingAmount: '561.0000',
        sourceAccountId: holding.id,
        canSettle: true,
      }),
    ]);
    await expect(
      finance.listCodSettlements(database.db, input.organizationId),
    ).resolves.toMatchObject({
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      items: [
        {
          id: first.id,
          carrierName: 'Test courier',
          remittanceReference: 'TEST-REMIT-001',
          grossAmount: '600.0000',
          deductionAmount: '50.0000',
          netAmount: '550.0000',
          sourceAccountId: holding.id,
          destinationAccountId: bank.id,
          allocations: [expect.objectContaining({ paymentId: payment.id, amount: '600.0000' })],
        },
      ],
    });
    await finance.createCodSettlement(database.db, {
      organizationId: input.organizationId,
      actorId: financeActor,
      destinationAccountId: bank.id,
      remittanceReference: 'TEST-REMIT-002',
      allocations: [{ paymentId: payment.id, amount: '561.0000' }],
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      finance.listOutstandingCodSettlementPayments(database.db, input.organizationId),
    ).resolves.toEqual([]);
    const balances = await finance.listFinancialAccounts(database.db, input.organizationId);
    expect(decimal(balances.find((value) => value.id === holding.id)?.ledger_balance)).toBe(
      '0.0000',
    );
    expect(decimal(balances.find((value) => value.id === bank.id)?.ledger_balance)).toBe(
      '1111.0000',
    );
    const trends = await finance.getFinanceTrends(database.db, input.organizationId, 'LAST_7_DAYS');
    expect(trends).toMatchObject({
      range: 'LAST_7_DAYS',
      currency: 'BDT',
      totals: {
        collectedPayments: '1161.0000',
        completedRefunds: '0.0000',
        paidExpenses: '0.0000',
        courierDeductions: '50.0000',
        netAccountMovement: '1111.0000',
      },
    });
    expect(trends.series).toHaveLength(7);
    expect(trends.series.at(-1)).toMatchObject({
      collectedPayments: '1161.0000',
      courierDeductions: '50.0000',
      netAccountMovement: '1111.0000',
    });
    await expect(
      finance.getFinanceOverview(database.db, input.organizationId),
    ).resolves.toMatchObject({
      metrics: { outstandingCodHeld: '0.0000' },
      attention: { outstandingCodPayments: 0 },
    });
    await expect(
      finance.verifyFinanceIntegrity(database.db, input.organizationId),
    ).resolves.toEqual([]);
    const evidence = await sql<{ audit: string; outbox: string }>`select
      (select count(*) from audit.audit_events where organization_id=${input.organizationId} and action='finance.cod_settlement.created')::text as audit,
      (select count(*) from platform.outbox_events where organization_id=${input.organizationId} and event_type='finance.cod_settlement.created')::text as outbox`.execute(
      database.db,
    );
    expect(evidence.rows[0]).toEqual({ audit: '2', outbox: '2' });
  });

  it('creates an intent, preserves a pending manual claim, then atomically posts a payment and allocation', async () => {
    const input = await fixture();
    const flow = await orderFor(input, 'BKASH_MANUAL');
    const attempted = await submitManualPayment(database.db, {
      organizationId: input.organizationId,
      orderId: flow.order.id,
      customerReference: 'BK-TEST-001',
      claimedAmount: '1000.0000',
      idempotencyKey: 'submit-1',
    });
    expect(attempted.status).toBe('PENDING_VERIFICATION');
    expect(
      (
        await submitManualPayment(database.db, {
          organizationId: input.organizationId,
          orderId: flow.order.id,
          customerReference: 'BK-TEST-001',
          claimedAmount: '1000.0000',
          idempotencyKey: 'submit-1',
        })
      ).id,
    ).toBe(attempted.id);
    const posted = await verifyManualPayment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      attemptId: attempted.id,
      confirmedAmount: '1161.0000',
      idempotencyKey: 'verify-1',
    });
    expect(posted).toMatchObject({
      amount: '1161.0000',
      orderId: flow.order.id,
      refunded: '0.0000',
    });
    const summary = await getOrderPaymentSummary(database.db, {
      organizationId: input.organizationId,
      orderId: flow.order.id,
      paymentMethod: 'BKASH_MANUAL',
      expectedAmount: '1161.0000',
    });
    expect(summary).toMatchObject({
      status: 'PAID',
      collected: '1161.0000',
      outstanding: '0.0000',
    });
    const evidence = await sql<{
      payments: string;
      allocations: string;
      audit: string;
      outbox: string;
    }>`select
      (select count(*) from payments.payments where organization_id = ${input.organizationId})::text as payments, (select count(*) from payments.payment_allocations where organization_id = ${input.organizationId})::text as allocations,
      (select count(*) from audit.audit_events where organization_id = ${input.organizationId} and action = 'payments.payment.verified')::text as audit,
      (select count(*) from platform.outbox_events where organization_id = ${input.organizationId} and event_type = 'payments.payment.verified')::text as outbox`.execute(
      database.db,
    );
    expect(evidence.rows[0]).toMatchObject({
      payments: '1',
      allocations: '1',
      audit: '1',
      outbox: '1',
    });
  });

  it('preserves rejected attempt history and prevents one verified external reference from being reused', async () => {
    const input = await fixture();
    const first = await orderFor(input, 'NAGAD_MANUAL');
    const rejected = await submitManualPayment(database.db, {
      organizationId: input.organizationId,
      orderId: first.order.id,
      customerReference: 'NG-REJECTED',
      idempotencyKey: 'reject-1',
    });
    await rejectManualPayment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      attemptId: rejected.id,
      reasonCode: 'NOT_FOUND_IN_WALLET',
    });
    expect((await getPaymentAttempt(database.db, input.organizationId, rejected.id)).status).toBe(
      'REJECTED',
    );
    const successful = await submitManualPayment(database.db, {
      organizationId: input.organizationId,
      orderId: first.order.id,
      customerReference: 'DUP-REF-001',
      idempotencyKey: 'submit-successful',
    });
    await verifyManualPayment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      attemptId: successful.id,
      confirmedAmount: '1161.0000',
      idempotencyKey: 'verify-successful',
    });
    const second = await orderFor(input, 'NAGAD_MANUAL');
    const duplicate = await submitManualPayment(database.db, {
      organizationId: input.organizationId,
      orderId: second.order.id,
      customerReference: 'DUP-REF-001',
      idempotencyKey: 'submit-duplicate',
    });
    await expect(
      verifyManualPayment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        attemptId: duplicate.id,
        confirmedAmount: '1161.0000',
        idempotencyKey: 'verify-duplicate',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_EXTERNAL_TRANSACTION' });
    const otherOrganization = await createOrganization(database.db, {
      code: `pay-other-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Other tenant',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    });
    await expect(
      verifyManualPayment(database.db, {
        organizationId: otherOrganization.id,
        actorId: input.actorId,
        attemptId: duplicate.id,
        confirmedAmount: '1161.0000',
        idempotencyKey: 'wrong-tenant',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('allows only one concurrent verification and one concurrent refund completion, without changing inventory', async () => {
    const input = await fixture();
    const flow = await orderFor(input, 'BKASH_MANUAL');
    const attempt = await submitManualPayment(database.db, {
      organizationId: input.organizationId,
      orderId: flow.order.id,
      customerReference: 'BK-RACE-001',
      idempotencyKey: 'race-submit',
    });
    const verified = await Promise.allSettled([
      verifyManualPayment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        attemptId: attempt.id,
        confirmedAmount: '1161.0000',
        idempotencyKey: 'race-verify-a',
      }),
      verifyManualPayment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        attemptId: attempt.id,
        confirmedAmount: '1161.0000',
        idempotencyKey: 'race-verify-b',
      }),
    ]);
    expect(verified.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const payment = verified.find(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof verifyManualPayment>>> =>
        result.status === 'fulfilled',
    )!.value;
    const refund = await createRefund(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      paymentId: payment.id,
      amount: '500.0000',
      reasonCode: 'CUSTOMER_REFUND',
      idempotencyKey: 'refund-create',
    });
    const completed = await Promise.allSettled([
      completeManualRefund(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        refundId: refund.id,
        externalReference: 'RFD-TEST-001',
        idempotencyKey: 'refund-complete-a',
      }),
      completeManualRefund(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        refundId: refund.id,
        externalReference: 'RFD-TEST-001',
        idempotencyKey: 'refund-complete-b',
      }),
    ]);
    expect(completed.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const summary = await getOrderPaymentSummary(database.db, {
      organizationId: input.organizationId,
      orderId: flow.order.id,
      paymentMethod: 'BKASH_MANUAL',
      expectedAmount: '1161.0000',
    });
    expect(summary).toMatchObject({ refunded: '500.0000', netCollected: '661.0000' });
    await expect(
      createRefund(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        paymentId: payment.id,
        amount: '700.0000',
        reasonCode: 'EXCEEDS_BALANCE',
        idempotencyKey: 'refund-exceeds-balance',
      }),
    ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_REFUNDABLE' });
    const allocations = await sql<{
      count: string;
    }>`select count(*)::text as count from payments.refund_allocations where refund_id = ${refund.id}`.execute(
      database.db,
    );
    expect(allocations.rows[0]!.count).toBe('1');
    await expect(verifyPaymentIntegrity(database.db, input.organizationId)).resolves.toEqual({
      valid: true,
      issues: [],
    });
    const stock = await sql<{
      sellable: string;
      reserved: string;
    }>`select sum(level.sellable_quantity)::text as sellable, sum(level.reserved_quantity)::text as reserved from inventory.inventory_levels level join inventory.inventory_items item on item.id = level.inventory_item_id where item.organization_id = ${input.organizationId} and item.variant_id = ${input.variantId}`.execute(
      database.db,
    );
    expect(stock.rows[0]).toEqual({ sellable: '4.000000', reserved: '1.000000' });
  });

  it('cancels a paid Order without inventing a completed Refund, while releasing its reservation once', async () => {
    const input = await fixture();
    const flow = await orderFor(input, 'BKASH_MANUAL');
    const attempt = await submitManualPayment(database.db, {
      organizationId: input.organizationId,
      orderId: flow.order.id,
      customerReference: 'BK-CANCEL-001',
      idempotencyKey: 'cancel-submit',
    });
    const payment = await verifyManualPayment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      attemptId: attempt.id,
      confirmedAmount: '1161.0000',
      idempotencyKey: 'cancel-verify',
    });
    const cancelled = await cancelOrder(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: flow.order.id,
      expectedVersion: flow.order.version,
      reasonCode: 'CUSTOMER_CANCELLED',
      idempotencyKey: 'cancel-paid-order',
    });
    expect(cancelled).toMatchObject({ releasedReservations: 1, order: { status: 'CANCELLED' } });
    const financialHistory = await sql<{ payments: string; refunds: string }>`select
      (select count(*) from payments.payments where id = ${payment.id})::text as payments,
      (select count(*) from payments.refunds where payment_id = ${payment.id} and status = 'COMPLETED')::text as refunds`.execute(
      database.db,
    );
    expect(financialHistory.rows[0]).toEqual({ payments: '1', refunds: '0' });
    const stock = await sql<{
      reserved: string;
    }>`select sum(level.reserved_quantity)::text as reserved from inventory.inventory_levels level join inventory.inventory_items item on item.id = level.inventory_item_id where item.organization_id = ${input.organizationId} and item.variant_id = ${input.variantId}`.execute(
      database.db,
    );
    expect(stock.rows[0]!.reserved).toBe('0.000000');
  });

  it('rolls back financial state, audit, and outbox records when verification or refund completion faults', async () => {
    const input = await fixture();
    const flow = await orderFor(input, 'BKASH_MANUAL');
    const attempt = await submitManualPayment(database.db, {
      organizationId: input.organizationId,
      orderId: flow.order.id,
      customerReference: 'BK-ROLLBACK-001',
      idempotencyKey: 'rollback-submit',
    });
    await expect(
      verifyManualPayment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        attemptId: attempt.id,
        confirmedAmount: '1161.0000',
        idempotencyKey: 'rollback-verify',
        fault: () => {
          throw new Error('verification fault');
        },
      }),
    ).rejects.toThrow('verification fault');
    expect((await getPaymentAttempt(database.db, input.organizationId, attempt.id)).status).toBe(
      'PENDING_VERIFICATION',
    );
    const retry = await verifyManualPayment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      attemptId: attempt.id,
      confirmedAmount: '1161.0000',
      idempotencyKey: 'rollback-verify-retry',
    });
    const refund = await createRefund(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      paymentId: retry.id,
      amount: '500.0000',
      reasonCode: 'ROLLBACK_TEST',
      idempotencyKey: 'rollback-refund-create',
    });
    await expect(
      completeManualRefund(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        refundId: refund.id,
        externalReference: 'RFD-ROLLBACK-001',
        idempotencyKey: 'rollback-refund-complete',
        fault: () => {
          throw new Error('refund fault');
        },
      }),
    ).rejects.toThrow('refund fault');
    const retryRefund = await sql<{
      status: string;
      completed: string;
    }>`select status, (completed_at is not null)::text as completed from payments.refunds where id = ${refund.id}`.execute(
      database.db,
    );
    expect(retryRefund.rows[0]).toEqual({ status: 'REQUESTED', completed: 'false' });
  });

  it('exposes the account posting for verified payments and completed refunds', async () => {
    const input = await fixture();
    const flow = await orderFor(input, 'BKASH_MANUAL');
    const attempt = await submitManualPayment(database.db, {
      organizationId: input.organizationId,
      orderId: flow.order.id,
      customerReference: 'BK-FINANCE-001',
      idempotencyKey: crypto.randomUUID(),
    });
    const payment = await verifyManualPayment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      attemptId: attempt.id,
      confirmedAmount: '1161.0000',
      idempotencyKey: crypto.randomUUID(),
    });
    const financeActor = undefined as never;
    const wallet = await finance.createFinancialAccount(database.db, {
      organizationId: input.organizationId,
      actorId: financeActor,
      accountNumber: `WALLET-${crypto.randomUUID().slice(0, 8)}`,
      name: 'bKash wallet',
      accountType: 'MOBILE_WALLET',
      currencyCode: 'BDT',
      idempotencyKey: crypto.randomUUID(),
    });
    await finance.postPaymentToFinancialAccount(database.db, {
      organizationId: input.organizationId,
      actorId: financeActor,
      paymentId: payment.id,
      accountId: wallet.id,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(await getPayment(database.db, input.organizationId, payment.id)).toMatchObject({
      financePosting: { accountId: wallet.id, accountName: 'bKash wallet' },
    });

    const requested = await createRefund(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      paymentId: payment.id,
      amount: '100.0000',
      reasonCode: 'CUSTOMER_REQUEST',
      idempotencyKey: crypto.randomUUID(),
    });
    const completed = await completeManualRefund(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      refundId: requested.id,
      externalReference: 'RFD-FINANCE-001',
      idempotencyKey: crypto.randomUUID(),
    });
    await finance.postRefundToFinancialAccount(database.db, {
      organizationId: input.organizationId,
      actorId: financeActor,
      refundId: completed.id,
      accountId: wallet.id,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(await getRefund(database.db, input.organizationId, completed.id)).toMatchObject({
      orderNumber: flow.order.orderNumber,
      paymentNumber: payment.paymentNumber,
      financePosting: { accountId: wallet.id, accountName: 'bKash wallet' },
    });
    expect(await getPaymentDetail(database.db, input.organizationId, payment.id)).toMatchObject({
      order: {
        status: 'PENDING',
        paymentStatus: 'PARTIALLY_REFUNDED',
        collected: '1161.0000',
        outstanding: '0.0000',
      },
      customer: { name: 'Payment Buyer', phone: '01700000000' },
      source: { type: 'MANUAL_SUBMISSION', id: attempt.id },
      refunds: [{ id: completed.id, status: 'COMPLETED' }],
    });
    await expect(
      listPayments(database.db, input.organizationId, {
        page: 1,
        pageSize: 1,
        query: payment.paymentNumber,
        method: 'BKASH_MANUAL',
        posting: 'POSTED',
      }),
    ).resolves.toMatchObject({
      items: [{ id: payment.id, financePosting: { accountId: wallet.id } }],
      pagination: { page: 1, pageSize: 1, totalItems: 1, totalPages: 1 },
    });
    await expect(
      listPayments(database.db, input.organizationId, {
        page: 2,
        pageSize: 1,
        query: payment.paymentNumber,
      }),
    ).resolves.toMatchObject({
      items: [],
      pagination: { page: 2, pageSize: 1, totalItems: 1, totalPages: 1 },
    });
    await expect(
      listRefunds(database.db, input.organizationId, {
        pageSize: 1,
        query: flow.order.orderNumber,
        status: 'COMPLETED',
        posting: 'POSTED',
      }),
    ).resolves.toMatchObject({
      items: [{ id: completed.id, financePosting: { accountId: wallet.id } }],
      pagination: { page: 1, pageSize: 1, totalItems: 1, totalPages: 1 },
    });
  });
});
