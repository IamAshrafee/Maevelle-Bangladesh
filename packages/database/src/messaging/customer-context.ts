import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { getCustomerDetail, listCustomerOrders, listCustomerReturns } from '../customers.js';
import { listOrders } from '../orders.js';
import { appendAuditEvent } from '../platform.js';
import {
  getConversation,
  MessagingDomainError,
  type ConversationAccess,
  type MessagingActorContext,
} from './index.js';

type Db = Kysely<DatabaseSchema>;

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
      productContext: await getProductContext(db, input.actor.organizationId, conversation.id),
    };
  const [customer, orders, commerceOrders, returns, productContext] = await Promise.all([
    getCustomerDetail(db, input.actor.organizationId, conversation.contact.customerId),
    listCustomerOrders(db, input.actor.organizationId, conversation.contact.customerId, 20),
    listOrders(db, input.actor.organizationId, {
      customerId: conversation.contact.customerId,
      page: 1,
      pageSize: 20,
    }),
    listCustomerReturns(db, input.actor.organizationId, conversation.contact.customerId, 10),
    getProductContext(db, input.actor.organizationId, conversation.id),
  ]);
  return {
    conversationId: conversation.id,
    linkStatus: 'LINKED' as const,
    customer,
    orders,
    commerceOrders,
    returns,
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
  return db.transaction().execute(async (tx) => {
    const valid =
      await sql`select 1 from customers.customers where organization_id=${input.actor.organizationId} and id=${input.customerId} and status='ACTIVE'`.execute(
        tx,
      );
    if (!valid.rows[0])
      throw new MessagingDomainError(
        'VALIDATION_FAILED',
        'Customer is not active in this organization.',
      );
    const updated = await sql<{
      id: string;
    }>`update messaging.contacts set customer_id=${input.customerId},link_status='LINKED',linked_at=now(),linked_by_actor_id=${input.actor.actorId},updated_at=now(),version=version+1 where organization_id=${input.actor.organizationId} and id=${input.contactId} returning id`.execute(
      tx,
    );
    if (!updated.rows[0])
      throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Messaging contact was not found.');
    await sql`insert into messaging.contact_customer_link_events(organization_id,contact_id,customer_id,action,method,actor_type,actor_id,evidence_reference,reason) values(${input.actor.organizationId},${input.contactId},${input.customerId},'LINKED',${input.method},'USER',${input.actor.actorId},${input.evidenceReference ?? null},${input.reason.trim()})`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.contact.customer_linked',
      targetType: 'messaging.contact',
      targetId: input.contactId,
      reason: input.reason,
      metadata: { customerId: input.customerId, method: input.method },
    });
    return {
      contactId: input.contactId,
      customerId: input.customerId,
      linkStatus: 'LINKED' as const,
    };
  });
}

export async function unlinkMessagingContactFromCustomer(
  db: Db,
  input: { actor: MessagingActorContext; contactId: string; reason: string },
) {
  return db.transaction().execute(async (tx) => {
    const previous = await sql<{
      customer_id: string | null;
    }>`select customer_id from messaging.contacts where organization_id=${input.actor.organizationId} and id=${input.contactId} for update`.execute(
      tx,
    );
    if (!previous.rows[0])
      throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Messaging contact was not found.');
    await sql`update messaging.contacts set customer_id=null,link_status='UNLINKED_BY_POLICY',linked_at=null,linked_by_actor_id=null,updated_at=now(),version=version+1 where organization_id=${input.actor.organizationId} and id=${input.contactId}`.execute(
      tx,
    );
    await sql`insert into messaging.contact_customer_link_events(organization_id,contact_id,customer_id,action,method,actor_type,actor_id,reason) values(${input.actor.organizationId},${input.contactId},${previous.rows[0].customer_id},'UNLINKED','STAFF_REVIEW','USER',${input.actor.actorId},${input.reason.trim()})`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.contact.customer_unlinked',
      targetType: 'messaging.contact',
      targetId: input.contactId,
      reason: input.reason,
      metadata: { previousCustomerId: previous.rows[0].customer_id },
    });
    return {
      contactId: input.contactId,
      customerId: null,
      linkStatus: 'UNLINKED_BY_POLICY' as const,
    };
  });
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
