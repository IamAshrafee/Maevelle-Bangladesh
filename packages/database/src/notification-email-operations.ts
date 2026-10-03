import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';
import {
  renderTransactionalEmail,
  type TransactionalEmailTemplateKey,
} from './email-templates.js';

export class EmailNotificationError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
  }
}

export interface EmailRenderOptions {
  readonly storefrontBaseUrl: string;
  readonly supportEmail: string;
  readonly senderFrom?: string;
  readonly environmentLabel?: string;
}

async function orderEmailModel(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  orderIdentifier: string,
) {
  const trimmed = orderIdentifier.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  const order = await sql<{
    id: string;
    customer_id: string;
    order_number: string;
    display_name: string;
    email: string | null;
    currency_code: string;
    total_amount: string;
    order_status: string;
    delivery_address: string | null;
  }>`select order_row.id,order_row.customer_id,order_row.order_number,
      coalesce(snapshot.display_name, customer.display_name, 'Customer') display_name,
      case when snapshot.order_id is not null then snapshot.email else customer_email.normalized_value end email,
      order_row.currency_code,order_row.total_amount::text,order_row.order_status,
      concat_ws(', ',address.address_line_1,address.address_line_2,address.area,address.city,address.district,address.postal_code) delivery_address
    from orders.orders order_row
    left join orders.order_customer_snapshots snapshot on snapshot.order_id=order_row.id
    left join customers.customers customer on customer.id=order_row.customer_id
    left join customers.customer_emails customer_email on customer_email.customer_id=order_row.customer_id and customer_email.is_primary
    left join orders.order_addresses address on address.order_id=order_row.id and address.address_type='DELIVERY'
    where order_row.organization_id=${organizationId} and (${isUuid ? sql`order_row.id=${trimmed}::uuid` : sql`false`} or order_row.order_number=${trimmed})`.execute(db);
  const row = order.rows[0];
  if (!row) throw new EmailNotificationError('NOT_FOUND', 'Order was not found.');
  const items = await sql<{ title: string; variant: string | null; quantity: string; amount: string }>`
    select product_title_snapshot title,variant_title_snapshot variant,quantity::text,net_amount::text amount
    from orders.order_lines where order_id=${row.id}::uuid and line_status='ACTIVE' order by id
  `.execute(db);
  return { ...row, items: items.rows };
}

async function manualEventEligible(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  orderId: string,
  notificationType: string,
  orderStatus: string,
) {
  if (notificationType === 'ORDER_PLACED') return true;
  if (notificationType === 'ORDER_CONFIRMED') return ['CONFIRMED', 'COMPLETED'].includes(orderStatus);
  if (notificationType === 'ORDER_CANCELLED') return orderStatus === 'CANCELLED';
  if (notificationType === 'ORDER_COMPLETED') return orderStatus === 'COMPLETED';
  const result = await sql<{ eligible: boolean }>`select case
    when ${notificationType}='PAYMENT_VERIFIED' then exists(
      select 1 from platform.outbox_events event where event.organization_id=${organizationId}
        and event.event_type='payments.payment.verified' and event.payload->>'orderId'=${orderId}
    )
    when ${notificationType}='ORDER_DISPATCHED' then exists(
      select 1 from fulfillment.fulfillments fulfillment where fulfillment.organization_id=${organizationId}
        and fulfillment.order_id=${orderId}::uuid and fulfillment.status='DISPATCHED'
    )
    when ${notificationType}='DELIVERY_COMPLETED' then exists(
      select 1 from delivery.deliveries delivery where delivery.organization_id=${organizationId}
        and delivery.order_id=${orderId}::uuid and delivery.outcome_status='DELIVERED'
    )
    when ${notificationType}='REFUND_COMPLETED' then exists(
      select 1 from payments.refunds refund where refund.organization_id=${organizationId}
        and refund.order_id=${orderId}::uuid and refund.status='COMPLETED'
    )
    else false end eligible`.execute(db);
  return result.rows[0]?.eligible ?? false;
}

async function policy(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  notificationType: string,
) {
  const result = await sql<{
    notification_type: string;
    template_key: TransactionalEmailTemplateKey | null;
    enabled: boolean;
    automatic_enabled: boolean;
    manual_allowed: boolean;
  }>`select policy.notification_type,channel_policy.template_key,
      coalesce(override.enabled,channel_policy.enabled) enabled,
      coalesce(override.automatic_enabled,channel_policy.automatic_enabled) automatic_enabled,
      coalesce(override.manual_allowed,channel_policy.manual_allowed) manual_allowed
    from notifications.notification_policies policy
    join notifications.notification_channel_policies channel_policy
      on channel_policy.notification_type=policy.notification_type and channel_policy.channel='EMAIL'
    left join notifications.organization_policy_overrides override
      on override.organization_id=${organizationId} and override.notification_type=policy.notification_type and override.channel='EMAIL'
    where policy.notification_type=${notificationType}`.execute(db);
  return result.rows[0];
}

