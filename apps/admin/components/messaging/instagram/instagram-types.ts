import type {
  InstagramConnectionStatus,
  InstagramReplyEligibility,
} from '@maevelle/contracts/messaging';

export function getInstagramStatusInfo(status: InstagramConnectionStatus) {
  switch (status) {
    case 'CONNECTED':
      return {
        label: 'Connected',
        tone: 'success' as const,
        description: 'The professional account is connected and active.',
      };
    case 'LIMITED_PERMISSIONS':
      return {
        label: 'Limited Permissions',
        tone: 'warning' as const,
        description: 'Meta granted only part of the permissions needed for messaging.',
      };
    case 'WEBHOOK_INCOMPLETE':
      return {
        label: 'Webhook Incomplete',
        tone: 'warning' as const,
        description: 'The account is connected, but its webhook subscription needs attention.',
      };
    case 'NEEDS_REAUTHORIZATION':
      return {
        label: 'Reauthorization Required',
        tone: 'destructive' as const,
        description: 'Meta rejected or invalidated the stored authorization.',
      };
    case 'SUSPENDED':
      return {
        label: 'Suspended',
        tone: 'warning' as const,
        description: 'Maevelle has paused messaging for this account.',
      };
    case 'DISCONNECTED':
      return {
        label: 'Disconnected',
        tone: 'muted' as const,
        description: 'Credentials were removed while canonical conversation history was retained.',
      };
    case 'AUTHORIZATION_PENDING':
      return {
        label: 'Authorization Pending',
        tone: 'warning' as const,
        description: 'Account authorization has not finished.',
      };
    default:
      return {
        label: 'Error',
        tone: 'destructive' as const,
        description: 'The connection needs administrative attention.',
      };
  }
}

const blockerLabels: Readonly<Record<string, string>> = {
  AUTHORIZATION_INCOMPLETE: 'Authorization is incomplete.',
  CREDENTIAL_UNHEALTHY: 'The stored Meta credential could not be verified.',
  MISSING_REQUIRED_SCOPES: 'One or more required Meta permissions are missing.',
  WEBHOOK_NOT_SUBSCRIBED: 'Instagram webhook events are not fully subscribed.',
  PERMISSION_REVIEW_UNCONFIRMED: 'Production permission approval has not been confirmed.',
  CONNECTION_SUSPENDED: 'Messaging is suspended in Maevelle.',
  CONNECTION_DISCONNECTED: 'This account is disconnected.',
};

export function formatInstagramBlocker(blocker: string) {
  return blockerLabels[blocker] ?? blocker.replaceAll('_', ' ').toLowerCase();
}

export function instagramReplyCopy(reason: InstagramReplyEligibility['reason']) {
  switch (reason) {
    case 'WINDOW_CLOSED':
      return {
        title: 'Instagram 24-Hour Reply Window Closed',
        description:
          'Meta allows a standard reply within 24 hours of the customer’s latest message. Wait for the customer to message again.',
      };
    case 'NO_CUSTOMER_MESSAGE':
      return {
        title: 'Awaiting Customer Message',
        description:
          'The customer must start the Instagram conversation before Maevelle can reply.',
      };
    case 'PERMISSION_MISSING':
      return {
        title: 'Instagram Permission Missing',
        description: 'Reauthorize the account or complete Meta App Review in Channel Settings.',
      };
    case 'ACTIVATION_INCOMPLETE':
      return {
        title: 'Instagram Activation Incomplete',
        description:
          'Review the webhook subscription, permissions, and account health in Channel Settings.',
      };
    case 'UNSUPPORTED_CONTENT':
      return {
        title: 'Unsupported Instagram Content',
        description: 'Send either text or 1 supported image—not both—in this reply.',
      };
    default:
      return {
        title: 'Instagram Replies Unavailable',
        description: 'This Instagram contact or connection is currently unavailable.',
      };
  }
}

export function instagramReplyDraftIssue(text: string, attachmentCount: number): string | null {
  if (attachmentCount > 1) return 'Instagram supports 1 image per reply.';
  if (attachmentCount > 0 && text.trim())
    return 'Instagram replies must contain text or 1 image, not both.';
  return null;
}
