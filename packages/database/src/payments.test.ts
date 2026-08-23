import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { addGuestCartLine, createGuestCart } from './cart.js';
import { createDatabase } from './index.js';
import { adjustInventory } from './inventory.js';
import {
  cancelOrder,
  createCheckout,
  placeOrder,
  updateCheckoutAddress,
  updateCheckoutContact,
  updateCheckoutPaymentMethod,
} from './orders.js';
import {
  completeManualRefund,
  configurePaymentMethod,
  createRefund,
  getOrderPaymentSummary,
  getPaymentAttempt,
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
  const variant = await sql<{
    id: string;
  }>`insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature) values (${organization.id}, ${product.rows[0]!.id}, ${`PAY-${crypto.randomUUID().slice(0, 8)}`}, ${`PAY-${crypto.randomUUID().slice(0, 8)}`}, ${crypto.randomUUID()}) returning id`.execute(
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
    displayOrder: 20,
    instructions: { accountNumber: '01700000000', text: 'Send money to the Maevelle test wallet.' },
  });
  await configurePaymentMethod(database.db, {
    organizationId: organization.id,
    actorId,
    code: 'NAGAD_MANUAL',
    name: 'Nagad Manual',
    status: 'ACTIVE',
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

describe('payment facts, manual wallet verification, and refunds', () => {
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
});
