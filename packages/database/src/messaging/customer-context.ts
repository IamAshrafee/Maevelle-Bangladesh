import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import {
  CustomerDomainError,
  getCustomerCrmProfile,
  getCustomerDetail,
  listCustomerIdentityLinks,
  listCustomerOrders,
  listCustomerReturns,
} from '../customers.js';
import {
  createOrResolveCustomerIdentityLink,
  revokeCustomerIdentityLink,
} from '../customers/identities.js';
import { listOrders } from '../orders.js';
import {
  getConversation,
  MessagingDomainError,
  type ConversationAccess,
  type MessagingActorContext,
} from './index.js';

type Db = Kysely<DatabaseSchema>;

function maskedPhone(value: string | null): string | null {
  if (!value) return null;
  return `${'•'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

function maskedEmail(value: string): string {
  const [local = '', domain = ''] = value.split('@');
  return `${local.slice(0, 1) || '•'}•••@${domain || '•••'}`;
}

export async function getConversationCustomerContext(
  db: Db,
  input: { actor: MessagingActorContext; access: ConversationAccess; conversationId: string },
) {
  const conversation = await getConversation(db, {
    organizationId: input.actor.organizationId,
    membershipId: input.actor.membershipId,
    access: input.access,
    conversationId: input.conversationId,
  });
  if (!conversation.contact.customerId)
    return {
      conversationId: conversation.id,
      linkStatus: 'UNLINKED' as const,
      customer: null,
      orders: [],
      commerceOrders: {
        data: [],
        pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      },
      returns: [],
      crmProfile: null,
      linkedIdentities: [],
      productContext: await getProductContext(db, input.actor.organizationId, conversation.id),
    };
  const [customer, orders, commerceOrders, returns, productContext, crmProfile, identities] =
    await Promise.all([
      getCustomerDetail(db, input.actor.organizationId, conversation.contact.customerId),
      listCustomerOrders(db, input.actor.organizationId, conversation.contact.customerId, 20),
      listOrders(db, input.actor.organizationId, {
        customerId: conversation.contact.customerId,
        page: 1,
        pageSize: 20,
      }),
      listCustomerReturns(db, input.actor.organizationId, conversation.contact.customerId, 10),
      getProductContext(db, input.actor.organizationId, conversation.id),
      getCustomerCrmProfile(db, input.actor.organizationId, conversation.contact.customerId),
      listCustomerIdentityLinks(db, {
        organizationId: input.actor.organizationId,
        customerId: conversation.contact.customerId,
        status: 'LINKED',
        limit: 20,
      }),
    ]);
  return {
    conversationId: conversation.id,
    linkStatus: 'LINKED' as const,
    customer: input.actor.capabilities.includes('customers.sensitive.view')
      ? customer
      : {
          ...customer,
          phones: customer.phones.map((phone) => ({
            ...phone,
            phone: maskedPhone(phone.phone) ?? '',
          })),
          emails: customer.emails.map((email) => ({ ...email, email: maskedEmail(email.email) })),
          addresses: customer.addresses.map((address) => ({
            ...address,
            phone: maskedPhone(address.phone),
          })),
        },
    orders,
    commerceOrders,
    returns,
    crmProfile,
    linkedIdentities: identities.items,
    productContext,
  };
}

async function getProductContext(db: Db, organizationId: string, conversationId: string) {
  const result = await sql<{
    context_type: string;
    url_path: string;
    product_id: string | null;
    variant_id: string | null;
    product_title: string | null;
    created_at: Date;
  }>`select context_type,url_path,product_id,variant_id,product_title,created_at
    from messaging.conversation_context_events where organization_id=${organizationId} and conversation_id=${conversationId}
    order by created_at desc,id desc limit 10`.execute(db);
  return result.rows.map((row) => ({
    pageType: row.context_type,
    path: row.url_path,
    productId: row.product_id,
    variantId: row.variant_id,
    productTitle: row.product_title,
    capturedAt: row.created_at.toISOString(),
  }));
}

export async function linkMessagingContactToCustomer(
  db: Db,
  input: {
    actor: MessagingActorContext;
    contactId: string;
    customerId: string;
    method: 'VERIFIED_EMAIL' | 'VERIFIED_PHONE' | 'STAFF_REVIEW';
    evidenceReference?: string;
    reason: string;
  },
) {
  const identity = await sql<{ id: string }>`select id from messaging.contact_identities
    where organization_id=${input.actor.organizationId} and contact_id=${input.contactId}
    order by last_seen_at desc,id limit 1`.execute(db);
  if (!identity.rows[0])
    throw new MessagingDomainError(
      'CONVERSATION_NOT_FOUND',
      'Messaging contact identity was not found.',
    );
  try {
    await createOrResolveCustomerIdentityLink(db, {
      organizationId: input.actor.organizationId,
      actorId: input.actor.actorId,
      customerId: input.customerId,
      contactIdentityId: identity.rows[0].id,
      targetStatus: 'LINKED',
      assurance: input.method === 'STAFF_REVIEW' ? 'LOW' : 'HIGH',
      evidenceMethod: input.method,
      ...(input.evidenceReference ? { evidenceReference: input.evidenceReference } : {}),
      evidenceSummary:
        input.method === 'STAFF_REVIEW'
          ? 'Authorized staff linked this scoped channel identity after reviewing the available evidence.'
          : `The customer relationship was supported by ${input.method.toLowerCase().replaceAll('_', ' ')} evidence.`,
      reason: input.reason,
    });
    return {
      contactId: input.contactId,
      customerId: input.customerId,
      linkStatus: 'LINKED' as const,
    };
  } catch (error) {
    if (error instanceof CustomerDomainError)
      throw new MessagingDomainError(
        error.code === 'NOT_FOUND' ? 'CONVERSATION_NOT_FOUND' : 'VALIDATION_FAILED',
        error.message,
      );
    throw error;
  }
}

export async function unlinkMessagingContactFromCustomer(
  db: Db,
  input: { actor: MessagingActorContext; contactId: string; reason: string },
) {
  const link = await sql<{
    id: string;
    version: string;
  }>`select id,version::text from customers.customer_identity_links
    where organization_id=${input.actor.organizationId} and contact_id=${input.contactId} and status='LINKED'
    order by updated_at desc,id limit 1`.execute(db);
  if (!link.rows[0])
    throw new MessagingDomainError(
      'CONVERSATION_NOT_FOUND',
      'Active customer identity link was not found.',
    );
  try {
    await revokeCustomerIdentityLink(db, {
      organizationId: input.actor.organizationId,
      actorId: input.actor.actorId,
      linkId: link.rows[0].id,
      expectedVersion: Number(link.rows[0].version),
      reason: input.reason,
    });
    return {
      contactId: input.contactId,
      customerId: null,
      linkStatus: 'UNLINKED_BY_POLICY' as const,
    };
  } catch (error) {
    if (error instanceof CustomerDomainError)
      throw new MessagingDomainError(
        error.code === 'NOT_FOUND' ? 'CONVERSATION_NOT_FOUND' : 'VALIDATION_FAILED',
        error.message,
      );
    throw error;
  }
}

export async function searchMessagingContacts(
  db: Db,
  input: { organizationId: string; query: string; limit?: number },
) {
  const query = input.query.trim();
  if (query.length < 2)
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Search query must contain at least two characters.',
    );
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const result = await sql<{
    id: string;
    display_name: string | null;
    customer_id: string | null;
    link_status: string;
    channel_kind: string;
    username: string | null;
    identity_name: string | null;
    last_seen_at: Date;
  }>`select contact.id,contact.display_name,contact.customer_id,contact.link_status,identity.channel_kind,identity.username,identity.display_name identity_name,identity.last_seen_at
    from messaging.contacts contact join messaging.contact_identities identity on identity.organization_id=contact.organization_id and identity.contact_id=contact.id
    where contact.organization_id=${input.organizationId} and (contact.id::text=${query} or contact.display_name ilike ${`%${query}%`} or identity.display_name ilike ${`%${query}%`} or identity.username ilike ${`%${query}%`}
      or exists(select 1 from customers.customer_phones phone where phone.organization_id=contact.organization_id and phone.customer_id=contact.customer_id and phone.verification_status='VERIFIED' and (phone.normalized_value=${query} or phone.raw_value ilike ${`%${query}%`}))
      or exists(select 1 from customers.customer_emails email where email.organization_id=contact.organization_id and email.customer_id=contact.customer_id and email.verification_status='VERIFIED' and email.normalized_value ilike ${`%${query.toLowerCase()}%`}))
    order by identity.last_seen_at desc,contact.id limit ${limit}`.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    customerId: row.customer_id,
    linkStatus: row.link_status,
    identity: {
      channelKind: row.channel_kind,
      displayName: row.identity_name,
      username: row.username,
      lastSeenAt: row.last_seen_at.toISOString(),
    },
  }));
}
