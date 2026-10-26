import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createDatabase } from '../index.js';
import { createOrganization } from '../platform.js';
import { createCustomer } from '../customers.js';
import {
  createOrResolveCustomerIdentityLink,
  reconcileLegacyMessagingCustomerLinks,
  revokeCustomerIdentityLink,
} from './identities.js';
import {
  createChannelConnection,
  createContactIdentity,
  createConversation,
} from '../messaging/index.js';
import { getConversationCustomerContext } from '../messaging/customer-context.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 8,
});
afterAll(async () => database.close());

describe('customer unified identities', () => {
  it('serializes conflicting links, masks inbox PII, and revokes without deleting conversation history', async () => {
    const organization = (
      await createOrganization(database.db, {
        code: `identity-${crypto.randomUUID().slice(0, 8)}`,
        displayName: 'Identity test',
        timezone: 'UTC',
        defaultLocale: 'en',
        defaultCurrency: 'BDT',
      })
    ).id;
    const actorId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const connectionId = await createChannelConnection(database.db, {
      organizationId: organization,
      channelKind: 'WEBSITE',
      displayName: 'Identity site',
      status: 'ACTIVE',
    });
    const identity = await createContactIdentity(database.db, {
      organizationId: organization,
      channelConnectionId: connectionId,
      channelKind: 'WEBSITE',
      externalSubjectId: `visitor-${crypto.randomUUID()}`,
      displayName: 'Verified visitor',
    });
    const conversationId = await createConversation(database.db, {
      organizationId: organization,
      channelConnectionId: connectionId,
      contactId: identity.contactId,
      contactIdentityId: identity.identityId,
    });
    const first = await createCustomer(database.db, {
      organizationId: organization,
      actorId,
      displayName: 'First claimant',
      phone: '01712345678',
    });
    const second = await createCustomer(database.db, {
      organizationId: organization,
      actorId,
      displayName: 'Second claimant',
      phone: '01812345678',
    });
    const link = (customerId: string) =>
      createOrResolveCustomerIdentityLink(database.db, {
        organizationId: organization,
        actorId,
        customerId,
        contactIdentityId: identity.identityId,
        targetStatus: 'LINKED',
        assurance: 'LOW',
        evidenceMethod: 'STAFF_REVIEW',
        evidenceSummary: 'Authorized staff reviewed the scoped website contact.',
        reason: 'Concurrency test manual link.',
      });
    const attempts = await Promise.allSettled([link(first.id), link(second.id)]);
    expect(attempts.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((item) => item.status === 'rejected')).toHaveLength(1);
    const fulfilled = attempts.find((item) => item.status === 'fulfilled');
    if (!fulfilled || fulfilled.status !== 'fulfilled')
      throw new Error('Expected one successful identity link.');
    const linked = fulfilled.value;
    const context = await getConversationCustomerContext(database.db, {
      actor: {
        organizationId: organization,
        actorId,
        membershipId,
        capabilities: ['messaging.customer_context.view'],
      },
      access: 'ALL',
      conversationId,
    });
    expect(context.customer?.phones[0]?.phone).toMatch(/•{4,}\d{4}$/);
    await revokeCustomerIdentityLink(database.db, {
      organizationId: organization,
      actorId,
      linkId: linked.id,
      expectedVersion: linked.version,
      reason: 'Customer disputed this manual association.',
    });
    const evidence = await sql<{
      conversations: string;
      customer_id: string | null;
      link_status: string;
    }>`select (select count(*)::text from messaging.conversations where id=${conversationId}) conversations,customer_id,link_status from messaging.contacts where organization_id=${organization} and id=${identity.contactId}`.execute(
      database.db,
    );
    expect(evidence.rows[0]).toEqual({
      conversations: '1',
      customer_id: null,
      link_status: 'UNLINKED_BY_POLICY',
    });
  });

  it('rejects assurance inflation for staff review evidence', async () => {
    const organization = (
      await createOrganization(database.db, {
        code: `identity-${crypto.randomUUID().slice(0, 8)}`,
        displayName: 'Assurance test',
        timezone: 'UTC',
        defaultLocale: 'en',
        defaultCurrency: 'BDT',
      })
    ).id;
    const actorId = crypto.randomUUID();
    const connectionId = await createChannelConnection(database.db, {
      organizationId: organization,
      channelKind: 'WEBSITE',
      displayName: 'Assurance site',
      status: 'ACTIVE',
    });
    const identity = await createContactIdentity(database.db, {
      organizationId: organization,
      channelConnectionId: connectionId,
      channelKind: 'WEBSITE',
      externalSubjectId: `visitor-${crypto.randomUUID()}`,
    });
    const customer = await createCustomer(database.db, {
      organizationId: organization,
      actorId,
      displayName: 'Assurance customer',
    });
    await expect(
      createOrResolveCustomerIdentityLink(database.db, {
        organizationId: organization,
        actorId,
        customerId: customer.id,
        contactIdentityId: identity.identityId,
        targetStatus: 'LINKED',
        assurance: 'HIGH',
        evidenceMethod: 'STAFF_REVIEW',
        evidenceSummary: 'Manual review.',
        reason: 'Invalid assurance attempt.',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      createOrResolveCustomerIdentityLink(database.db, {
        organizationId: organization,
        actorId,
        customerId: customer.id,
        contactIdentityId: identity.identityId,
        targetStatus: 'LINKED',
        assurance: 'HIGH',
        evidenceMethod: 'VERIFIED_PHONE',
        evidenceSummary: 'Claimed phone proof.',
        reason: 'Missing evidence reference attempt.',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('idempotently reconciles historical messaging customer projections at low assurance', async () => {
    const organization = (
      await createOrganization(database.db, {
        code: `identity-${crypto.randomUUID().slice(0, 8)}`,
        displayName: 'Legacy identity test',
        timezone: 'UTC',
        defaultLocale: 'en',
        defaultCurrency: 'BDT',
      })
    ).id;
    const actorId = crypto.randomUUID();
    const connectionId = await createChannelConnection(database.db, {
      organizationId: organization,
      channelKind: 'WEBSITE',
      displayName: 'Legacy site',
      status: 'ACTIVE',
    });
    const identity = await createContactIdentity(database.db, {
      organizationId: organization,
      channelConnectionId: connectionId,
      channelKind: 'WEBSITE',
      externalSubjectId: `legacy-${crypto.randomUUID()}`,
    });
    const customer = await createCustomer(database.db, {
      organizationId: organization,
      actorId,
      displayName: 'Legacy customer',
    });
    await sql`update messaging.contacts set customer_id=${customer.id},link_status='LINKED',linked_at=now() where organization_id=${organization} and id=${identity.contactId}`.execute(
      database.db,
    );
    const first = await reconcileLegacyMessagingCustomerLinks(database.db, {
      organizationId: organization,
      actorId,
    });
    const second = await reconcileLegacyMessagingCustomerLinks(database.db, {
      organizationId: organization,
      actorId,
    });
    expect(first).toMatchObject({ created: 1, alreadyReconciled: 0, withoutIdentity: 0 });
    expect(second).toMatchObject({ created: 0, alreadyReconciled: 1, withoutIdentity: 0 });
    const link = await sql<{
      assurance: string;
      evidence_method: string;
      status: string;
    }>`select assurance,evidence_method,status from customers.customer_identity_links where organization_id=${organization} and contact_identity_id=${identity.identityId}`.execute(
      database.db,
    );
    expect(link.rows[0]).toEqual({
      assurance: 'LOW',
      evidence_method: 'LEGACY_ASSOCIATION',
      status: 'LINKED',
    });
  });
});
