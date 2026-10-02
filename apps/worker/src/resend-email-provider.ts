import { Resend } from 'resend';
import type { EmailAdapter, DeliveryResult } from '@maevelle/database/notifications';

export interface ResendEmailProviderOptions {
  readonly apiKey: string;
  readonly fromName: string;
  readonly fromAddress: string;
  readonly replyTo: string;
  readonly testRecipientOverride?: string;
}

const transientErrors = new Set([
  'rate_limit_exceeded',
  'application_error',
  'internal_server_error',
  'concurrent_idempotent_requests',
  'network_error',
]);

function failure(name: string, message?: string): DeliveryResult {
  return {
    status: 'FAILED',
    retryable: transientErrors.has(name),
    errorCode: `RESEND_${name.replaceAll(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}`,
    metadata: { providerError: name, ...(message ? { message: message.slice(0, 300) } : {}) },
  };
}

export function createResendEmailProvider(options: ResendEmailProviderOptions): EmailAdapter {
  const resend = new Resend(options.apiKey);
  return {
    name: 'resend',
    effectiveRecipient: (recipient) => options.testRecipientOverride ?? recipient,
    async send(request) {
      try {
        const result = await resend.emails.send(
          {
            from: `${options.fromName} <${options.fromAddress}>`,
            to: [request.recipient],
            replyTo: options.replyTo,
            subject: request.subject,
            html: request.html,
            text: request.text,
            tags: [
              { name: 'notification_id', value: request.notificationId },
              { name: 'category', value: 'transactional' },
            ],
          },
          { idempotencyKey: request.idempotencyKey.slice(0, 256) },
        );
        if (result.error) return failure(result.error.name, result.error.message);
        if (!result.data?.id) return failure('invalid_provider_response');
        return {
          status: 'SENT',
          providerReference: result.data.id,
          metadata: { acceptedBy: 'resend' },
        };
      } catch (error) {
        return failure('network_error', error instanceof Error ? error.message : undefined);
      }
    },
  };
}
