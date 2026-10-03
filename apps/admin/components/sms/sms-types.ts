import type {
  OrderSmsEligibilityDto,
  SmsDiagnosticsDto,
  SmsMockScenario,
  SmsNotificationDetailDto,
  SmsNotificationRowDto,
  SmsNotificationStatus,
  SmsPolicyDto,
  SmsPreviewDto,
  SmsSuppressionDto,
  SmsTemplateDto,
} from '@maevelle/contracts';

export type {
  OrderSmsEligibilityDto,
  SmsDiagnosticsDto,
  SmsMockScenario,
  SmsNotificationDetailDto,
  SmsNotificationRowDto,
  SmsNotificationStatus,
  SmsPolicyDto,
  SmsPreviewDto,
  SmsSuppressionDto,
  SmsTemplateDto,
};

export type SmsTabKey =
  'overview' | 'activity' | 'templates' | 'test-lab' | 'policies' | 'suppressions' | 'diagnostics';

export const smsEventLabels: Readonly<Record<string, string>> = {
  ORDER_PLACED: 'Order Received',
  ORDER_CONFIRMED: 'Order Confirmed',
  PAYMENT_VERIFIED: 'Payment Confirmed',
  ORDER_DISPATCHED: 'Order Dispatched',
  DELIVERY_COMPLETED: 'Order Delivered',
  ORDER_CANCELLED: 'Order Cancelled',
  REFUND_COMPLETED: 'Refund Completed',
};

export const smsStatusContent: Readonly<
  Record<SmsNotificationStatus, { label: string; explanation: string; tone: string }>
> = {
  NOT_APPLICABLE: {
    label: 'Skipped',
    explanation: 'This SMS did not apply to the current recipient or configuration.',
    tone: 'border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-900',
  },
  SKIPPED_NO_PHONE: {
    label: 'No Phone',
    explanation: 'The order snapshot did not contain a usable customer phone.',
    tone: 'border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-900',
  },
  PENDING_MANUAL: {
    label: 'Manual Only',
    explanation: 'Automatic sending is disabled; an authorized operator may send it manually.',
    tone: 'border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-900',
  },
  QUEUED: {
    label: 'Queued',
    explanation: 'Waiting for the SMS worker.',
    tone: 'border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  },
  PROCESSING: {
    label: 'Sending',
    explanation: 'The SMS worker is submitting this message to the provider.',
    tone: 'border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  },
  ACCEPTED: {
    label: 'Accepted',
    explanation: 'The provider accepted the SMS for processing; delivery is not confirmed.',
    tone: 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  },
  DELIVERED: {
    label: 'Delivered',
    explanation: 'The provider or mobile network confirmed delivery.',
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  },
  DELIVERY_DELAYED: {
    label: 'Delayed',
    explanation: 'The provider is still attempting delivery.',
    tone: 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  },
  FAILED: {
    label: 'Failed',
    explanation: 'A confirmed technical or provider failure prevented delivery.',
    tone: 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
  },
  REJECTED: {
    label: 'Rejected',
    explanation: 'The provider rejected the message.',
    tone: 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
  },
  EXPIRED: {
    label: 'Expired',
    explanation: 'The provider stopped attempting delivery before completion.',
    tone: 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
  },
  UNDELIVERABLE: {
    label: 'Undeliverable',
    explanation: 'The provider reported that the mobile network could not deliver the SMS.',
    tone: 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
  },
  UNKNOWN_PROVIDER_OUTCOME: {
    label: 'Outcome Uncertain',
    explanation:
      'Provider acceptance is unknown. Maevelle is reconciling before allowing another send.',
    tone: 'border-purple-300 bg-purple-50 text-purple-800 dark:bg-purple-950 dark:text-purple-200',
  },
  SUPPRESSED: {
    label: 'Suppressed',
    explanation: 'Maevelle intentionally blocked delivery to this recipient.',
    tone: 'border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-900',
  },
};

export function formatSmsDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function formatBangladeshPhone(value: string | null | undefined): string {
  if (!value) return 'Unavailable';
  const compact = value.replace(/[^\d+]/g, '');
  const local = compact.startsWith('+880')
    ? `0${compact.slice(4)}`
    : compact.startsWith('880')
      ? `0${compact.slice(3)}`
      : compact;
  return /^01\d{9}$/.test(local) ? `${local.slice(0, 5)}-${local.slice(5)}` : value;
}

export function isPendingSmsStatus(status: SmsNotificationStatus): boolean {
  return [
    'QUEUED',
    'PROCESSING',
    'ACCEPTED',
    'DELIVERY_DELAYED',
    'UNKNOWN_PROVIDER_OUTCOME',
  ].includes(status);
}

export function smsEventLabel(event: string): string {
  return (
    smsEventLabels[event] ??
    event
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/^./, (letter) => letter.toUpperCase())
  );
}

export interface SmsActivityFilters {
  readonly search: string;
  readonly status: string;
  readonly notificationType: string;
  readonly triggerType: string;
  readonly encoding: string;
  readonly provider: string;
  readonly createdFrom: string;
  readonly createdTo: string;
}

export function buildSmsActivityQuery(
  filters: SmsActivityFilters,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters))
    if (value.trim()) params.set(key, value.trim());
  return params.toString();
}
