export type NotificationCategory =
  'TRANSACTIONAL' | 'OPERATIONAL' | 'SECURITY' | 'MARKETING' | 'SYSTEM';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface CustomerNotificationEventDefinition {
  readonly audience: 'CUSTOMER';
  readonly eventType: string;
  readonly notificationType: string;
  readonly category: NotificationCategory;
  readonly priority: NotificationPriority;
  readonly required: boolean;
}

export interface StaffNotificationEventDefinition {
  readonly audience: 'STAFF';
  readonly eventType: string;
  readonly notificationType: string;
  readonly category: NotificationCategory;
  readonly priority: NotificationPriority;
  readonly requiredCapability: string;
  readonly title: string;
  readonly body: string;
  readonly actionPath: (aggregateId: string, payload: Record<string, unknown>) => string;
}

export type NotificationEventDefinition =
  CustomerNotificationEventDefinition | StaffNotificationEventDefinition;

const customer = (
  eventType: string,
  notificationType: string,
  required: boolean,
  priority: NotificationPriority = 'NORMAL',
): CustomerNotificationEventDefinition => ({
  audience: 'CUSTOMER',
  eventType,
  notificationType,
  category: 'TRANSACTIONAL',
  priority,
  required,
});

const staff = (
  eventType: string,
  notificationType: string,
  requiredCapability: string,
  title: string,
  body: string,
  actionPath: StaffNotificationEventDefinition['actionPath'],
  priority: NotificationPriority = 'NORMAL',
  category: NotificationCategory = 'OPERATIONAL',
): StaffNotificationEventDefinition => ({
  audience: 'STAFF',
  eventType,
  notificationType,
  category,
  priority,
  requiredCapability,
  title,
  body,
  actionPath,
});

const payloadId = (payload: Record<string, unknown>, key: string, fallback: string): string =>
  typeof payload[key] === 'string' ? payload[key] : fallback;

/**
 * Central catalog for business events that genuinely require communication.
 * Domain modules remain authoritative; this catalog only defines audiences and
 * presentation policy for facts that have already committed to the outbox.
 */