export async function listEmailPolicies(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select policy.notification_type,policy.delivery_requirement,channel_policy.template_key,
      coalesce(override.enabled,channel_policy.enabled) enabled,
      coalesce(override.automatic_enabled,channel_policy.automatic_enabled) automatic_enabled,
      coalesce(override.manual_allowed,channel_policy.manual_allowed) manual_allowed,
      override.updated_at::text
    from notifications.notification_policies policy
    join notifications.notification_channel_policies channel_policy
      on channel_policy.notification_type=policy.notification_type and channel_policy.channel='EMAIL'
    left join notifications.organization_policy_overrides override
      on override.organization_id=${organizationId} and override.notification_type=policy.notification_type and override.channel='EMAIL'
    order by policy.notification_type`.execute(db)
  ).rows;
}

export async function updateEmailPolicy(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    notificationType: string;
    enabled: boolean;
    automaticEnabled: boolean;
    manualAllowed: boolean;
    actorId: string;
    reason: string;
  },
) {
  if (!input.reason.trim())
    throw new EmailNotificationError('VALIDATION_FAILED', 'A policy-change reason is required.');
  await db.transaction().execute(async (tx) => {
    const existing = await policy(tx, input.organizationId, input.notificationType);
    if (!existing) throw new EmailNotificationError('NOT_FOUND', 'Email policy was not found.');
    await sql`insert into notifications.organization_policy_overrides(
      organization_id,notification_type,channel,enabled,automatic_enabled,manual_allowed,updated_by_actor_id
    ) values(${input.organizationId},${input.notificationType},'EMAIL',${input.enabled},${input.automaticEnabled},${input.manualAllowed},${input.actorId})
    on conflict(organization_id,notification_type,channel) do update set enabled=excluded.enabled,automatic_enabled=excluded.automatic_enabled,manual_allowed=excluded.manual_allowed,updated_by_actor_id=excluded.updated_by_actor_id,updated_at=now()`.execute(tx);
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'notifications.email_policy.updated',
      targetType: 'notifications.notification_policy',
      reason: input.reason.trim(),
      beforeDiff: existing,
      afterDiff: {
        enabled: input.enabled,
        automaticEnabled: input.automaticEnabled,
        manualAllowed: input.manualAllowed,
      },
    });
  });
}

export interface SampleFixture {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly data: {
    readonly display_name: string;
    readonly order_number: string;
    readonly currency_code: string;
    readonly total_amount: string;
    readonly delivery_address: string | null;
    readonly email: string;
    readonly items: readonly {
      readonly title: string;
      readonly variant?: string | null;
      readonly quantity: string;
      readonly amount: string;
    }[];
  };
}

export const sampleFixtures: Record<string, SampleFixture> = {
  'multi-item': {
    key: 'multi-item',
    label: 'Multi-item Fashion Order',
    description: '2 apparel items with size/color variants and delivery address',
    data: {
      display_name: 'Ayesha Rahman',
      order_number: 'MV-10248',
      currency_code: 'BDT',
      total_amount: '4250.00',
      delivery_address: 'House 12, Road 4, Dhanmondi, Dhaka 1205',
      email: 'ayesha.rahman@example.com',
      items: [
        { title: 'Embroidered Silk Kurti', variant: 'Plum / M', quantity: '1', amount: '2850.00' },
        { title: 'Matching Organza Dupatta', variant: 'Plum', quantity: '1', amount: '1400.00' },
      ],
    },
  },
  'simple-cod': {
    key: 'simple-cod',
    label: 'Simple COD Order (1 item)',
    description: 'Single accessory item paid via Cash on Delivery',
    data: {
      display_name: 'Tanvir Hasan',
      order_number: 'MV-10249',
      currency_code: 'BDT',
      total_amount: '1450.00',
      delivery_address: 'Flat 4B, Plot 18, Block D, Banani, Dhaka 1213',
      email: 'tanvir.hasan@example.com',
      items: [
        { title: 'Classic Leather Minimalist Wallet', variant: 'Cognac Brown', quantity: '1', amount: '1450.00' },
      ],
    },
  },
  'discounted': {
    key: 'discounted',
    label: 'Discounted Promotional Order',
    description: 'Multiple jewelry items with promotional pricing applied',
    data: {
      display_name: 'Sabrina Karim',
      order_number: 'MV-10250',
      currency_code: 'BDT',
      total_amount: '3180.00',
      delivery_address: 'House 55, Road 9/A, Dhanmondi, Dhaka 1209',
      email: 'sabrina.karim@example.com',
      items: [
        { title: 'Pearl Cluster Hair Clip Set', variant: 'Gold / Pack of 2', quantity: '2', amount: '1360.00' },
        { title: 'Zirconia Teardrop Earrings', variant: 'Rose Gold', quantity: '1', amount: '1820.00' },
      ],
    },
  },
  'large-order': {
    key: 'large-order',
    label: 'Large Multi-line Order',
    description: '4 diverse items spanning wardrobe and accessories',
    data: {
      display_name: 'Dr. Nusrat Jahan',
      order_number: 'MV-10251',
      currency_code: 'BDT',
      total_amount: '8900.00',
      delivery_address: 'Apartment 7A, Green Tower, GEC Circle, Chattogram 4000',
      email: 'dr.nusrat@example.com',
      items: [
        { title: 'Handwoven Muslin Saree', variant: 'Lilac Dusk', quantity: '1', amount: '5200.00' },
        { title: 'Embroidered Velvet Blouse Piece', variant: 'Deep Plum / L', quantity: '1', amount: '1850.00' },
        { title: 'Silver Filigree Jhumka', variant: 'Oxidized Silver', quantity: '1', amount: '1250.00' },
        { title: 'Gift Wrap & Premium Box', variant: 'Signature Burgundy', quantity: '1', amount: '600.00' },
      ],
    },
  },
  'cancelled': {
    key: 'cancelled',
    label: 'Cancelled Order',
    description: 'Order cancelled prior to fulfillment',
    data: {
      display_name: 'Rafiqul Islam',
      order_number: 'MV-10252',
      currency_code: 'BDT',
      total_amount: '2200.00',
      delivery_address: 'Holding 34, Shahid Minar Road, Sylhet 3100',
      email: 'rafiq.islam@example.com',
      items: [
        { title: 'Pure Cotton Panjabi', variant: 'Sky Blue / XL', quantity: '1', amount: '2200.00' },
      ],
    },
  },
  'refunded': {
    key: 'refunded',
    label: 'Refund Completed Order',
    description: 'Order with returned items and completed refund settlement',
    data: {
      display_name: 'Mehzabin Chowdhury',
      order_number: 'MV-10253',
      currency_code: 'BDT',
      total_amount: '3450.00',
      delivery_address: 'House 8, Road 11, Uttara Sector 4, Dhaka 1230',
      email: 'mehzabin.c@example.com',
      items: [
        { title: 'Georgette Anarkali Gown', variant: 'Emerald / S', quantity: '1', amount: '3450.00' },
      ],
    },
  },
};

export async function previewOrderEmail(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    orderId?: string | undefined;
    fixtureKey?: string | undefined;
    notificationType: string;
    options: EmailRenderOptions;
  },
) {
  const selectedPolicy = await policy(db, input.organizationId, input.notificationType);
  if (!selectedPolicy?.template_key)
    throw new EmailNotificationError('VALIDATION_FAILED', 'This event has no transactional email template.');

  let orderData: {
    display_name: string;
    order_number: string;
    currency_code: string;
    total_amount: string;
    delivery_address: string | null;
    email: string | null;
    items: readonly { title: string; variant?: string | null; quantity: string; amount: string }[];
  };

  const activeFixtureKey = input.fixtureKey && sampleFixtures[input.fixtureKey] ? input.fixtureKey : 'multi-item';

  if (input.orderId && input.orderId.trim()) {
    const order = await orderEmailModel(db, input.organizationId, input.orderId.trim());
    orderData = {
      display_name: order.display_name,
      order_number: order.order_number,
      currency_code: order.currency_code,
      total_amount: order.total_amount,
      delivery_address: order.delivery_address,
      email: order.email,
      items: order.items,
    };
  } else {
    const fixture = sampleFixtures[activeFixtureKey] ?? sampleFixtures['multi-item']!;
    orderData = fixture.data;
  }

  const rendered = renderTransactionalEmail(selectedPolicy.template_key, {
    customerName: orderData.display_name,
    orderNumber: orderData.order_number,
    currencyCode: orderData.currency_code,
    totalAmount: orderData.total_amount,
    ...(orderData.delivery_address ? { deliveryAddress: orderData.delivery_address } : {}),
    trackingUrl: `${input.options.storefrontBaseUrl}/orders/track`,
    supportEmail: input.options.supportEmail,
    ...(input.options.environmentLabel
      ? { environmentLabel: input.options.environmentLabel }
      : {}),
    items: orderData.items.map((item) => ({
      title: item.title,
      ...(item.variant ? { variant: item.variant } : {}),
      quantity: item.quantity,
      amount: item.amount,
    })),
  });

  return {
    intendedRecipient: orderData.email,
    isSampleFixture: !input.orderId?.trim(),
    fixtureKey: activeFixtureKey,
    availableFixtures: Object.values(sampleFixtures).map((f) => ({
      key: f.key,
      label: f.label,
      description: f.description,
    })),
    ...rendered,
  };
}


export async function createManualOrderEmail(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    orderId: string;
    notificationType: string;
    actorId: string;
    idempotencyKey: string;
    reason: string;
    triggerType?: 'MANUAL' | 'TEST' | 'RESEND';
    recipientOverride?: string;
    parentNotificationId?: string;
    options: EmailRenderOptions;
  },
) {
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(input.idempotencyKey))
    throw new EmailNotificationError('VALIDATION_FAILED', 'A stable idempotency key is required.');
  if (!input.reason.trim())
    throw new EmailNotificationError('VALIDATION_FAILED', 'A send reason is required.');
  return db.transaction().execute(async (tx) => {
    const selectedPolicy = await policy(tx, input.organizationId, input.notificationType);
    if (!selectedPolicy?.enabled || !selectedPolicy.manual_allowed || !selectedPolicy.template_key)
      throw new EmailNotificationError('FORBIDDEN', 'Manual sending is not allowed for this event.');
    const order = await orderEmailModel(tx, input.organizationId, input.orderId);
    if (
      !(await manualEventEligible(
        tx,
        input.organizationId,
        order.id,
        input.notificationType,
        order.order_status,
      ))
    )
      throw new EmailNotificationError(
        'CONFLICT',
        'The order has not reached the business state required by this email.',
      );
    const recipient = input.recipientOverride?.trim().toLowerCase() || order.email?.trim().toLowerCase();
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
      throw new EmailNotificationError('VALIDATION_FAILED', 'The order has no usable email recipient.');
    const suppressed = await sql`select 1 from notifications.email_suppressions where organization_id=${input.organizationId} and normalized_email=${recipient} and active limit 1`.execute(tx);
    if (suppressed.rows[0] && input.triggerType !== 'TEST')
      throw new EmailNotificationError('CONFLICT', 'This recipient is suppressed.');
    const rendered = renderTransactionalEmail(selectedPolicy.template_key, {
      customerName: order.display_name,
      orderNumber: order.order_number,
      currencyCode: order.currency_code,
      totalAmount: order.total_amount,
      ...(order.delivery_address ? { deliveryAddress: order.delivery_address } : {}),
      trackingUrl: `${input.options.storefrontBaseUrl}/orders/track`,
      supportEmail: input.options.supportEmail,
      ...(input.options.environmentLabel ? { environmentLabel: input.options.environmentLabel } : {}),
      items: order.items.map((item) => ({
        title: item.title,
        ...(item.variant ? { variant: item.variant } : {}),
        quantity: item.quantity,
        amount: item.amount,
      })),
    });
    const logicalKey = `notification:manual:v1:${input.organizationId}:${input.notificationType}:${order.id}:${input.idempotencyKey}`;
    const inserted = await sql<{ id: string }>`insert into notifications.notifications(
      organization_id,notification_type,recipient_type,customer_id,channel,template_key,template_version,
      rendered_subject,rendered_body,rendered_html,intended_recipient,effective_recipient,sender_from,reply_to,status,trigger_type,
      triggered_by_actor_id,parent_notification_id,idempotency_key,queued_at,source_domain,source_id
    ) values(${input.organizationId},${input.notificationType},'CUSTOMER',${order.customer_id}::uuid,'EMAIL',${rendered.templateKey},${rendered.templateVersion},
      ${rendered.subject},${rendered.text},${rendered.html},${recipient},${recipient},${input.options.senderFrom ?? null},${input.options.supportEmail},'QUEUED',${input.triggerType ?? 'MANUAL'},
      ${input.actorId},${input.parentNotificationId ?? null}::uuid,${logicalKey},now(),'orders.order',${order.id}::uuid)
    on conflict(idempotency_key) do nothing returning id`.execute(tx);
    const notificationId = inserted.rows[0]?.id;
    if (!notificationId) {
      const existing = await sql<{ id: string }>`select id from notifications.notifications where idempotency_key=${logicalKey}`.execute(tx);
      return { id: existing.rows[0]!.id, created: false };
    }
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${input.organizationId},${notificationId}::uuid,'QUEUED','ADMIN',${JSON.stringify({ reason: input.reason.trim(), triggerType: input.triggerType ?? 'MANUAL' })}::jsonb)`.execute(tx);
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: `notifications.email.${(input.triggerType ?? 'MANUAL').toLowerCase()}_queued`,
      targetType: 'notifications.notification',
      targetId: notificationId,
      reason: input.reason.trim(),
      metadata: { notificationType: input.notificationType, orderId: input.orderId },
    });
    return { id: notificationId, created: true };
  });
}

