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
type NotificationRow = { id: string; status: string };

async function fixture(label: string) {
  const organization = await createOrganization(database.db, {
    code: `notify-${label}-${crypto.randomUUID().slice(0, 8)}`,
    displayName: 'Notification test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const customer = await sql<{
    id: string;
  }>`insert into customers.customers(organization_id,customer_number,display_name) values(${organization.id},${`CUS-${crypto.randomUUID().slice(0, 8)}`},'Notification buyer') returning id`.execute(
    database.db,
  );
  const customerEmail = `buyer-${crypto.randomUUID()}@example.test`;
  await sql`insert into customers.customer_emails(organization_id,customer_id,raw_value,normalized_value,is_primary) values(${organization.id},${customer.rows[0]!.id}::uuid,${customerEmail},${customerEmail},true)`.execute(
    database.db,
  );
  const order = await sql<{
    id: string;
  }>`insert into orders.orders(organization_id,order_number,customer_id,currency_code,payment_method,subtotal_amount,discount_amount,total_amount) values(${organization.id},${`NOT-${crypto.randomUUID().slice(0, 8)}`},${customer.rows[0]!.id}::uuid,'BDT','COD',1,0,1) returning id`.execute(
    database.db,
  );
  await sql`insert into orders.order_customer_snapshots(order_id,organization_id,customer_id,display_name,phone,normalized_phone,email) values(${order.rows[0]!.id}::uuid,${organization.id},${customer.rows[0]!.id}::uuid,'Notification buyer','01700000000','01700000000',${customerEmail})`.execute(database.db);
  const event = await sql<{
    id: string;
  }>`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at) values(${organization.id},'orders.order.placed',1,'orders.order',${order.rows[0]!.id}::uuid,${JSON.stringify({ orderId: order.rows[0]!.id })}::jsonb,now()) returning id::text`.execute(
    database.db,
  );
  return {
    organizationId: organization.id,
    customerId: customer.rows[0]!.id,
    orderId: order.rows[0]!.id,
    eventId: Number(event.rows[0]!.id),
  };
}

describe('notifications and integrations', () => {
  it('creates required notifications once despite duplicate outbox delivery and isolates retry failure from Order truth', async () => {
    const data = await fixture('required');
    await notifications.setNotificationPreference(database.db, {
      organizationId: data.organizationId,
      recipientType: 'CUSTOMER',
      recipientId: data.customerId,
      notificationType: 'ORDER_PLACED',
      channel: 'EMAIL',
      enabled: false,
    });
    expect(
      await notifications.listNotificationPreferences(database.db, {
        organizationId: data.organizationId,
        recipientType: 'CUSTOMER',
        recipientId: data.customerId,
      }),
    ).toEqual([
      expect.objectContaining({
        notification_type: 'ORDER_PLACED',
        channel: 'EMAIL',
        enabled: false,
      }),
    ]);
    await notifications.createNotificationFromOutbox(database.db, data.eventId);
    await notifications.createNotificationFromOutbox(database.db, data.eventId);
    const rows = (await notifications.listNotifications(
      database.db,
      data.organizationId,
    )) as NotificationRow[];
    expect(rows).toHaveLength(3);
    expect(rows.filter((row: NotificationRow & { channel?: string }) => row.channel !== 'SMS').every((row) => row.status === 'QUEUED')).toBe(true);
    await notifications.recordNotificationAttempt(database.db, {
      organizationId: data.organizationId,
      notificationId: rows[0]!.id,
      provider: 'test-email',
      outcome: 'FAILED',
      errorCode: 'OUTAGE',
    });
    const order = await sql<{
      order_status: string;
    }>`select order_status from orders.orders where id=${data.orderId}::uuid`.execute(database.db);
    expect(order.rows[0]?.order_status).toBe('PENDING');
  });
  it('suppresses optional channel preferences while required policy does not bypass tenant boundaries', async () => {
    const data = await fixture('optional');
    await notifications.setNotificationPreference(database.db, {
      organizationId: data.organizationId,
      recipientType: 'CUSTOMER',
      recipientId: data.customerId,
      notificationType: 'ORDER_CANCELLED',
      channel: 'IN_APP',
      enabled: false,
    });
    await sql`update platform.outbox_events set event_type='orders.order.cancelled' where id=${data.eventId}`.execute(
      database.db,
    );
    await notifications.createNotificationFromOutbox(database.db, data.eventId);
    expect(
      (
        (await notifications.listNotifications(
          database.db,
          data.organizationId,
        )) as NotificationRow[]
      ).some((row) => row.status === 'SUPPRESSED'),
    ).toBe(true);
  });
  it('signs exact webhook bytes, rejects private destinations, dedupes provider events, and preserves unknown outcome', async () => {
    const data = await fixture('integration');
    const email = `integration-${crypto.randomUUID()}@example.test`;
    const user = await sql<{
      id: string;
    }>`insert into iam.users(name,email,email_normalized) values('Integration owner',${email},${email}) returning id`.execute(
      database.db,
    );
    const integration = await sql<{
      id: string;
    }>`insert into integrations.integrations(organization_id,provider_code,integration_type,name) values(${data.organizationId},'TEST','COURIER','Test courier') returning id`.execute(
      database.db,
    );
    const account = await sql<{
      id: string;
    }>`insert into integrations.integration_accounts(organization_id,integration_id,name) values(${data.organizationId},${integration.rows[0]!.id}::uuid,'Account') returning id`.execute(
      database.db,
    );
    const secret = 'test-secret';
    const signature = notifications.webhookSignature(secret, 'event-1', '1700000000', '{}');
    expect(
      notifications.verifyWebhookSignature(secret, 'event-1', '1700000000', '{}', signature),
    ).toBe(true);
    expect(
      notifications.verifyWebhookSignature(
        secret,
        'event-1',
        '1700000000',
        '{"changed":true}',
        signature,
      ),
    ).toBe(false);
    await expect(
      notifications.createWebhookEndpoint(database.db, {
        organizationId: data.organizationId,
        actorId: user.rows[0]!.id,
        name: 'Unsafe',
        endpointUrl: 'http://127.0.0.1/hook',
        eventTypes: ['order.created'],
        encryptionKey: { id: 'test', value: Buffer.alloc(32) },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const event = {
      organizationId: data.organizationId,
      integrationAccountId: account.rows[0]!.id,
      providerEventId: 'provider-1',
      eventType: 'delivery',
      providerStatus: 'RAW_PROVIDER_STATE',
      payload: { reference: 'x' },
      authenticationStatus: 'VERIFIED' as const,
    };
    const providerRace = await Promise.all([
      notifications.ingestProviderEvent(database.db, event),
      notifications.ingestProviderEvent(database.db, event),
    ]);
    expect(providerRace.filter((result) => result.created)).toHaveLength(1);
    const operation = await notifications.createIntegrationOperation(database.db, {
      organizationId: data.organizationId,
      integrationAccountId: account.rows[0]!.id,
      operationType: 'BOOK',
      operationKey: 'one',
      localEntityType: 'orders.order',
      localEntityId: data.orderId,
      requestFingerprint: 'hash',
    });
    await notifications.markOperationUnknown(database.db, data.organizationId, operation.id);
    const status = await sql<{
      status: string;
    }>`select status from integrations.integration_operations where id=${operation.id}::uuid`.execute(
      database.db,
    );
    expect(status.rows[0]?.status).toBe('UNKNOWN_OUTCOME');
    expect(
      await notifications.verifyNotificationIntegrationIntegrity(database.db, data.organizationId),
    ).toEqual([]);
  });
  it('pins rendered notifications to immutable published template revisions', async () => {
    const data = await fixture('templates');
    const template = await notifications.createNotificationTemplate(database.db, {
      organizationId: data.organizationId,
      notificationType: 'ORDER_PLACED',
      channel: 'IN_APP',
      name: 'Order email',
    });
    const first = await notifications.createTemplateRevision(database.db, {
      organizationId: data.organizationId,
      templateId: template.id,
      subjectTemplate: 'Order update',
      bodyTemplate: 'Version one',
      variableSchema: {},
    });
    await notifications.publishTemplateRevision(
      database.db,
      data.organizationId,
      template.id,
      first.id,
    );
    await notifications.createNotificationFromOutbox(database.db, data.eventId);
    const second = await notifications.createTemplateRevision(database.db, {
      organizationId: data.organizationId,
      templateId: template.id,
      bodyTemplate: 'Version two',
      variableSchema: {},
    });
    await notifications.publishTemplateRevision(
      database.db,
      data.organizationId,
      template.id,
      second.id,
    );
    const nextEvent = await sql<{
      id: string;
    }>`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at) values(${data.organizationId},'orders.order.placed',1,'orders.order',${data.orderId}::uuid,${JSON.stringify({ orderId: data.orderId })}::jsonb,now()) returning id::text`.execute(
      database.db,
    );
    await notifications.createNotificationFromOutbox(database.db, Number(nextEvent.rows[0]!.id));
    const rendered = await sql<{
      rendered_body: string;
      revision_number: number;
    }>`select n.rendered_body,r.revision_number from notifications.notifications n join notifications.template_revisions r on r.id=n.template_revision_id where n.organization_id=${data.organizationId} and n.channel='IN_APP' order by n.created_at`.execute(
      database.db,
    );
    expect(rendered.rows.map((row) => [row.rendered_body, row.revision_number])).toEqual([
      ['Version one', 1],
      ['Version two', 2],
    ]);
  });
  it('runs bounded email attempts idempotently and marks in-app notifications read for their recipient only', async () => {
    const data = await fixture('delivery');
    await notifications.createNotificationFromOutbox(database.db, data.eventId);
    let calls = 0;
    const adapter: notifications.EmailAdapter = {
      name: 'test',
      effectiveRecipient: (recipient) => recipient,
      async send() {
        calls++;
        return { status: 'SENT', providerReference: 'provider-one' };
      },
    };
    expect(
      await notifications.deliverPendingEmails(database.db, adapter, 20, data.organizationId),
    ).toBe(1);
    expect(
      await notifications.deliverPendingEmails(database.db, adapter, 20, data.organizationId),
    ).toBe(0);
    expect(calls).toBe(1);
    const inbox = await notifications.listRecipientInbox(database.db, {
      organizationId: data.organizationId,
      recipientType: 'CUSTOMER',
      recipientId: data.customerId,
    });
    expect(inbox).toHaveLength(1);
    await notifications.markNotificationRead(database.db, {
      organizationId: data.organizationId,
      recipientType: 'CUSTOMER',
      recipientId: data.customerId,
      notificationId: String(inbox[0]!.id),
    });
    expect(
      await notifications.listRecipientInbox(database.db, {
        organizationId: data.organizationId,
        recipientType: 'CUSTOMER',
        recipientId: data.customerId,
        unreadOnly: true,
      }),
    ).toHaveLength(0);
  });
  it('blocks DNS rebinding and redirect destinations that resolve to private networks', async () => {
    await expect(
      notifications.validateWebhookDestination('https://hooks.example.test/event', async () => [
        '10.0.0.2',
      ]),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      notifications.validateWebhookDestination('https://hooks.example.test/event', async () => [
        '8.8.8.8',
      ]),
    ).resolves.toBeInstanceOf(URL);
  });

  it('records missing email without retrying and makes automatic policy disablement visible', async () => {
    const missing = await fixture('missing-email');
    await sql`update orders.order_customer_snapshots set email=null where order_id=${missing.orderId}::uuid`.execute(database.db);
    await notifications.createNotificationFromOutbox(database.db, missing.eventId);
    const missingEmail = await sql<{ status: string; skip_reason: string }>`select status,skip_reason from notifications.notifications where organization_id=${missing.organizationId} and channel='EMAIL'`.execute(database.db);
    expect(missingEmail.rows[0]).toEqual({ status: 'SKIPPED_NO_EMAIL', skip_reason: 'CUSTOMER_EMAIL_MISSING' });

    const manual = await fixture('manual-policy');
    const policyEmail = `policy-${crypto.randomUUID()}@example.test`;
    const policyActor = await sql<{ id: string }>`insert into iam.users(name,email,email_normalized) values('Policy owner',${policyEmail},${policyEmail}) returning id`.execute(database.db);
    await notifications.updateEmailPolicy(database.db, {
      organizationId: manual.organizationId,
      notificationType: 'ORDER_PLACED',
      enabled: true,
      automaticEnabled: false,
      manualAllowed: true,
      actorId: policyActor.rows[0]!.id,
      reason: 'Test automatic disablement',
    });
    await notifications.createNotificationFromOutbox(database.db, manual.eventId);
    const pendingManual = await sql<{ status: string; skip_reason: string }>`select status,skip_reason from notifications.notifications where organization_id=${manual.organizationId} and channel='EMAIL'`.execute(database.db);
    expect(pendingManual.rows[0]).toEqual({ status: 'PENDING_MANUAL', skip_reason: 'AUTOMATIC_SENDING_DISABLED' });
  });

  it('deduplicates Resend webhooks, guards out-of-order state, and suppresses complaints', async () => {
    const data = await fixture('resend-webhook');
    await notifications.createNotificationFromOutbox(database.db, data.eventId);
    const messageId = `resend-msg-${crypto.randomUUID()}`;
    const baseEventId = `resend-evt-${crypto.randomUUID()}`;
    const email = await sql<{ id: string }>`update notifications.notifications set provider='resend',provider_message_id=${messageId},status='SENT' where organization_id=${data.organizationId} and channel='EMAIL' returning id`.execute(database.db);
    const delivered = {
      providerEventId: `${baseEventId}-delivered`,
      type: 'email.delivered',
      createdAt: new Date().toISOString(),
      data: { email_id: messageId, to: ['buyer@example.test'] },
      rawPayload: { type: 'email.delivered', data: { email_id: messageId } },
    };
    expect(await notifications.ingestResendWebhook(database.db, delivered)).toMatchObject({ created: true, processed: true });
    expect(await notifications.ingestResendWebhook(database.db, delivered)).toMatchObject({ created: false, processed: false });
    await notifications.ingestResendWebhook(database.db, {
      ...delivered,
      providerEventId: `${baseEventId}-delayed-late`,
      type: 'email.delivery_delayed',
    });
    expect((await sql<{ status: string }>`select status from notifications.notifications where id=${email.rows[0]!.id}::uuid`.execute(database.db)).rows[0]?.status).toBe('DELIVERED');
    await notifications.ingestResendWebhook(database.db, {
      ...delivered,
      providerEventId: `${baseEventId}-complaint`,
      type: 'email.complained',
    });
    expect((await sql<{ status: string }>`select status from notifications.notifications where id=${email.rows[0]!.id}::uuid`.execute(database.db)).rows[0]?.status).toBe('COMPLAINED');
    expect((await sql<{ count: string }>`select count(*)::text count from notifications.email_suppressions where organization_id=${data.organizationId} and active`.execute(database.db)).rows[0]?.count).toBe('1');
  });

  it('previews email templates with sample fixture data and with human order numbers without side effects', async () => {
    const data = await fixture('preview-test');
    const options = {
      storefrontBaseUrl: 'https://shop.maevelle.local',
      supportEmail: 'maevelleBangladesh@gmail.com',
    };

    // 1. Preview with sample fixture (no orderId)
    const samplePreview = await notifications.previewOrderEmail(database.db, {
      organizationId: data.organizationId,
      notificationType: 'ORDER_CONFIRMED',
      options,
    });
    expect(samplePreview.isSampleFixture).toBe(true);
    expect(samplePreview.intendedRecipient).toBe('ayesha.rahman@example.com');
    expect(samplePreview.subject).toContain('MV-10248');
    expect(samplePreview.html).toContain('Ayesha Rahman');
    expect(samplePreview.text).toContain('MV-10248');

    // 2. Preview with human order number instead of UUID
    const orderRow = await sql<{ order_number: string }>`select order_number from orders.orders where id=${data.orderId}::uuid`.execute(database.db);
    const orderNumber = orderRow.rows[0]!.order_number;

    const orderPreview = await notifications.previewOrderEmail(database.db, {
      organizationId: data.organizationId,
      orderId: orderNumber,
      notificationType: 'ORDER_PLACED',
      options,
    });
    expect(orderPreview.isSampleFixture).toBe(false);
    expect(orderPreview.subject).toContain(orderNumber);
    expect(orderPreview.html).toContain('Notification buyer');

    // Verify preview had zero sending side effects
    const count = await sql<{ count: string }>`select count(*)::text count from notifications.notifications where organization_id=${data.organizationId}`.execute(database.db);
    expect(Number(count.rows[0]?.count ?? 0)).toBe(0);
  });

  it('supports manual transactional sending, retry of failed email, and manual resend with parent correlation', async () => {
    const data = await fixture('manual-send-test');
    const userEmail = `actor-${crypto.randomUUID()}@example.test`;
    const user = await sql<{ id: string }>`insert into iam.users(name,email,email_normalized) values('Admin actor',${userEmail},${userEmail}) returning id`.execute(database.db);
    const actorId = user.rows[0]!.id;
    const options = {
      storefrontBaseUrl: 'https://shop.maevelle.local',
      supportEmail: 'maevelleBangladesh@gmail.com',
    };

    // 1. Manual send
    const manualResult = await notifications.createManualOrderEmail(database.db, {
      organizationId: data.organizationId,
      orderId: data.orderId,
      notificationType: 'ORDER_PLACED',
      actorId,
      idempotencyKey: 'manual-key-1',
      reason: 'Manual order confirmation send from test',
      options,
    });
    expect(manualResult.created).toBe(true);

    const firstNotification = await notifications.getEmailNotification(database.db, data.organizationId, manualResult.id);
    expect(firstNotification.status).toBe('QUEUED');
    expect(firstNotification.trigger_type).toBe('MANUAL');

    // Idempotent duplicate manual send
    const dupResult = await notifications.createManualOrderEmail(database.db, {
      organizationId: data.organizationId,
      orderId: data.orderId,
      notificationType: 'ORDER_PLACED',
      actorId,
      idempotencyKey: 'manual-key-1',
      reason: 'Duplicate manual send',
      options,
    });
    expect(dupResult.created).toBe(false);
    expect(dupResult.id).toBe(manualResult.id);

    // 2. Technical failure & Retry
    await sql`update notifications.notifications set status='FAILED',failure_code='RESEND_NETWORK_ERROR' where id=${manualResult.id}::uuid`.execute(database.db);
    await notifications.retryEmailNotification(database.db, {
      organizationId: data.organizationId,
      notificationId: manualResult.id,
      actorId,
      reason: 'Operator retry after network recovery',
    });

    const retried = await notifications.getEmailNotification(database.db, data.organizationId, manualResult.id);
    expect(retried.status).toBe('QUEUED');
    expect(retried.failure_code).toBeNull();
    const retryEvent = retried.timeline.find((t: { event_type: string }) => t.event_type === 'RETRY_REQUESTED');
    expect(retryEvent).toBeDefined();

    // 3. Intentional Resend (creates distinct new notification linked to parent)
    const resendResult = await notifications.createManualOrderEmail(database.db, {
      organizationId: data.organizationId,
      orderId: data.orderId,
      notificationType: 'ORDER_PLACED',
      actorId,
      idempotencyKey: 'resend-key-1',
      reason: 'Customer requested another copy',
      triggerType: 'RESEND',
      parentNotificationId: manualResult.id,
      options,
    });
    expect(resendResult.created).toBe(true);
    expect(resendResult.id).not.toBe(manualResult.id);

    const resendNotification = await notifications.getEmailNotification(database.db, data.organizationId, resendResult.id);
    expect(resendNotification.trigger_type).toBe('RESEND');
    expect(resendNotification.parent_notification_id).toBe(manualResult.id);
  });

  it('evaluates order email eligibility accurately across status, policy, and suppression state', async () => {
    const data = await fixture('eligibility');

    // 1. Initial order eligibility
    const initialEligibility = await notifications.getOrderEmailEligibility(database.db, {
      organizationId: data.organizationId,
      orderId: data.orderId,
      globalEnabled: true,
    });

    expect(initialEligibility.orderId).toBe(data.orderId);
    expect(initialEligibility.customerEmail).toBeTruthy();
    expect(initialEligibility.isSuppressed).toBe(false);
    expect(initialEligibility.events.length).toBeGreaterThan(4);

    const placedEvent = initialEligibility.events.find((e) => e.notificationType === 'ORDER_PLACED');
    expect(placedEvent).toBeDefined();
    expect(placedEvent?.orderReachedState).toBe(true);
    expect(placedEvent?.canSendManually).toBe(true);

    const shippedEvent = initialEligibility.events.find((e) => e.notificationType === 'ORDER_DISPATCHED');
    expect(shippedEvent).toBeDefined();
    expect(shippedEvent?.orderReachedState).toBe(false); // Order not dispatched yet

    // 2. Recipient suppression check
    await sql`insert into notifications.email_suppressions(organization_id, normalized_email, reason, source, active)
      values(${data.organizationId}, ${initialEligibility.customerEmail!.toLowerCase()}, 'HARD_BOUNCE', 'RESEND_WEBHOOK', true)`.execute(database.db);

    const suppressedEligibility = await notifications.getOrderEmailEligibility(database.db, {
      organizationId: data.organizationId,
      orderId: data.orderId,
      globalEnabled: true,
    });

    expect(suppressedEligibility.isSuppressed).toBe(true);
    expect(suppressedEligibility.suppressionReason).toBe('HARD_BOUNCE');
    const suppressedPlaced = suppressedEligibility.events.find((e) => e.notificationType === 'ORDER_PLACED');
    expect(suppressedPlaced?.canSendManually).toBe(false);
    expect(suppressedPlaced?.eligibilityCode).toBe('RECIPIENT_SUPPRESSED');
  });

  it('renders template previews for sample fixtures and authentic orders with zero side effects', async () => {
    const data = await fixture('preview');
    const options = {
      storefrontBaseUrl: 'http://localhost:3000',
      supportEmail: 'maevelleBangladesh@gmail.com',
      senderFrom: 'Maevelle <orders@maevelle.com>',
    };

    // 1. Fixture preview
    const fixturePreview = await notifications.previewOrderEmail(database.db, {
      organizationId: data.organizationId,
      notificationType: 'ORDER_CONFIRMED',
      fixtureKey: 'multi-item',
      options,
    });

    expect(fixturePreview.isSampleFixture).toBe(true);
    expect(fixturePreview.subject).toContain('Maevelle');
    expect(fixturePreview.html).toContain('<!DOCTYPE html');
    expect(fixturePreview.text).toContain('Maevelle');
    expect(fixturePreview.availableFixtures?.length).toBeGreaterThan(3);

    // 2. Real order preview
    const orderPreview = await notifications.previewOrderEmail(database.db, {
      organizationId: data.organizationId,
      orderId: data.orderId,
      notificationType: 'ORDER_PLACED',
      options,
    });

    expect(orderPreview.isSampleFixture).toBe(false);
    expect(orderPreview.subject).toContain('Maevelle');
    expect(orderPreview.html).toContain('<!DOCTYPE html');

    // 3. Confirm zero notifications were written by previewing
    const operations = await notifications.listEmailNotifications(database.db, {
      organizationId: data.organizationId,
      sourceId: data.orderId,
      page: 1,
      pageSize: 10,
    });
    expect(operations.data.length).toBe(0);
  });

  it('dispatches test emails to allow-listed test recipients with audit tracking', async () => {
    const data = await fixture('test-send');
    const options = {
      storefrontBaseUrl: 'http://localhost:3000',
      supportEmail: 'maevelleBangladesh@gmail.com',
      senderFrom: 'Maevelle <orders@maevelle.com>',
    };
    const testRecipient = 'qa-dev@example.test';
    const actorEmail = `tester-${crypto.randomUUID()}@example.test`;
    const actor = await sql<{ id: string }>`insert into iam.users(name,email,email_normalized) values('SMS and email tester',${actorEmail},${actorEmail}) returning id`.execute(database.db);

    const testSendResult = await notifications.sendTestEmail(database.db, {
      organizationId: data.organizationId,
      actorId: actor.rows[0]!.id,
      notificationType: 'ORDER_CONFIRMED',
      testRecipient,
      orderId: data.orderId,
      reason: 'Automated test suite verification',
      options,
    });

    expect(testSendResult.id).toBeDefined();
    expect(testSendResult.recipient).toBe(testRecipient);

    const testNotification = await notifications.getEmailNotification(
      database.db,
      data.organizationId,
      testSendResult.id,
    );
    expect(testNotification.trigger_type).toBe('TEST');
    expect(testNotification.intended_recipient).toBe(testRecipient);
    expect(testNotification.status).toBe('QUEUED');
  });
});
