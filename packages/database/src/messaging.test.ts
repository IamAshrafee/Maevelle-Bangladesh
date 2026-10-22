import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import * as messaging from './messaging/index.js';
import { processNotificationOutbox } from './notifications.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 8,
});
let organizationId: string;
let otherOrganizationId: string;
let actorId: string;
let membershipId: string;
let connectionId: string;
let identityId: string;
let contactId: string;

beforeAll(async () => {
  organizationId = (
    await createOrganization(database.db, {
      code: `msg-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Messaging Test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    })
  ).id;
  otherOrganizationId = (
    await createOrganization(database.db, {
      code: `msg-other-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Other Messaging Test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    })
  ).id;
  const user = await sql<{
    id: string;
  }>`insert into iam.users(name,email,email_normalized,email_verified,status) values('Messaging Agent',${`agent-${crypto.randomUUID()}@example.test`},${`agent-${crypto.randomUUID()}@example.test`},true,'ACTIVE') returning id`.execute(
    database.db,
  );
  actorId = user.rows[0]!.id;
  const member = await sql<{
    id: string;
  }>`insert into iam.organization_memberships(organization_id,user_id,membership_type,status,display_name,activated_at) values(${organizationId},${actorId},'OWNER','ACTIVE','Messaging Agent',now()) returning id`.execute(
    database.db,
  );
  membershipId = member.rows[0]!.id;
  connectionId = await messaging.createChannelConnection(database.db, {
    organizationId,
    channelKind: 'WEBSITE',
    displayName: 'Test Website',
    status: 'ACTIVE',
  });
});

beforeEach(async () => {
  ({ identityId, contactId } = await messaging.createContactIdentity(database.db, {
    organizationId,
    channelConnectionId: connectionId,
    channelKind: 'WEBSITE',
    externalSubjectId: `visitor-${crypto.randomUUID()}`,
    displayName: 'Visitor',
  }));
});

afterAll(async () => database.close());

const actor = () => ({
  organizationId,
  actorId,
  membershipId,
  capabilities: [
    'messaging.inbox.view_all',
    'messaging.reply',
    'messaging.claim',
    'messaging.status.manage',
    'messaging.assign',
    'messaging.priority.manage',
    'messaging.notes.create',
    'messaging.notes.manage_all',
    'messaging.tags.manage',
    'messaging.saved_replies.use',
    'messaging.saved_replies.manage',
    'messaging.availability.view',
    'messaging.settings.manage',
    'messaging.follow_ups.manage',
    'messaging.customer_context.view',
    'messaging.customer_link.manage',
    'messaging.reports.view',
  ],
});