export async function sendTestEmail(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    notificationType: string;
    actorId: string;
    orderId?: string | undefined;
    fixtureKey?: string | undefined;
    testRecipient: string;
    reason?: string | undefined;
    options: EmailRenderOptions;
  },
) {
  const recipient = input.testRecipient.trim().toLowerCase();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
    throw new EmailNotificationError('VALIDATION_FAILED', 'A valid test recipient email is required.');

  const selectedPolicy = await policy(db, input.organizationId, input.notificationType);
  if (!selectedPolicy?.template_key)
    throw new EmailNotificationError('VALIDATION_FAILED', 'This event has no transactional email template.');

  let orderData: {
    display_name: string;
    order_number: string;
    currency_code: string;
    total_amount: string;
    delivery_address: string | null;
    items: readonly { title: string; variant?: string | null; quantity: string; amount: string }[];
    customerId?: string;
    orderId?: string;
  };

  if (input.orderId?.trim()) {
    const order = await orderEmailModel(db, input.organizationId, input.orderId.trim());
    orderData = {
      display_name: order.display_name,
      order_number: order.order_number,
      currency_code: order.currency_code,
      total_amount: order.total_amount,
      delivery_address: order.delivery_address,
      items: order.items,
      customerId: order.customer_id,
      orderId: order.id,
    };
  } else {
    const fixture = sampleFixtures[input.fixtureKey ?? 'multi-item'] ?? sampleFixtures['multi-item']!;
    orderData = fixture.data;
  }

  const rendered = renderTransactionalEmail(selectedPolicy.template_key, {
    customerName: orderData.display_name,
    orderNumber: orderData.order_number,
    currencyCode: orderData.currency_code,
    totalAmount: orderData.total_amount,
    ...(orderData.delivery_address ? { deliveryAddress: orderData.delivery_address } : {}),
    trackingUrl: `${input.options.storefrontBaseUrl}/orders/track`,
    supportEmail: input.options.supportEmail,
    ...(input.options.environmentLabel ? { environmentLabel: input.options.environmentLabel } : { environmentLabel: 'TEST' }),
    items: orderData.items.map((item) => ({
      title: item.title,
      ...(item.variant ? { variant: item.variant } : {}),
      quantity: item.quantity,
      amount: item.amount,
    })),
  });

  const testKey = `notification:test:v1:${input.organizationId}:${input.notificationType}:${crypto.randomUUID()}`;
  return db.transaction().execute(async (tx) => {
    let customerId = orderData.customerId;
    if (!customerId) {
      const defaultCustomer = await sql<{ id: string }>`select id from customers.customers where organization_id=${input.organizationId} order by created_at asc limit 1`.execute(tx);
      customerId = defaultCustomer.rows[0]?.id;
    }
    if (!customerId) {
      throw new EmailNotificationError('CONFLICT', 'An organization customer is required to anchor transactional notifications.');
    }

    const sourceId = orderData.orderId ?? crypto.randomUUID();
    const inserted = await sql<{ id: string }>`insert into notifications.notifications(
      organization_id,notification_type,recipient_type,customer_id,channel,template_key,template_version,
      rendered_subject,rendered_body,rendered_html,intended_recipient,effective_recipient,sender_from,reply_to,status,trigger_type,
      triggered_by_actor_id,idempotency_key,queued_at,source_domain,source_id
    ) values(${input.organizationId},${input.notificationType},'CUSTOMER',${customerId}::uuid,'EMAIL',${rendered.templateKey},${rendered.templateVersion},
      ${rendered.subject},${rendered.text},${rendered.html},${recipient},${recipient},${input.options.senderFrom ?? null},${input.options.supportEmail},'QUEUED','TEST',
      ${input.actorId},${testKey},now(),${orderData.orderId ? 'orders.order' : 'email.test_lab'},${sourceId}::uuid)
    returning id`.execute(tx);

    const notificationId = inserted.rows[0]!.id;
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${input.organizationId},${notificationId}::uuid,'QUEUED','ADMIN',${JSON.stringify({ reason: input.reason?.trim() ?? 'Test send from Email Operations Test Lab', triggerType: 'TEST', testRecipient: recipient })}::jsonb)`.execute(tx);

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'notifications.email.test_queued',
      targetType: 'notifications.notification',
      targetId: notificationId,
      reason: input.reason?.trim() ?? 'Test email sent from Test Lab',
      metadata: { notificationType: input.notificationType, recipient },
    });

    return { id: notificationId, created: true, recipient };
  });
}

export async function getOrderEmailEligibility(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; orderId: string; globalEnabled?: boolean },
) {
  const order = await orderEmailModel(db, input.organizationId, input.orderId);
  const policies = await listEmailPolicies(db, input.organizationId);
  const policyMap = new Map((policies as any[]).map((p) => [p.notification_type, p]));

  const recipient = order.email?.trim().toLowerCase() ?? null;
  let isSuppressed = false;
  let suppressionReason: string | null = null;
  if (recipient) {
    const sup = await sql<{ reason: string }>`select reason from notifications.email_suppressions where organization_id=${input.organizationId} and normalized_email=${recipient} and active limit 1`.execute(db);
    if (sup.rows[0]) {
      isSuppressed = true;
      suppressionReason = sup.rows[0].reason;
    }
  }

  const existingNotifications = await sql<Record<string, any>>`select n.*
    from notifications.notifications n
    where n.organization_id=${input.organizationId} and n.source_id=${order.id}::uuid and n.channel='EMAIL'
    order by n.created_at desc`.execute(db);

  const notificationsByType = new Map<string, any>();
  for (const n of existingNotifications.rows) {
    if (!notificationsByType.has(n.notification_type)) {
      notificationsByType.set(n.notification_type, n);
    }
  }

  const expectedLifecycleEvents = [
    {
      notificationType: 'ORDER_PLACED',
      templateKey: 'order-received',
      label: 'Order Received',
      description: 'Sent immediately when an order is placed and awaiting review/confirmation.',
    },
    {
      notificationType: 'ORDER_CONFIRMED',
      templateKey: 'order-confirmed',
      label: 'Order Confirmed',
      description: 'Sent when the order is verified and confirmed for preparation.',
    },
    {
      notificationType: 'PAYMENT_VERIFIED',
      templateKey: 'payment-confirmed',
      label: 'Payment Confirmed',
      description: 'Sent when payment has been collected and verified.',
    },
    {
      notificationType: 'ORDER_DISPATCHED',
      templateKey: 'order-shipped',
      label: 'Order Shipped / Dispatched',
      description: 'Sent when parcel is handed over to the courier partner with tracking.',
    },
    {
      notificationType: 'DELIVERY_COMPLETED',
      templateKey: 'order-delivered',
      label: 'Order Delivered',
      description: 'Sent when courier confirms the customer received the parcel.',
    },
    {
      notificationType: 'ORDER_CANCELLED',
      templateKey: 'order-cancelled',
      label: 'Order Cancelled',
      description: 'Sent when an order is cancelled before fulfillment or completion.',
    },
    {
      notificationType: 'REFUND_COMPLETED',
      templateKey: 'refund-completed',
      label: 'Refund Completed',
      description: 'Sent when customer refund has been processed and settled.',
    },
  ];

  const events = await Promise.all(
    expectedLifecycleEvents.map(async (ev) => {
      const p = policyMap.get(ev.notificationType) ?? {
        enabled: true,
        automatic_enabled: true,
        manual_allowed: true,
      };
      const orderReachedState = await manualEventEligible(
        db,
        input.organizationId,
        order.id,
        ev.notificationType,
        order.order_status,
      );
      const latest = notificationsByType.get(ev.notificationType) ?? null;

      let eligibilityCode = 'READY_TO_SEND';
      let explanation = 'Eligible for manual send.';

      if (latest) {
        if (latest.status === 'DELIVERED') {
          eligibilityCode = 'DELIVERED';
          explanation = `Delivered to ${latest.intended_recipient ?? 'customer'} on ${new Date(latest.delivered_at ?? latest.updated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`;
        } else if (latest.status === 'SENT') {
          eligibilityCode = 'ACCEPTED';
          explanation = `Accepted by email provider; awaiting delivery confirmation.`;
        } else if (['QUEUED', 'PROCESSING'].includes(latest.status)) {
          eligibilityCode = 'QUEUED';
          explanation = `Currently queued in delivery worker; will be sent shortly.`;
        } else if (latest.status === 'FAILED') {
          eligibilityCode = 'FAILED';
          explanation = `Previous attempt failed (${latest.failure_code ?? 'Technical error'}). Retry or re-send available.`;
        } else if (latest.status === 'PENDING_MANUAL') {
          eligibilityCode = 'READY_TO_SEND';
          explanation = `Automatic sending disabled by policy. Manual send is available.`;
        } else if (latest.status === 'SKIPPED_NO_EMAIL') {
          eligibilityCode = 'CUSTOMER_EMAIL_MISSING';
          explanation = `Customer did not have an email address when event occurred.`;
        }
      } else {
        if (!recipient) {
          eligibilityCode = 'CUSTOMER_EMAIL_MISSING';
          explanation = 'Customer has no email address on file. Transactional emails are skipped without blocking the order.';
        } else if (isSuppressed) {
          eligibilityCode = 'RECIPIENT_SUPPRESSED';
          explanation = `Recipient address is suppressed (${suppressionReason?.replaceAll('_', ' ').toLowerCase() ?? 'blocked'}). Automatic delivery is stopped to protect sender reputation.`;
        } else if (!p.enabled) {
          eligibilityCode = 'POLICY_DISABLED';
          explanation = 'Email delivery for this event is disabled by organization policy.';
        } else if (!p.manual_allowed) {
          eligibilityCode = 'MANUAL_SEND_FORBIDDEN';
          explanation = 'Manual sending is not allowed for this event policy.';
        } else if (!orderReachedState) {
          eligibilityCode = 'WAITING_FOR_ORDER_STATE';
          explanation = `Order has not reached the required business state for ${ev.label}. Current status: ${order.order_status}.`;
        } else {
          eligibilityCode = 'READY_TO_SEND';
          explanation = `Ready to send. Recipient: ${recipient}.`;
        }
      }

      const canSendManually =
        Boolean(recipient) &&
        !isSuppressed &&
        p.enabled &&
        p.manual_allowed &&
        orderReachedState &&
        (!latest || !['QUEUED', 'PROCESSING'].includes(latest.status));

      return {
        notificationType: ev.notificationType,
        templateKey: ev.templateKey,
        label: ev.label,
        description: ev.description,
        policy: {
          enabled: Boolean(p.enabled),
          automaticEnabled: Boolean(p.automatic_enabled),
          manualAllowed: Boolean(p.manual_allowed),
        },
        orderReachedState,
        canSendManually,
        eligibilityCode,
        explanation,
        latestNotification: latest
          ? {
              id: latest.id,
              notification_type: latest.notification_type,
              status: latest.status,
              intended_recipient: latest.intended_recipient,
              effective_recipient: latest.effective_recipient,
              rendered_subject: latest.rendered_subject,
              source_id: latest.source_id,
              source_domain: latest.source_domain,
              provider: latest.provider,
              provider_message_id: latest.provider_message_id,
              trigger_type: latest.trigger_type,
              created_at: latest.created_at,
              skip_reason: latest.skip_reason,
              failure_code: latest.failure_code,
              failure_message: latest.failure_message,
            }
          : null,
      };
    }),
  );

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    orderStatus: order.order_status,
    customerEmail: recipient,
    isSuppressed,
    suppressionReason,
    globalEmailEnabled: input.globalEnabled ?? true,
    events,
  };
}


export async function retryEmailNotification(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; notificationId: string; actorId: string; reason: string },
) {
  if (!input.reason.trim())
    throw new EmailNotificationError('VALIDATION_FAILED', 'A retry reason is required.');
  await db.transaction().execute(async (tx) => {
    const updated = await sql<{ id: string }>`update notifications.notifications set status='QUEUED',failure_code=null,failure_message=null,queued_at=now(),updated_at=now() where organization_id=${input.organizationId} and id=${input.notificationId}::uuid and channel='EMAIL' and status='FAILED' returning id`.execute(tx);
    if (!updated.rows[0])
      throw new EmailNotificationError('CONFLICT', 'Only a failed email can be retried.');
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${input.organizationId},${input.notificationId}::uuid,'RETRY_REQUESTED','ADMIN',${JSON.stringify({ reason: input.reason.trim() })}::jsonb)`.execute(tx);
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'notifications.email.retry_requested',
      targetType: 'notifications.notification',
      targetId: input.notificationId,
      reason: input.reason.trim(),
    });
  });
}