export const notificationEventCatalog: readonly NotificationEventDefinition[] = [
  customer('orders.order.placed', 'ORDER_PLACED', true),
  customer('orders.order.confirmed', 'ORDER_CONFIRMED', true),
  // Order completion is derived from delivery completion. Customer delivery
  // messaging is emitted only from the authoritative delivery event to avoid
  // duplicate whole-order emails for the same physical outcome.
  customer('orders.order.cancelled', 'ORDER_CANCELLED', false),
  customer('payments.payment.verified', 'PAYMENT_VERIFIED', true),
  customer('fulfillment.dispatched', 'ORDER_DISPATCHED', true),
  customer('delivery.all_lines_delivered', 'DELIVERY_COMPLETED', true),
  customer('delivery.attempt_failed', 'DELIVERY_ATTEMPT_FAILED', false),
  customer('delivery.failed', 'DELIVERY_FAILED', true, 'HIGH'),
  customer('rto.initiated', 'DELIVERY_RTO_INITIATED', true, 'HIGH'),
  customer('returns.authorized', 'RETURN_AUTHORIZED', true),
  customer('returns.rejected', 'RETURN_REJECTED', true),
  customer('returns.received', 'RETURN_RECEIVED', true),
  customer('payments.refund.completed', 'REFUND_COMPLETED', true),
  customer('reviews.review.approved', 'REVIEW_VISIBLE', false),
  customer('reviews.invitation.dispatched', 'REVIEW_REQUEST', false),
  customer('reviews.merchant_response.upserted', 'REVIEW_RESPONSE', false),

  staff(
    'integrity.critical_finding.detected',
    'CRITICAL_INTEGRITY_FINDING',
    'admin.integrity.view',
    'Critical integrity finding detected',
    'A high-impact consistency issue requires authorized investigation. Sensitive evidence is available only in System Integrity.',
    (id, payload) => `/integrity?findingId=${payloadId(payload, 'findingId', id)}`,
    'CRITICAL',
    'SYSTEM',
  ),
  staff(
    'orders.order.placed',
    'ORDER_AWAITING_REVIEW',
    'orders.view',
    'New order awaiting review',
    'A new order was received and is ready for operational review.',
    (id, payload) => `/orders/${payloadId(payload, 'orderId', id)}`,
    'HIGH',
  ),
  staff(
    'payments.payment_attempt.submitted',
    'PAYMENT_REVIEW_REQUIRED',
    'payments.verify',
    'Payment proof requires review',
    'A customer submitted payment evidence that requires an authorized decision.',
    (_id, payload) => `/orders/${payloadId(payload, 'orderId', '')}`,
    'HIGH',
  ),
  staff(
    'delivery.attempt_failed',
    'DELIVERY_EXCEPTION_REQUIRES_ATTENTION',
    'delivery.view',
    'Delivery attempt failed',
    'A delivery attempt failed and may require customer or courier follow-up.',
    (id) => `/delivery/${id}`,
    'HIGH',
  ),
  staff(
    'delivery.failed',
    'DELIVERY_FAILED_REQUIRES_ATTENTION',
    'delivery.view',
    'Delivery failed',
    'A delivery entered a failed state and requires operational review.',
    (id) => `/delivery/${id}`,
    'HIGH',
  ),
  staff(
    'reviews.review.submitted',
    'REVIEW_MODERATION_REQUIRED',
    'reviews.moderate',
    'Review awaiting moderation',
    'A customer review is ready for moderation.',
    (id, payload) => `/reviews?reviewId=${payloadId(payload, 'reviewId', id)}`,
  ),
  staff(
    'reviews.review.revision_submitted',
    'REVIEW_MODERATION_REQUIRED',
    'reviews.moderate',
    'Review revision awaiting moderation',
    'A customer edited a review and the new revision is ready for moderation.',
    (id, payload) => `/reviews?reviewId=${payloadId(payload, 'reviewId', id)}`,
  ),
  staff(
    'inventory.stocktake.submitted_for_review',
    'STOCKTAKE_REVIEW_REQUIRED',
    'inventory.stocktake',
    'Stocktake awaiting review',
    'A stocktake was submitted and requires an authorized review.',
    (id) => `/inventory/stocktakes/${id}`,
    'HIGH',
  ),
  staff(
    'warehouse.transfer.ready',
    'TRANSFER_READY_FOR_DISPATCH',
    'inventory.transfer',
    'Transfer ready for dispatch',
    'An inventory transfer is ready for the next operational step.',
    (id) => `/inventory/transfers/${id}`,
  ),
  staff(
    'inbound_shipment.arrived',
    'INBOUND_SHIPMENT_ARRIVED',
    'procurement.view',
    'Inbound shipment arrived',
    'An inbound shipment arrived and receiving work can begin.',
    (id) => `/supply/inbound-shipments/${id}`,
  ),
  staff(
    'receiving.condition_resolved',
    'RECEIVING_CONDITION_RESOLVED',
    'procurement.view',
    'Receiving condition resolved',
    'A receiving exception was resolved and its downstream work can continue.',
    (id) => `/supply/receiving/${id}`,
  ),
  staff(
    'finance.reconciliation.created',
    'FINANCE_RECONCILIATION_REQUIRES_ATTENTION',
    'finance.reconciliation.view',
    'Finance reconciliation requires attention',
    'A reconciliation session contains an operational result that should be reviewed.',
    (id) => `/finance/reconciliation/${id}`,
    'HIGH',
  ),
  staff(
    'iam.two_factor.admin_reset',
    'SECURITY_TWO_FACTOR_RESET',
    'admin.team.two_factor.reset',
    'Authenticator access was reset',
    'An administrator reset a team member authenticator enrollment. Review the audit trail if unexpected.',
    (id) => `/team?membershipId=${id}`,
    'CRITICAL',
    'SECURITY',
  ),
  staff(
    'iam.organization.owner_transferred',
    'SECURITY_OWNER_TRANSFERRED',
    'admin.team.owner.transfer',
    'Organization ownership changed',
    'Organization ownership was transferred. Review the protected audit trail if unexpected.',
    (id) => `/team?membershipId=${id}`,
    'CRITICAL',
    'SECURITY',
  ),
] as const;

export function notificationDefinitionsFor(
  eventType: string,
): readonly NotificationEventDefinition[] {
  return notificationEventCatalog.filter((definition) => definition.eventType === eventType);
}

export function customerDefinitionFor(
  eventType: string,
): CustomerNotificationEventDefinition | undefined {
  return notificationEventCatalog.find(
    (definition): definition is CustomerNotificationEventDefinition =>
      definition.eventType === eventType && definition.audience === 'CUSTOMER',
  );
}
