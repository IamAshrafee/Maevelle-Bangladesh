import type {
  EmailNotificationStatus,
  EmailTriggerType,
  EmailNotificationRowDto,
  EmailNotificationDetailDto,
  EmailDeliveryAttemptDto,
  EmailTimelineEventDto,
  EmailPolicyDto,
  EmailSuppressionDto,
  EmailDiagnosticsDto,
  OrderEmailEligibilityDto,
  OrderEmailEventEligibilityDto,
} from '@maevelle/contracts';

export type {
  EmailNotificationStatus,
  EmailTriggerType,
  EmailNotificationRowDto,
  EmailNotificationDetailDto,
  EmailDeliveryAttemptDto,
  EmailTimelineEventDto,
  EmailPolicyDto,
  EmailSuppressionDto,
  EmailDiagnosticsDto,
  OrderEmailEligibilityDto,
  OrderEmailEventEligibilityDto,
};

export type EmailTabKey =
  | 'overview'
  | 'activity'
  | 'templates'
  | 'test-lab'
  | 'policies'
  | 'suppressions'
  | 'diagnostics'
  | 'settings';

export interface EmailTemplateSummary {
  readonly key: string;
  readonly version: number;
  readonly subject: string;
  readonly description: string;
}

export interface SampleFixtureOption {
  readonly key: string;
  readonly label: string;
  readonly description: string;
}

export interface EmailPreviewResponse {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly intendedRecipient: string | null;
  readonly isSampleFixture: boolean;
  readonly fixtureKey?: string;
  readonly availableFixtures?: readonly SampleFixtureOption[];
}

export const templateKeyToEventMap: Record<string, string> = {
  'order-received': 'ORDER_PLACED',
  'order-confirmed': 'ORDER_CONFIRMED',
  'payment-confirmed': 'PAYMENT_VERIFIED',
  'order-shipped': 'ORDER_DISPATCHED',
  'order-delivered': 'DELIVERY_COMPLETED',
  'order-cancelled': 'ORDER_CANCELLED',
  'refund-completed': 'REFUND_COMPLETED',
};

export const eventToTemplateKeyMap: Record<string, string> = {
  ORDER_PLACED: 'order-received',
  ORDER_CONFIRMED: 'order-confirmed',
  PAYMENT_VERIFIED: 'payment-confirmed',
  ORDER_DISPATCHED: 'order-shipped',
  DELIVERY_COMPLETED: 'order-delivered',
  ORDER_CANCELLED: 'order-cancelled',
  REFUND_COMPLETED: 'refund-completed',
};

export const eventDisplayLabels: Record<string, string> = {
  ORDER_PLACED: 'Order Received',
  ORDER_CONFIRMED: 'Order Confirmed',
  PAYMENT_VERIFIED: 'Payment Confirmed',
  ORDER_DISPATCHED: 'Order Dispatched / Shipped',
  DELIVERY_COMPLETED: 'Order Delivered',
  ORDER_CANCELLED: 'Order Cancelled',
  REFUND_COMPLETED: 'Refund Completed',
};

export const statusExplanations: Record<EmailNotificationStatus, string> = {
  QUEUED: 'Maevelle is waiting for the background email worker to send this message.',
  PROCESSING: 'The email worker has claimed this message and is delivering it to Resend.',
  SENT: 'Resend accepted the message and is attempting delivery to the recipient mail server.',
  DELIVERED: "The recipient's email provider confirmed successful delivery of the message.",
  DELIVERY_DELAYED: "The recipient's email provider reported a temporary delay, but is still attempting delivery.",
  FAILED: 'Maevelle or Resend could not complete the send due to a technical error.',
  BOUNCED: "The recipient's email provider permanently rejected the message (invalid mailbox or domain).",
  COMPLAINED: 'The recipient marked this email as spam or reported a complaint to their provider.',
  SUPPRESSED: 'Maevelle intentionally prevents future sending to this address to protect sender reputation.',
  SKIPPED_NO_EMAIL: 'Skipped because the customer does not have an email address on file.',
  PENDING_MANUAL: 'Automatic delivery is disabled by policy. Manual send is available.',
  NOT_APPLICABLE: 'Not applicable for this order state.',
  READ: 'In-app notification was marked as read by the recipient.',
};

export async function fetchEmailApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => undefined)) as
    | T
    | { error?: { message?: string } }
    | undefined;
  if (!response.ok) {
    const errorMsg =
      payload && typeof payload === 'object' && 'error' in payload && payload.error?.message
        ? payload.error.message
        : 'Email operation failed.';
    throw new Error(errorMsg);
  }
  return payload as T;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