export async function listEmailNotifications(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    page: number;
    pageSize: number;
    status?: string;
    notificationType?: string;
    search?: string;
    sourceId?: string;
    customerId?: string;
    recipient?: string;
    triggerType?: string;
    provider?: string;
    createdAfter?: string;
    createdBefore?: string;
  },
) {
  const offset = (input.page - 1) * input.pageSize;
  const search = input.search?.trim() ? `%${input.search.trim()}%` : null;
  const rows = await sql<Record<string, unknown> & { total_count: string }>`select n.*,count(*) over()::text total_count
    from notifications.notifications n
    where n.organization_id=${input.organizationId} and n.channel='EMAIL'
      and (${input.status ?? null}::text is null or n.status=${input.status ?? null})
      and (${input.notificationType ?? null}::text is null or n.notification_type=${input.notificationType ?? null})
      and (${input.sourceId ?? null}::uuid is null or n.source_id=${input.sourceId ?? null}::uuid)
      and (${input.customerId ?? null}::uuid is null or n.customer_id=${input.customerId ?? null}::uuid)
      and (${input.recipient ?? null}::text is null or lower(n.intended_recipient)=lower(${input.recipient ?? null}))
      and (${input.triggerType ?? null}::text is null or n.trigger_type=${input.triggerType ?? null})
      and (${input.provider ?? null}::text is null or n.provider=${input.provider ?? null})
      and (${input.createdAfter ?? null}::timestamptz is null or n.created_at>=${input.createdAfter ?? null}::timestamptz)
      and (${input.createdBefore ?? null}::timestamptz is null or n.created_at<${input.createdBefore ?? null}::timestamptz)
      and (${search}::text is null or n.rendered_subject ilike ${search} or n.intended_recipient ilike ${search})
    order by n.created_at desc,n.id desc limit ${input.pageSize} offset ${offset}`.execute(db);
  const totalItems = Number(rows.rows[0]?.total_count ?? 0);
  return {
    data: rows.rows.map((source) => {
      const row = { ...source };
      Reflect.deleteProperty(row, 'total_count');
      Reflect.deleteProperty(row, 'rendered_html');
      return row;
    }),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / input.pageSize),
    },
  };
}

