import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import * as notifications from './notifications.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 6,
});
afterAll(async () => database.close());

const runtime: notifications.SmsRuntimeOptions = {
  enabled: true,
  providerConfigured: true,
  providerName: 'mock',
  storefrontBaseUrl: 'https://shop.maevelle.test',
  senderType: 'PROVIDER_DEFAULT',
  environment: 'test',
};

async function fixture(label: string, phone = '01712345678', normalizedPhone = '+8801712345678') {
  const organization = await createOrganization(database.db, {
    code: `sms-${label}-${crypto.randomUUID().slice(0, 8)}`,
    displayName: 'SMS test',
    timezone: 'Asia/Dhaka',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const customer = (
    await sql<{
      id: string;
    }>`insert into customers.customers(organization_id,customer_number,display_name) values(${organization.id},${`CUS-${crypto.randomUUID().slice(0, 8)}`},'SMS buyer') returning id`.execute(
      database.db,
    )
  ).rows[0]!;
  const order = (
    await sql<{
      id: string;
      order_number: string;
    }>`insert into orders.orders(organization_id,order_number,customer_id,currency_code,payment_method,subtotal_amount,discount_amount,total_amount) values(${organization.id},${`SMS-${crypto.randomUUID().slice(0, 8)}`},${customer.id}::uuid,'BDT','COD',680,0,680) returning id,order_number`.execute(
      database.db,
    )
  ).rows[0]!;
  await sql`insert into orders.order_customer_snapshots(order_id,organization_id,customer_id,display_name,phone,normalized_phone,email) values(${order.id}::uuid,${organization.id},${customer.id}::uuid,'SMS buyer',${phone},${normalizedPhone},null)`.execute(
    database.db,
  );
  const event = (
    await sql<{
      id: string;
    }>`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at) values(${organization.id},'orders.order.placed',1,'orders.order',${order.id}::uuid,${JSON.stringify({ orderId: order.id })}::jsonb,now()) returning id::text`.execute(
      database.db,
    )
  ).rows[0]!;
  await sql`insert into notifications.organization_policy_overrides(organization_id,notification_type,channel,enabled,automatic_enabled,manual_allowed) values(${organization.id},'ORDER_PLACED','SMS',true,true,true)`.execute(
    database.db,
  );
  return {
    organizationId: organization.id,
    customerId: customer.id,
    orderId: order.id,
    orderNumber: order.order_number,
    eventId: Number(event.id),
  };
}

describe('transactional SMS persistence and delivery', () => {
  it('creates one logical SMS, accepts it, delivers it, and never regresses on duplicate/out-of-order events', async () => {
    const data = await fixture('lifecycle');
    await notifications.createNotificationFromOutbox(database.db, data.eventId, {
      storefrontBaseUrl: runtime.storefrontBaseUrl,
      smsEnabled: true,
      smsProviderConfigured: true,
      smsProviderName: 'mock',
      smsSenderType: 'PROVIDER_DEFAULT',
    });
    await notifications.createNotificationFromOutbox(database.db, data.eventId, {
      smsEnabled: true,
      smsProviderConfigured: true,
    });
    let result = await notifications.listSmsNotifications(database.db, {
      organizationId: data.organizationId,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      status: 'QUEUED',
      intended_recipient: '+8801712345678',
      template_key: 'order-received',
      estimated_segments: 1,
    });

    const provider = notifications.createMockSmsProvider();
    expect(
      await notifications.deliverPendingSms(database.db, provider, runtime),
    ).toBeGreaterThanOrEqual(1);
    result = await notifications.listSmsNotifications(database.db, {
      organizationId: data.organizationId,
    });
    const accepted = result.items[0] as { id: string; provider_message_id: string; status: string };
    expect(accepted.status).toBe('ACCEPTED');
    const delivered = {
      providerEventId: `delivered-${crypto.randomUUID()}`,
      providerMessageId: accepted.provider_message_id,
      providerStatus: 'DELIVERED',
      status: 'DELIVERED' as const,
    };
    expect(
      (await notifications.applySmsDeliveryEvent(database.db, 'mock', delivered)).processed,
    ).toBe(true);
    expect(
      (await notifications.applySmsDeliveryEvent(database.db, 'mock', delivered)).processed,
    ).toBe(false);
    await notifications.applySmsDeliveryEvent(database.db, 'mock', {
      ...delivered,
      providerEventId: `late-${crypto.randomUUID()}`,
      providerStatus: 'ACCEPTED',
      status: 'ACCEPTED',
    });
    expect(
      (
        (await notifications.getSmsNotification(
          database.db,
          data.organizationId,
          accepted.id,
        )) as unknown as { status: string }
      ).status,
    ).toBe('DELIVERED');
  });

  it.each([
    ['missing', '', '', 'SKIPPED_NO_PHONE'],
    ['invalid', '12345', '12345', 'NOT_APPLICABLE'],
  ])(
    'records %s recipients without provider attempts',
    async (label, phone, normalized, status) => {
      const data = await fixture(label, phone, normalized);
      await notifications.createNotificationFromOutbox(database.db, data.eventId, {
        smsEnabled: true,
        smsProviderConfigured: true,
      });
      const item = (
        await notifications.listSmsNotifications(database.db, {
          organizationId: data.organizationId,
        })
      ).items[0] as { id: string; status: string };
      expect(item.status).toBe(status);
      expect(
        (
          await sql<{
            count: string;
          }>`select count(*)::text count from notifications.delivery_attempts where notification_id=${item.id}::uuid`.execute(
            database.db,
          )
        ).rows[0]?.count,
      ).toBe('0');
    },
  );

  it('classifies transient, permanent, and unknown outcomes without blindly retrying unknown sends', async () => {
    for (const [mode, expected, attemptStatus] of [
      ['TRANSIENT_FAILURE', 'FAILED', 'RETRY_WAIT'],
      ['PERMANENT_FAILURE', 'FAILED', 'PERMANENT_FAILURE'],
      ['UNKNOWN_OUTCOME', 'UNKNOWN_PROVIDER_OUTCOME', 'UNKNOWN_OUTCOME'],
    ] as const) {
      const data = await fixture(mode.toLowerCase());
      await notifications.createNotificationFromOutbox(database.db, data.eventId, {
        smsEnabled: true,
        smsProviderConfigured: true,
      });
      await notifications.deliverPendingSms(
        database.db,
        notifications.createMockSmsProvider({ mode }),
        runtime,
      );
      const item = (
        await notifications.listSmsNotifications(database.db, {
          organizationId: data.organizationId,
        })
      ).items[0] as { id: string; status: string };
      expect(item.status).toBe(expected);
      expect(
        (
          await sql<{
            status: string;
          }>`select status from notifications.delivery_attempts where notification_id=${item.id}::uuid`.execute(
            database.db,
          )
        ).rows[0]?.status,
      ).toBe(attemptStatus);
      if (mode === 'UNKNOWN_OUTCOME')
        await expect(
          notifications.retrySmsNotification(database.db, {
            organizationId: data.organizationId,
            notificationId: item.id,
            actorId: crypto.randomUUID(),
            reason: 'unsafe retry check',
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
    }
  });

  it('enforces suppression, manual idempotency, and request fingerprints', async () => {
    const data = await fixture('manual');
    const actorEmail = `sms-actor-${crypto.randomUUID()}@example.test`;
    const actor = (
      await sql<{
        id: string;
      }>`insert into iam.users(name,email,email_normalized) values('SMS operator',${actorEmail},${actorEmail}) returning id`.execute(
        database.db,
      )
    ).rows[0]!;
    const first = await notifications.createManualOrderSms(database.db, {
      organizationId: data.organizationId,
      orderId: data.orderId,
      notificationType: 'ORDER_PLACED',
      actorId: actor.id,
      idempotencyKey: 'manual-contract-1',
      reason: 'Customer requested confirmation',
      runtime,
    });
    expect(
      (
        await notifications.createManualOrderSms(database.db, {
          organizationId: data.organizationId,
          orderId: data.orderId,
          notificationType: 'ORDER_PLACED',
          actorId: actor.id,
          idempotencyKey: 'manual-contract-1',
          reason: 'safe replay',
          runtime,
        })
      ).created,
    ).toBe(false);
    await expect(
      notifications.createManualOrderSms(database.db, {
        organizationId: data.organizationId,
        orderId: data.orderId,
        notificationType: 'ORDER_PLACED',
        actorId: actor.id,
        idempotencyKey: 'manual-contract-1',
        reason: 'payload mismatch',
        recipientOverride: '+8801812345678',
        runtime,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(first.created).toBe(true);
    await notifications.setSmsSuppression(database.db, {
      organizationId: data.organizationId,
      actorId: actor.id,
      phone: '+8801712345678',
      active: true,
      reason: 'Customer asked to stop SMS',
    });
    await expect(
      notifications.createManualOrderSms(database.db, {
        organizationId: data.organizationId,
        orderId: data.orderId,
        notificationType: 'ORDER_PLACED',
        actorId: actor.id,
        idempotencyKey: 'manual-contract-2',
        reason: 'should be suppressed',
        runtime,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('supports searchable operations, rich detail, diagnostics, and a persisted mock lifecycle', async () => {
    const data = await fixture('frontend');
    const actorEmail = `sms-frontend-${crypto.randomUUID()}@example.test`;
    const actor = (
      await sql<{
        id: string;
      }>`insert into iam.users(name,email,email_normalized) values('SMS frontend operator',${actorEmail},${actorEmail}) returning id`.execute(
        database.db,
      )
    ).rows[0]!;
    const created = await notifications.createManualOrderSms(database.db, {
      organizationId: data.organizationId,
      orderId: data.orderNumber,
      notificationType: 'ORDER_PLACED',
      actorId: actor.id,
      idempotencyKey: 'sms-frontend-lifecycle',
      reason: 'Controlled UI lifecycle test',
      triggerType: 'TEST',
      recipientOverride: '+8801712345678',
      runtime,
    });
    await notifications.runSmsTestScenario(database.db, {
      organizationId: data.organizationId,
      notificationId: created.id,
      scenario: 'DELIVERED',
    });

    const searched = await notifications.listSmsNotifications(database.db, {
      organizationId: data.organizationId,
      search: data.orderNumber,
      status: 'DELIVERED',
      triggerType: 'TEST',
      encoding: 'GSM_7',
    });
    expect(searched.items).toHaveLength(1);
    expect(searched.items[0]).toMatchObject({
      id: created.id,
      order_number: data.orderNumber,
      customer_name: 'SMS buyer',
      latest_attempt_status: 'ACCEPTED',
    });

    const detail = await notifications.getSmsNotification(
      database.db,
      data.organizationId,
      created.id,
    );
    expect(detail.status).toBe('DELIVERED');
    expect(detail.providerEvents).toHaveLength(1);
    expect(detail.auditEvents[0]).toMatchObject({
      actor_name: 'SMS frontend operator',
      reason: 'Controlled UI lifecycle test',
    });
    expect(detail.availableActions.canResend).toBe(true);

    const summary = await notifications.smsOperationalSummary(
      database.db,
      data.organizationId,
      { ...runtime, allowedTestRecipients: ['+8801712345678'] },
      notifications.createMockSmsProvider(),
    );
    expect(summary).toMatchObject({
      delivered: 1,
      mode: 'MOCK',
      activeSuppressions: 0,
      callbackSupported: true,
      pollingSupported: true,
    });
    expect(summary.today.created).toBeGreaterThanOrEqual(1);
  });
});
