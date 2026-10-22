import type {
  FacebookConnectionStatus,
  FacebookConnectionView,
  FacebookEligiblePage,
  FacebookIntegrationAvailability,
  FacebookOAuthStartView,
  FacebookOAuthStatusView,
  FacebookReplyEligibility,
  FacebookSyncView,
} from '@maevelle/contracts/messaging';

export type {
  FacebookConnectionStatus,
  FacebookConnectionView,
  FacebookEligiblePage,
  FacebookIntegrationAvailability,
  FacebookOAuthStartView,
  FacebookOAuthStatusView,
  FacebookReplyEligibility,
  FacebookSyncView,
};

export interface FacebookConnectionStateBadgeInfo {
  readonly label: string;
  readonly variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info';
  readonly description: string;
}

export function getFacebookStatusInfo(
  status: FacebookConnectionStatus,
): FacebookConnectionStateBadgeInfo {
  switch (status) {
    case 'CONNECTED':
      return {
        label: 'Connected',
        variant: 'success',
        description: 'Facebook Page is connected, subscribed to webhooks, and active.',
      };
    case 'LIMITED_PERMISSIONS':
      return {
        label: 'Limited Permissions',
        variant: 'warning',
        description:
          'One or more required Meta permissions or Page tasks are missing.',
      };
    case 'WEBHOOK_INCOMPLETE':
      return {
        label: 'Webhook Incomplete',
        variant: 'warning',
        description:
          'Page is not fully subscribed to required Facebook webhook events.',
      };
    case 'ROUTING_UNVERIFIED':
      return {
        label: 'Routing Unverified',
        variant: 'warning',
        description:
          'Conversation Routing and Meta Business Suite coexistence must be owner-reviewed.',
      };
    case 'NEEDS_REAUTHORIZATION':
      return {
        label: 'Needs Reauthorization',
        variant: 'destructive',
        description:
          'Page access token has expired, been revoked, or password changed.',
      };
    case 'SUSPENDED':
      return {
        label: 'Suspended',
        variant: 'secondary',
        description:
          'Facebook messaging is temporarily suspended by Maevelle administrator.',
      };
    case 'DISCONNECTED':
      return {
        label: 'Disconnected',
        variant: 'outline',
        description:
          'Integration is disconnected. Local conversation history remains preserved.',
      };
    case 'AUTHORIZATION_PENDING':
      return {
        label: 'Authorization Pending',
        variant: 'info',
        description: 'Awaiting Meta authorization completion.',
      };
    case 'ERROR':
    default:
      return {
        label: 'Error',
        variant: 'destructive',
        description: 'An unexpected connection error occurred.',
      };
  }
}

export function getReplyEligibilityNextActionInfo(
  action: FacebookReplyEligibility['nextAction'],
): { label: string; description: string } {
  switch (action) {
    case 'REPLY':
      return {
        label: 'Reply Allowed',
        description: 'Conversation is within the 24-hour Messenger messaging window.',
      };
    case 'WAIT_FOR_CUSTOMER':
      return {
        label: 'Awaiting Customer Message',
        description:
          'The 24-hour reply window has expired. A customer message is required to reopen it.',
      };
    case 'REAUTHORIZE':
      return {
        label: 'Reauthorization Required',
        description:
          'Page access token is invalid or missing messaging permissions.',
      };
    case 'REVIEW_ACTIVATION':
      return {
        label: 'Activation Incomplete',
        description:
          'Connection readiness checks (webhook or conversation routing) are not complete.',
      };
    case 'CONTACT_UNAVAILABLE':
    default:
      return {
        label: 'Contact Unavailable',
        description: 'The Facebook messaging contact is no longer available.',
      };
  }
}

export function formatBlockerMessage(blocker: string): string {
  switch (blocker) {
    case 'AUTHORIZATION_NEEDS_REAUTHORIZATION':
      return 'Page token expired or revoked. Reauthorization required.';
    case 'AUTHORIZATION_INCOMPLETE':
      return 'Required Meta permissions or Page messaging task missing.';
    case 'ADVANCED_ACCESS_NOT_CONFIRMED':
      return 'Meta App Review / Advanced Access not confirmed for production messaging.';
    case 'WEBHOOK_NOT_SUBSCRIBED':
      return 'Facebook Page webhook subscription not enabled.';
    case 'WEBHOOK_UNHEALTHY':
      return 'Webhook subscription incomplete or failing.';
    case 'ROUTING_UNVERIFIED':
      return 'Conversation Routing and Business Suite coexistence pending owner review.';
    case 'ROUTING_CONFLICT':
      return 'Conversation Routing conflict detected with another connected app.';
    case 'INBOUND_NOT_OBSERVED':
      return 'No inbound customer message observed on this Page yet.';
    case 'OUTBOUND_NOT_OBSERVED':
      return 'No outbound staff reply observed on this Page yet.';
    case 'OPERATIONAL_NOT_RUN':
      return 'Operational readiness smoke test not yet recorded.';
    case 'OPERATIONAL_FAILED':
      return 'Operational readiness smoke test failed.';
    default:
      return blocker.replace(/_/g, ' ').toLowerCase();
  }
}