export async function getEmailNotification(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  notificationId: string,
): Promise<Record<string, any>> {
  const row = await sql<Record<string, any>>`select n.*,
      u.name triggered_by_actor_name,
      coalesce((select jsonb_agg(to_jsonb(a) order by a.attempt_number) from notifications.delivery_attempts a where a.notification_id=n.id),'[]'::jsonb) attempts,
      coalesce((select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'event_type', e.event_type,
          'event_at', e.event_at,
          'source', e.source,
          'provider_event_id', e.provider_event_id,
          'metadata', e.metadata
        ) order by e.event_at, e.id) from notifications.delivery_events e where e.notification_id=n.id),'[]'::jsonb) timeline
    from notifications.notifications n
    left join iam.users u on u.id = n.triggered_by_actor_id
    where n.organization_id=${organizationId} and n.id=${notificationId}::uuid and n.channel='EMAIL'`.execute(db);
  if (!row.rows[0]) throw new EmailNotificationError('NOT_FOUND', 'Email notification was not found.');
  const n = row.rows[0];
  const recipient = (n.intended_recipient ?? n.effective_recipient)?.toLowerCase();
  let recipientSuppressed = false;
  if (recipient) {
    const sup = await sql`select 1 from notifications.email_suppressions where organization_id=${organizationId} and normalized_email=${recipient} and active limit 1`.execute(db);
    recipientSuppressed = Boolean(sup.rows[0]);
  }
  const canRetry = n.status === 'FAILED';
  const canResend = ['DELIVERED', 'SENT', 'FAILED', 'BOUNCED'].includes(n.status) && Boolean(n.intended_recipient);
  const canPreview = Boolean(n.rendered_html);
  return {
    ...n,
    recipientSuppressed,
    availableActions: {
      canRetry,
      canResend,
      canPreview,
      retryReason: canRetry ? 'Retry this notification after a technical failure.' : 'Only failed notifications can be retried.',
      resendReason: canResend ? 'Send a new audited copy of this email to the customer.' : 'Resend requires an intended recipient and non-pending status.',
    },
  };
}