describe('messaging transactional core', () => {
  it('accepts one canonical outbound message and atomically creates reliability records', async () => {
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: connectionId,
      contactId,
      contactIdentityId: identityId,
    });
    const key = `out-${crypto.randomUUID()}`;
    const first = await messaging.prepareOutboundMessage(database.db, {
      actor: actor(),
      access: 'ALL',
      conversationId,
      idempotencyKey: key,
      clientMessageId: `client-${crypto.randomUUID()}`,
      text: 'Hello from support',
    });
    const replay = await messaging
      .prepareOutboundMessage(database.db, {
        actor: actor(),
        access: 'ALL',
        conversationId,
        idempotencyKey: key,
        clientMessageId: first.message.id,
        text: 'Hello from support',
      })
      .catch((error) => error);
    // The request fingerprint includes the stable client ID, so changing it is a conflict.
    expect(replay).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    const sameClient = `stable-${crypto.randomUUID()}`;
    const sameKey = `same-${crypto.randomUUID()}`;
    const canonical = await messaging.prepareOutboundMessage(database.db, {
      actor: actor(),
      access: 'ALL',
      conversationId,
      idempotencyKey: sameKey,
      clientMessageId: sameClient,
      text: 'Canonical',
    });
    const repeated = await messaging.prepareOutboundMessage(database.db, {
      actor: actor(),
      access: 'ALL',
      conversationId,
      idempotencyKey: sameKey,
      clientMessageId: sameClient,
      text: 'Canonical',
    });
    expect(repeated).toEqual({ ...canonical, replayed: true });
    const clientReplay = await messaging.prepareOutboundMessage(database.db, {
      actor: actor(),
      access: 'ALL',
      conversationId,
      idempotencyKey: `same-client-${crypto.randomUUID()}`,
      clientMessageId: sameClient,
      text: 'Canonical',
    });
    expect(clientReplay).toEqual({ ...canonical, replayed: true });
    await expect(
      messaging.prepareOutboundMessage(database.db, {
        actor: actor(),
        access: 'ALL',
        conversationId,
        idempotencyKey: `changed-client-${crypto.randomUUID()}`,
        clientMessageId: sameClient,
        text: 'Changed body',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    const evidence = await sql<{
      messages: string;
      intents: string;
      events: string;
      outbox: string;
    }>`select
      (select count(*)::text from messaging.messages where id=${canonical.message.id}) messages,
      (select count(*)::text from messaging.delivery_intents where message_id=${canonical.message.id}) intents,
      (select count(*)::text from messaging.realtime_events where aggregate_id=${canonical.message.id}) events,
      (select count(*)::text from platform.outbox_events where aggregate_id=${canonical.message.id}) outbox`.execute(
      database.db,
    );
    expect(evidence.rows[0]).toEqual({ messages: '1', intents: '1', events: '1', outbox: '1' });
  });

  it('allocates contiguous conversation sequences under concurrent inbound acceptance', async () => {
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: connectionId,
      contactId,
      contactIdentityId: identityId,
    });
    const accepted = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        messaging.acceptInboundMessage(database.db, {
          organizationId,
          conversationId,
          contactIdentityId: identityId,
          idempotencyKey: `in-${crypto.randomUUID()}`,
          externalMessageId: `provider-${crypto.randomUUID()}`,
          text: `Inbound ${index}`,
        }),
      ),
    );
    expect(accepted.map((item) => Number(item.message.sequence)).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    const replay = await messaging.acceptInboundMessage(database.db, {
      organizationId,
      conversationId,
      contactIdentityId: identityId,
      idempotencyKey: 'fixed-replay-key',
      externalMessageId: 'fixed-provider-id',
      text: 'Replay me',
    });
    const repeated = await messaging.acceptInboundMessage(database.db, {
      organizationId,
      conversationId,
      contactIdentityId: identityId,
      idempotencyKey: 'fixed-replay-key',
      externalMessageId: 'fixed-provider-id',
      text: 'Replay me',
    });
    expect(repeated.message.id).toBe(replay.message.id);
    expect(repeated.replayed).toBe(true);
    await processNotificationOutbox(database.db, 100);
    const attention = await sql<{
      rendered_body: string;
    }>`select rendered_body from notifications.notifications where organization_id=${organizationId} and source_id=${replay.message.id} and notification_type='MESSAGING_INBOUND_ATTENTION'`.execute(
      database.db,
    );
    expect(attention.rows).toEqual([{ rendered_body: 'A customer conversation needs attention.' }]);
    expect(attention.rows[0]!.rendered_body).not.toContain('Replay me');
  });

  it('hides a conversation from a different organization', async () => {
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: connectionId,
      contactId,
      contactIdentityId: identityId,
    });
    await expect(
      messaging.getConversation(database.db, {
        organizationId: otherOrganizationId,
        conversationId,
        membershipId,
        access: 'ALL',
      }),
    ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
  });

  it('allows only one concurrent claim and keeps replay cursors ordered', async () => {
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: connectionId,
      contactId,
      contactIdentityId: identityId,
    });
    const before = await messaging.getConversation(database.db, {
      organizationId,
      conversationId,
      membershipId,
      access: 'ALL',
    });
    const claims = await Promise.allSettled(
      [1, 2].map(() =>
        messaging.claimConversation(database.db, {
          actor: actor(),
          access: 'ALL',
          conversationId,
          expectedVersion: before.version,
        }),
      ),
    );
    expect(claims.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(claims.filter((item) => item.status === 'rejected')).toHaveLength(1);
    await Promise.all(
      Array.from({ length: 6 }, () =>
        messaging.appendRealtimeEvent(database.db, {
          organizationId,
          audienceType: 'ORGANIZATION',
          eventType: 'messaging.inbox.invalidated.v1',
          aggregateId: conversationId,
          aggregateVersion: 1,
          payload: { conversationId },
        }),
      ),
    );
    const events = await messaging.listRealtimeEvents(database.db, {
      organizationId,
      membershipId,
      access: 'ALL',
      after: '0',
      limit: 200,
    });
    const cursors = events.map((event) => BigInt(event.cursor));
    expect(cursors).toEqual([...cursors].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(new Set(cursors.map(String)).size).toBe(cursors.length);
    const last = events.at(-1)!;
    await sql`update messaging.realtime_events set expires_at=now()-interval '1 second' where organization_id=${organizationId} and stream_sequence<=${last.cursor}::bigint`.execute(
      database.db,
    );
    await messaging.purgeExpiredRealtimeEvents(database.db);
    await messaging.appendRealtimeEvent(database.db, {
      organizationId,
      audienceType: 'ORGANIZATION',
      eventType: 'messaging.inbox.invalidated.v1',
      aggregateId: conversationId,
      aggregateVersion: 2,
      payload: { conversationId },
    });
    await expect(
      messaging.listRealtimeEvents(database.db, {
        organizationId,
        membershipId,
        access: 'ALL',
        after: String(BigInt(last.cursor) - 1n),
      }),
    ).rejects.toMatchObject({ code: 'EVENT_CURSOR_EXPIRED' });
  });

  it('records adapter outcomes and does not claim work for absent adapters', async () => {
    const empty = new messaging.ChannelAdapterRegistry();
    expect(await messaging.processMessagingDeliveries(database.db, empty, 'test-empty', 5)).toBe(0);
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: connectionId,
      contactId,
      contactIdentityId: identityId,
    });
    const outbound = await messaging.prepareOutboundMessage(database.db, {
      actor: actor(),
      access: 'ALL',
      conversationId,
      idempotencyKey: `delivery-${crypto.randomUUID()}`,
      clientMessageId: `delivery-client-${crypto.randomUUID()}`,
      text: 'Deliver me',
    });
    const registry = new messaging.ChannelAdapterRegistry();
    registry.register({
      kind: 'WEBSITE',
      deliver: async () => ({ type: 'ACCEPTED', providerMessageId: `sent-${crypto.randomUUID()}` }),
    });
    expect(
      await messaging.processMessagingDeliveries(database.db, registry, 'test-worker', 20),
    ).toBeGreaterThanOrEqual(1);
    const delivered = await sql<{
      delivery_state: string;
      status: string;
      attempts: string;
    }>`select m.delivery_state,di.status,(select count(*)::text from messaging.delivery_attempts da where da.intent_id=di.id) attempts from messaging.messages m join messaging.delivery_intents di on di.message_id=m.id where m.id=${outbound.message.id}`.execute(
      database.db,
    );
    expect(delivered.rows[0]).toEqual({
      delivery_state: 'SENT',
      status: 'SUCCEEDED',
      attempts: '1',
    });

    const outcomes = [
      { type: 'TRANSIENT_FAILURE' as const, code: 'TEMPORARY' },
      { type: 'PERMANENT_FAILURE' as const, code: 'REJECTED', safeMessage: 'Rejected by channel.' },
      { type: 'UNKNOWN' as const, code: 'TIMEOUT', reconciliationKey: 'lookup-1' },
    ];
    const messages = [];
    for (const outcome of outcomes) {
      const accepted = await messaging.prepareOutboundMessage(database.db, {
        actor: actor(),
        access: 'ALL',
        conversationId,
        idempotencyKey: `outcome-${crypto.randomUUID()}`,
        clientMessageId: `outcome-client-${crypto.randomUUID()}`,
        text: `Outcome ${outcome.type}`,
      });
      messages.push(accepted.message.id);
    }
    const outcomeRegistry = new messaging.ChannelAdapterRegistry();
    outcomeRegistry.register({ kind: 'WEBSITE', deliver: async () => outcomes.shift()! });
    expect(
      await messaging.processMessagingDeliveries(database.db, outcomeRegistry, 'test-outcomes', 3),
    ).toBe(3);
    const states = await sql<{
      delivery_state: string;
      status: string;
    }>`select m.delivery_state,di.status from messaging.messages m join messaging.delivery_intents di on di.message_id=m.id where m.id in (${sql.join(messages)}) order by m.sequence`.execute(
      database.db,
    );
    expect(states.rows).toEqual([
      { delivery_state: 'FAILED_TRANSIENT', status: 'RETRY_WAIT' },
      { delivery_state: 'FAILED_PERMANENT', status: 'FAILED_FINAL' },
      { delivery_state: 'UNKNOWN', status: 'RECONCILIATION_REQUIRED' },
    ]);
    await sql`update messaging.delivery_intents set status='PROCESSING',lease_owner='dead-worker',lease_expires_at=now()-interval '1 second' where message_id=${messages[0]}`.execute(
      database.db,
    );
    expect(await messaging.reclaimExpiredMessagingDeliveries(database.db)).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('enforces eligible tenant assignment and records auditable assignment history', async () => {
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: connectionId,
      contactId,
      contactIdentityId: identityId,
    });
    const outsiderUser = await sql<{
      id: string;
    }>`insert into iam.users(name,email,email_normalized,email_verified,status)
      values('Outsider',${`outsider-${crypto.randomUUID()}@example.test`},${`outsider-${crypto.randomUUID()}@example.test`},true,'ACTIVE') returning id`.execute(
      database.db,
    );
    const outsider = await sql<{
      id: string;
    }>`insert into iam.organization_memberships(organization_id,user_id,membership_type,status,display_name,activated_at)
      values(${otherOrganizationId},${outsiderUser.rows[0]!.id},'OWNER','ACTIVE','Outsider',now()) returning id`.execute(
      database.db,
    );
    const before = await messaging.getConversation(database.db, {
      organizationId,
      conversationId,
      membershipId,
      access: 'ALL',
    });
    await expect(
      messaging.assignConversation(database.db, {
        actor: actor(),
        access: 'ALL',
        conversationId,
        assigneeMembershipId: outsider.rows[0]!.id,
        expectedVersion: before.version,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const assigned = await messaging.assignConversation(database.db, {
      actor: actor(),
      access: 'ALL',
      conversationId,
      assigneeMembershipId: membershipId,
      expectedVersion: before.version,
      reason: 'Owner accepted the conversation.',
    });
    expect(assigned.assignee?.membershipId).toBe(membershipId);
    const history = await messaging.listAssignmentHistory(database.db, {
      actor: actor(),
      access: 'ALL',
      conversationId,
    });
    expect(history[0]).toMatchObject({
      newAssigneeMembershipId: membershipId,
      source: 'MANUAL',
      reason: 'Owner accepted the conversation.',
    });
  });

  it('keeps notes private, tenant-qualifies tags, and does not send saved replies', async () => {
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: connectionId,
      contactId,
      contactIdentityId: identityId,
    });
    const note = await messaging.createInternalNote(database.db, {
      actor: actor(),
      access: 'ALL',
      conversationId,
      body: 'Private staff evidence',
    });
    expect(
      (
        await messaging.listInternalNotes(database.db, {
          actor: actor(),
          access: 'ALL',
          conversationId,
        })
      )[0]?.id,
    ).toBe(note.id);
    const leaked = await sql<{ count: string }>`select count(*)::text count from messaging.messages
      where organization_id=${organizationId} and conversation_id=${conversationId}
        and (direction='INTERNAL' or text_body='Private staff evidence')`.execute(database.db);
    expect(leaked.rows[0]!.count).toBe('0');
    const revisedNote = await messaging.updateInternalNote(database.db, {
      actor: actor(),
      noteId: note.id,
      body: 'Private staff evidence, corrected',
      expectedRevision: note.revision,
    });
    expect(revisedNote).toMatchObject({ revision: 2, body: 'Private staff evidence, corrected' });
    const revisions = await sql<{
      id: string;
      superseded_by_note_id: string | null;
    }>`select id,superseded_by_note_id from messaging.internal_notes
      where organization_id=${organizationId} and conversation_id=${conversationId} order by revision`.execute(
      database.db,
    );
    expect(revisions.rows).toEqual([
      { id: note.id, superseded_by_note_id: revisedNote.id },
      { id: revisedNote.id, superseded_by_note_id: null },
    ]);
    const tag = await messaging.createMessagingTag(database.db, {
      actor: actor(),
      label: 'Delivery issue',
      colorToken: 'warning',
    });
    await messaging.setConversationTag(database.db, {
      actor: actor(),
      access: 'ALL',
      conversationId,
      tagId: tag.id,
      assigned: true,
    });
    const listed = await messaging.listConversations(database.db, {
      organizationId,
      membershipId,
      access: 'ALL',
      tagId: tag.id,
    });
    expect(listed.data[0]?.tags?.map((item) => item.id)).toContain(tag.id);
    const beforeMessages = await sql<{
      count: string;
    }>`select count(*)::text count from messaging.messages where organization_id=${organizationId} and conversation_id=${conversationId}`.execute(
      database.db,
    );
    await messaging.createSavedReply(database.db, {
      actor: actor(),
      title: 'Delivery update',
      body: 'We are checking your delivery now.',
      shortcut: 'delivery-update',
    });
    const afterMessages = await sql<{
      count: string;
    }>`select count(*)::text count from messaging.messages where organization_id=${organizationId} and conversation_id=${conversationId}`.execute(
      database.db,
    );
    expect(afterMessages.rows[0]!.count).toBe(beforeMessages.rows[0]!.count);
  });

  it('evaluates overnight business hours and delivers each due follow-up once', async () => {
    await messaging.upsertBusinessHours(database.db, {
      actor: actor(),
      connectionId,
      timezone: 'UTC',
      weeklySchedule: { mon: [{ start: '22:00', end: '02:00' }] },
      offlineAcceptsMessages: true,
    });
    expect(
      (
        await messaging.evaluateBusinessHours(database.db, {
          organizationId,
          connectionId,
          at: new Date('2026-10-19T23:00:00Z'),
        })
      ).isOpen,
    ).toBe(true);
    expect(
      (
        await messaging.evaluateBusinessHours(database.db, {
          organizationId,
          connectionId,
          at: new Date('2026-10-20T01:00:00Z'),
        })
      ).isOpen,
    ).toBe(true);
    expect(
      (
        await messaging.evaluateBusinessHours(database.db, {
          organizationId,
          connectionId,
          at: new Date('2026-10-20T03:00:00Z'),
        })
      ).isOpen,
    ).toBe(false);
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: connectionId,
      contactId,
      contactIdentityId: identityId,
    });
    const followUp = await messaging.createFollowUp(database.db, {
      actor: actor(),
      access: 'ALL',
      conversationId,
      responsibleMembershipId: membershipId,
      dueAt: new Date(Date.now() - 1000).toISOString(),
      note: 'Call customer',
    });
    expect(await messaging.processDueMessagingFollowUps(database.db)).toBeGreaterThanOrEqual(1);
    expect(await messaging.processDueMessagingFollowUps(database.db)).toBe(0);
    await processNotificationOutbox(database.db, 100);
    const notifications = await sql<{
      count: string;
    }>`select count(*)::text count from notifications.notifications where organization_id=${organizationId} and notification_type='MESSAGING_FOLLOW_UP_DUE' and membership_id=${membershipId} and source_id=${followUp.id}`.execute(
      database.db,
    );
    expect(notifications.rows[0]!.count).toBe('1');
  });

  it('binds inbox cursors to filters and applies bounded bulk/routing operations', async () => {
    const conversations = await Promise.all(
      [1, 2].map(async () => {
        const identity = await messaging.createContactIdentity(database.db, {
          organizationId,
          channelConnectionId: connectionId,
          channelKind: 'WEBSITE',
          externalSubjectId: `bulk-${crypto.randomUUID()}`,
        });
        return messaging.createConversation(database.db, {
          organizationId,
          channelConnectionId: connectionId,
          contactId: identity.contactId,
          contactIdentityId: identity.identityId,
        });
      }),
    );
    const firstPage = await messaging.listConversations(database.db, {
      organizationId,
      membershipId,
      access: 'ALL',
      limit: 1,
    });
    await expect(
      messaging.listConversations(database.db, {
        organizationId,
        membershipId,
        access: 'ALL',
        status: 'OPEN',
        cursor: firstPage.pagination.nextCursor!,
        limit: 1,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const items = await Promise.all(
      conversations.map(async (conversationId) => ({
        conversationId,
        version: (
          await messaging.getConversation(database.db, {
            organizationId,
            membershipId,
            access: 'ALL',
            conversationId,
          })
        ).version,
      })),
    );
    const outcomes = await messaging.bulkUpdateConversations(database.db, {
      actor: actor(),
      access: 'ALL',
      items,
      action: { type: 'PRIORITY', priority: 'HIGH', isStarred: true },
    });
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
    await messaging.createAssignmentRule(database.db, {
      actor: actor(),
      name: 'Website default owner',
      position: 999,
      conditions: { channelKind: 'WEBSITE' },
      actions: { assign: 'DEFAULT', membershipId },
    });
    const routedIdentity = await messaging.createContactIdentity(database.db, {
      organizationId,
      channelConnectionId: connectionId,
      channelKind: 'WEBSITE',
      externalSubjectId: `routed-${crypto.randomUUID()}`,
    });
    const routedConversation = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: connectionId,
      contactId: routedIdentity.contactId,
      contactIdentityId: routedIdentity.identityId,
    });
    expect(
      await messaging.processMessagingAssignmentRules(database.db, 100),
    ).toBeGreaterThanOrEqual(1);
    expect(
      (
        await messaging.getConversation(database.db, {
          organizationId,
          membershipId,
          access: 'ALL',
          conversationId: routedConversation,
        })
      ).assignee?.membershipId,
    ).toBe(membershipId);
  });
});

