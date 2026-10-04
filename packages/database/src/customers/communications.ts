import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import type { CustomerCommunicationSummary } from './types.js';

export async function listCustomerCommunications(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  customerId: string,
  options?: {
    channel?: 'IN_APP' | 'EMAIL' | 'SMS';
    status?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ items: readonly CustomerCommunicationSummary[]; totalCount: number }> {
  const limit = Math.min(100, Math.max(1, options?.limit ?? 25));
  const offset = Math.max(0, options?.offset ?? 0);

  const result = await sql<{
    id: string;
    channel: 'IN_APP' | 'EMAIL' | 'SMS';
    notification_type: string;
    rendered_subject: string | null;
    rendered_body: string;
    intended_recipient: string | null;
    effective_recipient: string | null;
    status: string;
    provider: string | null;
    provider_message_id: string | null;
    skip_reason: string | null;
    failure_code: string | null;
    failure_message: string | null;
    source_domain: string;
    source_id: string;
    sent_at: Date | null;
    delivered_at: Date | null;
    created_at: Date;
    sms_original_recipient: string | null;
    sms_normalized_recipient: string | null;
    sms_encoding: string | null;
    sms_character_count: number | null;
    sms_estimated_segments: number | null;
    sms_sender_type: string | null;
    sms_sender_id: string | null;
    total_count: string;
  }>`
    select
      n.id, n.channel, n.notification_type, n.rendered_subject, n.rendered_body,
      n.intended_recipient, n.effective_recipient, n.status, n.provider, n.provider_message_id,
      n.skip_reason, n.failure_code, n.failure_message, n.source_domain, n.source_id,
      n.sent_at, n.delivered_at, n.created_at,
      sms.original_recipient as sms_original_recipient,
      sms.normalized_recipient as sms_normalized_recipient,
      sms.encoding as sms_encoding,
      sms.character_count as sms_character_count,
      sms.estimated_segments as sms_estimated_segments,
      sms.sender_type as sms_sender_type,
      sms.sender_id as sms_sender_id,
      count(*) over ()::text as total_count
    from notifications.notifications n
    left join notifications.sms_delivery_details sms on sms.notification_id = n.id
    where n.organization_id = ${organizationId}
      and (
        n.customer_id = ${customerId}
        or n.customer_id in (
          select alias_customer_id from customers.customer_aliases
          where organization_id = ${organizationId} and canonical_customer_id = ${customerId}
        )
      )
      and (${options?.channel ?? null}::text is null or n.channel = ${options?.channel ?? null})
      and (${options?.status ?? null}::text is null or n.status = ${options?.status ?? null})
    order by n.created_at desc
    limit ${limit} offset ${offset}
  `.execute(db);

  const totalCount = Number(result.rows[0]?.total_count ?? 0);

  const items = result.rows.map((row) => ({
    id: row.id,
    channel: row.channel,
    notificationType: row.notification_type,
    renderedSubject: row.rendered_subject,
    renderedBody: row.rendered_body,
    intendedRecipient: row.intended_recipient,
    effectiveRecipient: row.effective_recipient,
    status: row.status,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    skipReason: row.skip_reason,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    sourceDomain: row.source_domain,
    sourceId: row.source_id,
    sentAt: row.sent_at?.toISOString() ?? null,
    deliveredAt: row.delivered_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    smsDetails: row.sms_encoding
      ? {
          originalRecipient: row.sms_original_recipient,
          normalizedRecipient: row.sms_normalized_recipient,
          encoding: row.sms_encoding,
          characterCount: Number(row.sms_character_count ?? 0),
          estimatedSegments: Number(row.sms_estimated_segments ?? 0),
          senderType: row.sms_sender_type ?? 'PROVIDER_DEFAULT',
          senderId: row.sms_sender_id,
        }
      : null,
  }));

  return { items, totalCount };
}