export async function listEmailSuppressions(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select id,normalized_email,reason,source,provider,active,created_at::text,cleared_at::text,clear_reason from notifications.email_suppressions where organization_id=${organizationId} order by active desc,created_at desc limit 200`.execute(db)
  ).rows;
}

export async function setEmailSuppression(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    email: string;
    active: boolean;
    actorId: string;
    reason: string;
  },
) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@') || !input.reason.trim())
    throw new EmailNotificationError('VALIDATION_FAILED', 'Email and reason are required.');
  await db.transaction().execute(async (tx) => {
    if (input.active)
      await sql`insert into notifications.email_suppressions(organization_id,normalized_email,reason,source,active) values(${input.organizationId},${email},'ADMINISTRATOR','ADMIN',true) on conflict(organization_id,normalized_email,reason) do update set active=true,cleared_at=null,cleared_by_actor_id=null,clear_reason=null`.execute(tx);
    else
      await sql`update notifications.email_suppressions set active=false,cleared_at=now(),cleared_by_actor_id=${input.actorId},clear_reason=${input.reason.trim()} where organization_id=${input.organizationId} and normalized_email=${email} and active`.execute(tx);
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: input.active
        ? 'notifications.email_suppression.created'
        : 'notifications.email_suppression.cleared',
      targetType: 'notifications.email_suppression',
      reason: input.reason.trim(),
      metadata: { emailHash: createHash('sha256').update(email).digest('hex') },
    });
  });
}

const providerStatus: Record<string, string> = {
  'email.sent': 'SENT',
  'email.delivered': 'DELIVERED',
  'email.delivery_delayed': 'DELIVERY_DELAYED',
  'email.bounced': 'BOUNCED',
  'email.complained': 'COMPLAINED',
  'email.failed': 'FAILED',
  'email.suppressed': 'SUPPRESSED',
  'email.opened': 'OPENED',
  'email.clicked': 'CLICKED',
};

export async function ingestResendWebhook(
  db: Kysely<DatabaseSchema>,
  input: {
    providerEventId: string;
    type: string;
    createdAt?: string;
    data: Record<string, unknown>;
    rawPayload: Record<string, unknown>;
  },
) {
  const normalized = providerStatus[input.type] ?? 'IGNORED';
  const providerMessageId = typeof input.data.email_id === 'string' ? input.data.email_id : null;
  const recipient = Array.isArray(input.data.to) && typeof input.data.to[0] === 'string' ? input.data.to[0].toLowerCase() : null;
  return db.transaction().execute(async (tx) => {
    const event = await sql<{ id: string }>`insert into notifications.provider_events(provider,provider_event_id,provider_message_id,event_type,normalized_type,recipient,payload,provider_occurred_at)
      values('resend',${input.providerEventId},${providerMessageId},${input.type},${normalized},${recipient},${JSON.stringify(input.rawPayload)}::jsonb,${input.createdAt ? new Date(input.createdAt) : null})
      on conflict(provider,provider_event_id) do nothing returning id::text`.execute(tx);
    if (!event.rows[0]) return { created: false, processed: false };
    if (!providerMessageId || normalized === 'IGNORED') {
      await sql`update notifications.provider_events set processed_at=now(),processing_result='IGNORED' where id=${Number(event.rows[0]!.id)}`.execute(tx);
      return { created: true, processed: false };
    }
    const notification = await sql<{ id: string; organization_id: string; status: string; intended_recipient: string | null }>`select id,organization_id,status,intended_recipient from notifications.notifications where provider='resend' and provider_message_id=${providerMessageId} for update`.execute(tx);
    const target = notification.rows[0];
    if (!target) {
      await sql`update notifications.provider_events set processed_at=now(),processing_result='UNMATCHED_MESSAGE' where id=${Number(event.rows[0]!.id)}`.execute(tx);
      return { created: true, processed: false };
    }
    const terminal = ['BOUNCED', 'COMPLAINED', 'SUPPRESSED'].includes(target.status);
    const shouldUpdate = !terminal && !(target.status === 'DELIVERED' && ['SENT', 'DELIVERY_DELAYED', 'FAILED'].includes(normalized));
    if (shouldUpdate && !['OPENED', 'CLICKED'].includes(normalized)) {
      await sql`update notifications.notifications set status=${normalized},delivered_at=case when ${normalized}='DELIVERED' then coalesce(delivered_at,now()) else delivered_at end,failure_code=case when ${normalized} in ('FAILED','BOUNCED','COMPLAINED','SUPPRESSED') then ${input.type} else failure_code end,updated_at=now() where id=${target.id}::uuid`.execute(tx);
    }
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,event_at,source,provider_event_id,metadata) values(${target.organization_id},${target.id}::uuid,${normalized},${input.createdAt ? new Date(input.createdAt) : new Date()},'PROVIDER',${input.providerEventId},${JSON.stringify({ providerType: input.type })}::jsonb)`.execute(tx);
    const bounce = input.data.bounce as { type?: unknown } | undefined;
    const shouldSuppress =
      normalized === 'COMPLAINED' ||
      normalized === 'SUPPRESSED' ||
      (normalized === 'BOUNCED' && bounce?.type === 'Permanent');
    if (recipient && shouldSuppress) {
      const reason = normalized === 'BOUNCED' ? 'HARD_BOUNCE' : normalized === 'COMPLAINED' ? 'COMPLAINT' : 'PROVIDER';
      await sql`insert into notifications.email_suppressions(organization_id,normalized_email,reason,source,provider,active) values(${target.organization_id},${recipient},${reason},'WEBHOOK','resend',true) on conflict(organization_id,normalized_email,reason) do update set active=true,cleared_at=null`.execute(tx);
    }
    await sql`update notifications.provider_events set processed_at=now(),processing_result='PROCESSED' where id=${Number(event.rows[0]!.id)}`.execute(tx);
    return { created: true, processed: true, notificationId: target.id };
  });
}

