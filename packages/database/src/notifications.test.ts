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
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'PENDING')).toBe(true);
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
      channel: 'EMAIL',
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
      channel: 'EMAIL',
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
    }>`select n.rendered_body,r.revision_number from notifications.notifications n join notifications.template_revisions r on r.id=n.template_revision_id where n.organization_id=${data.organizationId} and n.channel='EMAIL' order by n.created_at`.execute(
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
});
