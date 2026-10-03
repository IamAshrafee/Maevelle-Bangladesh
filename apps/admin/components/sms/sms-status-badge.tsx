import {
  AlertCircle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock3,
  HelpCircle,
  Send,
  XCircle,
} from 'lucide-react';
import type { SmsNotificationStatus } from './sms-types';
import { smsStatusContent } from './sms-types';
import { Badge } from '@/components/ui/badge';

const icons = {
  NOT_APPLICABLE: Ban,
  SKIPPED_NO_PHONE: Ban,
  PENDING_MANUAL: Clock3,
  QUEUED: Clock3,
  PROCESSING: CircleDashed,
  ACCEPTED: Send,
  DELIVERED: CheckCircle2,
  DELIVERY_DELAYED: Clock3,
  FAILED: XCircle,
  REJECTED: XCircle,
  EXPIRED: AlertCircle,
  UNDELIVERABLE: XCircle,
  UNKNOWN_PROVIDER_OUTCOME: HelpCircle,
  SUPPRESSED: Ban,
} as const;

export function SmsStatusBadge({
  status,
  compact = false,
}: {
  readonly status: SmsNotificationStatus;
  readonly compact?: boolean;
}) {
  const content = smsStatusContent[status];
  const Icon = icons[status];
  return (
    <Badge
      variant="outline"
      className={`${content.tone} gap-1 whitespace-nowrap font-medium`}
      title={content.explanation}
    >
      <Icon
        aria-hidden="true"
        className={`${status === 'PROCESSING' ? 'animate-spin motion-reduce:animate-none' : ''} size-3`}
      />
      {compact ? content.label : content.label}
    </Badge>
  );
}