export async function emailOperationalSummary(db: Kysely<DatabaseSchema>, organizationId: string) {
  const result = await sql<{
    queued: number;
    processing: number;
    failed: number;
    delivered: number;
    suppressed: number;
    last_webhook_at: string | null;
    oldest_queued_at: string | null;
    today_created: number;
    today_queued: number;
    today_sent: number;
    today_delivered: number;
    today_failed: number;
    today_bounced: number;
    today_complained: number;
    today_suppressed: number;
    last_7_days_total: number;
    last_7_days_delivered: number;
    last_7_days_failed: number;
    top_failure_code: string | null;
    top_failure_count: number | null;
  }>`select
      count(*) filter(where status='QUEUED')::int queued,
      count(*) filter(where status='PROCESSING')::int processing,
      count(*) filter(where status='FAILED')::int failed,
      count(*) filter(where status='DELIVERED')::int delivered,
      count(*) filter(where status in ('SUPPRESSED','BOUNCED','COMPLAINED'))::int suppressed,
      (select max(event.received_at)::text from notifications.provider_events event join notifications.notifications notification on notification.provider_message_id=event.provider_message_id where notification.organization_id=${organizationId}) last_webhook_at,
      min(queued_at) filter(where status in ('QUEUED','PROCESSING'))::text oldest_queued_at,
      count(*) filter(where created_at >= date_trunc('day', now()))::int today_created,
      count(*) filter(where created_at >= date_trunc('day', now()) and status='QUEUED')::int today_queued,
      count(*) filter(where created_at >= date_trunc('day', now()) and status='SENT')::int today_sent,
      count(*) filter(where created_at >= date_trunc('day', now()) and status='DELIVERED')::int today_delivered,
      count(*) filter(where created_at >= date_trunc('day', now()) and status='FAILED')::int today_failed,
      count(*) filter(where created_at >= date_trunc('day', now()) and status='BOUNCED')::int today_bounced,
      count(*) filter(where created_at >= date_trunc('day', now()) and status='COMPLAINED')::int today_complained,
      count(*) filter(where created_at >= date_trunc('day', now()) and status='SUPPRESSED')::int today_suppressed,
      count(*) filter(where created_at >= now() - interval '7 days')::int last_7_days_total,
      count(*) filter(where created_at >= now() - interval '7 days' and status='DELIVERED')::int last_7_days_delivered,
      count(*) filter(where created_at >= now() - interval '7 days' and status in ('FAILED','BOUNCED'))::int last_7_days_failed,
      (select failure_code from notifications.notifications where organization_id=${organizationId} and status='FAILED' and failure_code is not null group by failure_code order by count(*) desc limit 1) top_failure_code,
      (select count(*)::int from notifications.notifications where organization_id=${organizationId} and status='FAILED' and failure_code is not null group by failure_code order by count(*) desc limit 1) top_failure_count
    from notifications.notifications where organization_id=${organizationId} and channel='EMAIL'`.execute(db);

  const row = result.rows[0]!;

  let workerStatus: 'HEALTHY' | 'BACKLOG' | 'DEGRADED' | 'IDLE' = 'IDLE';
  if (row.oldest_queued_at) {
    const ageMs = Date.now() - new Date(row.oldest_queued_at).getTime();
    if (ageMs > 5 * 60_000) {
      workerStatus = 'BACKLOG';
    } else {
      workerStatus = 'HEALTHY';
    }
  } else if (row.failed > 0 && row.last_7_days_failed > row.last_7_days_delivered) {
    workerStatus = 'DEGRADED';
  } else if (row.delivered > 0 || row.processing > 0) {
    workerStatus = 'HEALTHY';
  }

  const successRate =
    row.last_7_days_total > 0
      ? Math.round((row.last_7_days_delivered / row.last_7_days_total) * 100)
      : null;

  return {
    queued: row.queued,
    processing: row.processing,
    failed: row.failed,
    delivered: row.delivered,
    suppressed: row.suppressed,
    last_webhook_at: row.last_webhook_at,
    oldest_queued_at: row.oldest_queued_at,
    worker_status: workerStatus,
    top_failure_reason: row.top_failure_code
      ? { code: row.top_failure_code, count: row.top_failure_count ?? 1 }
      : null,
    today: {
      created: row.today_created,
      queued: row.today_queued,
      sent: row.today_sent,
      delivered: row.today_delivered,
      failed: row.today_failed,
      bounced: row.today_bounced,
      complained: row.today_complained,
      suppressed: row.today_suppressed,
    },
    last_7_days: {
      total: row.last_7_days_total,
      delivered: row.last_7_days_delivered,
      failed: row.last_7_days_failed,
      success_rate: successRate,
    },
  };
}