describe('Facebook messaging provider boundaries', () => {
  it('durably deduplicates batched webhook events and scopes identities by Page connection', async () => {
    const pageId = `page-${crypto.randomUUID()}`;
    const facebookConnectionId = await messaging.createChannelConnection(database.db, {
      organizationId,
      channelKind: 'FACEBOOK',
      displayName: 'Facebook Test Page',
      status: 'ACTIVE',
    });
    await sql`update messaging.channel_connections set provider_account_id=${pageId} where id=${facebookConnectionId}`.execute(
      database.db,
    );
    const entry = [
      {
        id: pageId,
        messaging: [
          {
            sender: { id: 'psid-1' },
            recipient: { id: pageId },
            timestamp: Date.now(),
            message: { mid: `mid.${crypto.randomUUID()}`, text: 'হ্যালো 👋' },
          },
          {
            sender: { id: 'psid-1' },
            recipient: { id: pageId },
            timestamp: Date.now(),
            message: { mid: `mid.${crypto.randomUUID()}`, text: 'Second' },
          },
        ],
      },
    ];
    expect(await messaging.acceptFacebookWebhookEvents(database.db, entry)).toMatchObject({
      accepted: 2,
      duplicates: 0,
    });
    expect(await messaging.acceptFacebookWebhookEvents(database.db, entry)).toMatchObject({
      accepted: 0,
      duplicates: 2,
    });
    const resolved = await Promise.all(
      Array.from({ length: 4 }, () =>
        messaging.resolveFacebookConversation(database.db, {
          organizationId,
          connectionId: facebookConnectionId,
          senderId: 'psid-1',
        }),
      ),
    );
    expect(new Set(resolved.map((item) => item.conversationId)).size).toBe(1);
    expect(new Set(resolved.map((item) => item.contactIdentityId)).size).toBe(1);
  });

  it('enforces the Facebook reply window before a delivery intent is accepted', async () => {
    const facebookConnectionId = await messaging.createChannelConnection(database.db, {
      organizationId,
      channelKind: 'FACEBOOK',
      displayName: 'Window Page',
      status: 'ACTIVE',
      capabilities: { attachments: true },
    });
    await sql`update messaging.channel_connections set provider_account_id=${`page-${crypto.randomUUID()}`} where id=${facebookConnectionId}`.execute(
      database.db,
    );
    const identity = await messaging.createContactIdentity(database.db, {
      organizationId,
      channelConnectionId: facebookConnectionId,
      channelKind: 'FACEBOOK',
      externalSubjectId: 'psid-window',
    });
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: facebookConnectionId,
      contactId: identity.contactId,
      contactIdentityId: identity.identityId,
    });
    await expect(
      messaging.prepareOutboundMessage(database.db, {
        actor: actor(),
        access: 'ALL',
        conversationId,
        idempotencyKey: crypto.randomUUID(),
        clientMessageId: crypto.randomUUID(),
        text: 'Too late',
      }),
    ).rejects.toMatchObject({ code: 'REPLY_WINDOW_CLOSED' });
    await sql`update messaging.conversations set reply_eligible_until=now()+interval '1 hour' where id=${conversationId}`.execute(
      database.db,
    );
    await expect(
      messaging.prepareOutboundMessage(database.db, {
        actor: actor(),
        access: 'ALL',
        conversationId,
        idempotencyKey: crypto.randomUUID(),
        clientMessageId: crypto.randomUUID(),
        text: 'Allowed',
      }),
    ).resolves.toMatchObject({ replayed: false });
  });
});
