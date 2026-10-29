import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import * as messaging from './messaging/index.js';
import * as facebook from './messaging/facebook.js';
import * as instagram from './messaging/instagram.js';
import { processNotificationOutbox } from './notifications.js';
import {
  bulkTrashMediaAssets,
  listMediaLibrary,
  registerUploadedMedia,
  trashUnusedMediaAsset,
} from './media.js';

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

it('keeps conversation attachments visible as media usage and out of trash', async () => {
  const conversationId = await messaging.createConversation(database.db, {
    organizationId,
    channelConnectionId: connectionId,
    contactId,
    contactIdentityId: identityId,
  });
  const attached = await registerUploadedMedia(database.db, {
    organizationId,
    objectKey: `messages/${crypto.randomUUID()}.webp`,
    mimeType: 'image/webp',
    byteSize: 64,
    checksumSha256: 'a'.repeat(64),
    visibility: 'PRIVATE',
  });
  const unused = await registerUploadedMedia(database.db, {
    organizationId,
    objectKey: `messages/${crypto.randomUUID()}.webp`,
    mimeType: 'image/webp',
    byteSize: 64,
    checksumSha256: 'b'.repeat(64),
    visibility: 'PRIVATE',
  });
  const message = await sql<{ id: string }>`insert into messaging.messages
    (organization_id,conversation_id,sequence,direction,sender_type,message_type,delivery_state)
    values(${organizationId},${conversationId},1,'INBOUND','PROVIDER','ATTACHMENT','RECEIVED')
    returning id::text`.execute(database.db);
  await sql`insert into messaging.message_attachments
    (organization_id,message_id,media_asset_id,position,kind,security_status)
    values(${organizationId},${message.rows[0]!.id},${attached.id},0,'IMAGE','AVAILABLE')`.execute(database.db);

  const library = await listMediaLibrary(database.db, {
    organizationId, page: 1, pageSize: 100, unused: true,
  });
  expect(library.items.map((asset) => asset.id)).toContain(unused.id);
  expect(library.items.map((asset) => asset.id)).not.toContain(attached.id);
  const detail = (await listMediaLibrary(database.db, organizationId)).find(
    (asset) => asset.id === attached.id,
  );
  expect(detail?.usages).toEqual([
    expect.objectContaining({ domain: 'messaging', conversationId, label: 'Conversation attachment' }),
  ]);
  await expect(trashUnusedMediaAsset(database.db, {
    organizationId, assetId: attached.id,
  })).rejects.toMatchObject({ code: 'MEDIA_IN_USE', details: { usageCount: 1 } });
  expect(await bulkTrashMediaAssets(database.db, {
    organizationId, assetIds: [attached.id, unused.id],
  })).toMatchObject({ trashedCount: 1, inUseCount: 1, trashedAssetIds: [unused.id] });
  const states = await sql<{ id: string; status: string }>`select id::text,status
    from media.media_assets where organization_id=${organizationId}
      and id in (${attached.id}::uuid,${unused.id}::uuid)`.execute(database.db);
  expect(states.rows).toEqual(expect.arrayContaining([
    { id: attached.id, status: 'READY' },
    { id: unused.id, status: 'TRASHED' },
  ]));
});

it('rejects availability writes from a non-agent membership before changing state', async () => {
  const email = `non-agent-${crypto.randomUUID()}@example.test`;
  const user = await sql<{
    id: string;
  }>`insert into iam.users(name,email,email_normalized,email_verified,status)
    values('Non-agent',${email},${email},true,'ACTIVE') returning id`.execute(database.db);
  const member = await sql<{ id: string }>`insert into iam.organization_memberships
    (organization_id,user_id,membership_type,status,display_name,activated_at)
    values(${organizationId},${user.rows[0]!.id},'STANDARD','ACTIVE','Non-agent',now()) returning id`.execute(
    database.db,
  );
  const membershipId = member.rows[0]!.id;
  const unauthorized = {
    organizationId,
    actorId: user.rows[0]!.id,
    membershipId,
    capabilities: [],
  };

  await expect(
    messaging.setAgentAvailability(database.db, {
      actor: unauthorized,
      status: 'ONLINE',
      capacity: 1,
    }),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  const rows = await sql<{
    membership_id: string;
  }>`select membership_id from messaging.agent_availability
    where organization_id=${organizationId} and membership_id=${membershipId}`.execute(database.db);
  expect(rows.rows).toHaveLength(0);

  await sql`insert into messaging.agent_availability(organization_id,membership_id,status,capacity,last_heartbeat_at)
    values(${organizationId},${membershipId},'OFFLINE',0,now())`.execute(database.db);
  const before = await sql<{
    version: string;
  }>`select version::text from messaging.agent_availability
    where organization_id=${organizationId} and membership_id=${membershipId}`.execute(database.db);
  await expect(
    messaging.heartbeatAgentAvailability(database.db, unauthorized),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  const after = await sql<{
    version: string;
  }>`select version::text from messaging.agent_availability
    where organization_id=${organizationId} and membership_id=${membershipId}`.execute(database.db);
  expect(after.rows[0]?.version).toBe(before.rows[0]?.version);

  const eligible = await messaging.setAgentAvailability(database.db, {
    actor: actor(),
    status: 'ONLINE',
    capacity: 2,
  });
  expect(eligible).toMatchObject({ membershipId: actor().membershipId, status: 'ONLINE' });
  await expect(messaging.heartbeatAgentAvailability(database.db, actor())).resolves.toBeUndefined();
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

  it('does not retry an ambiguous expired delivery or let its stale worker overwrite recovery', async () => {
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
      idempotencyKey: `lease-${crypto.randomUUID()}`,
      clientMessageId: `lease-client-${crypto.randomUUID()}`,
      text: 'Ambiguous delivery',
    });
    await sql`update messaging.delivery_intents set available_at='1900-01-01' where message_id=${outbound.message.id}`.execute(
      database.db,
    );
    let started!: () => void;
    const deliveryStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: () => void;
    const deliveryFinished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const registry = new messaging.ChannelAdapterRegistry();
    registry.register({
      kind: 'WEBSITE',
      deliver: async () => {
        started();
        await deliveryFinished;
        return { type: 'ACCEPTED', providerMessageId: 'late-provider-result' };
      },
    });
    const processing = messaging.processMessagingDeliveries(
      database.db,
      registry,
      'slow-worker',
      1,
    );
    await deliveryStarted;
    await sql`update messaging.delivery_intents set lease_expires_at=now()-interval '1 second' where message_id=${outbound.message.id}`.execute(
      database.db,
    );
    const evidenceBefore = await sql<{
      realtime: string;
      outbox: string;
    }>`select
      (select count(*)::text from messaging.realtime_events where aggregate_id=${outbound.message.id} and event_type='messaging.message.delivery_changed.v1') realtime,
      (select count(*)::text from platform.outbox_events where aggregate_id=${outbound.message.id} and event_type='messaging.message.delivery_changed.v1') outbox`.execute(
      database.db,
    );
    await messaging.reclaimExpiredMessagingDeliveries(database.db);
    finish();
    await processing;
    const result = await sql<{
      status: string;
      delivery_state: string;
    }>`select di.status,m.delivery_state from messaging.delivery_intents di join messaging.messages m on m.id=di.message_id where m.id=${outbound.message.id}`.execute(
      database.db,
    );
    expect(result.rows[0]).toEqual({
      status: 'RECONCILIATION_REQUIRED',
      delivery_state: 'UNKNOWN',
    });
    const evidenceAfter = await sql<{
      realtime: string;
      outbox: string;
      payload: Record<string, unknown>;
    }>`select
      (select count(*)::text from messaging.realtime_events where aggregate_id=${outbound.message.id} and event_type='messaging.message.delivery_changed.v1') realtime,
      (select count(*)::text from platform.outbox_events where aggregate_id=${outbound.message.id} and event_type='messaging.message.delivery_changed.v1') outbox,
      (select payload from messaging.realtime_events where aggregate_id=${outbound.message.id} and event_type='messaging.message.delivery_changed.v1' order by stream_sequence desc limit 1) payload`.execute(
      database.db,
    );
    expect(BigInt(evidenceAfter.rows[0]!.realtime) - BigInt(evidenceBefore.rows[0]!.realtime)).toBe(
      1n,
    );
    expect(BigInt(evidenceAfter.rows[0]!.outbox) - BigInt(evidenceBefore.rows[0]!.outbox)).toBe(1n);
    expect(evidenceAfter.rows[0]!.payload).toMatchObject({
      conversationId,
      messageId: outbound.message.id,
      state: 'UNKNOWN',
      failureCode: 'LEASE_EXPIRED',
    });
  });

  it('rejects stale Meta event and history-sync lease completions', async () => {
    const event = await sql<{ id: string }>`insert into messaging.provider_events(
        provider,provider_account_id,event_key,event_type,payload,status,lease_owner,
        lease_expires_at,attempt_count
      ) values(
        'META_MESSENGER','lease-test-page',${`lease-${crypto.randomUUID()}`},'MESSAGE','{}',
        'PROCESSING','current-event-worker',now()+interval '1 minute',2
      ) returning id::text`.execute(database.db);
    const eventId = event.rows[0]!.id;

    await facebook.completeFacebookProviderEvent(database.db, {
      id: eventId,
      leaseOwner: 'stale-event-worker',
      attemptCount: 1,
      outcome: 'PROCESSED',
    });
    let eventState = await sql<{
      status: string;
      lease_owner: string | null;
    }>`select status,lease_owner
      from messaging.provider_events where id=${eventId}::bigint`.execute(database.db);
    expect(eventState.rows[0]).toEqual({
      status: 'PROCESSING',
      lease_owner: 'current-event-worker',
    });

    await facebook.completeFacebookProviderEvent(database.db, {
      id: eventId,
      leaseOwner: 'current-event-worker',
      attemptCount: 2,
      outcome: 'PROCESSED',
    });
    eventState = await sql<{ status: string; lease_owner: string | null }>`select status,lease_owner
      from messaging.provider_events where id=${eventId}::bigint`.execute(database.db);
    expect(eventState.rows[0]).toEqual({ status: 'PROCESSED', lease_owner: null });

    const sync = await sql<{ id: string }>`insert into messaging.instagram_sync_jobs(
        organization_id,channel_connection_id,requested_by_membership_id,status,lease_owner,
        lease_expires_at
      ) values(
        ${organizationId},${connectionId},${membershipId},'PROCESSING','current-sync-worker',
        now()+interval '1 minute'
      ) returning id`.execute(database.db);
    const syncId = sync.rows[0]!.id;

    await instagram.advanceInstagramSyncJob(database.db, {
      id: syncId,
      leaseOwner: 'stale-sync-worker',
      cursor: null,
      importedMessages: 3,
    });
    let syncState = await sql<{
      status: string;
      lease_owner: string | null;
      imported_messages: number;
    }>`select status,lease_owner,imported_messages from messaging.instagram_sync_jobs
      where id=${syncId}::uuid`.execute(database.db);
    expect(syncState.rows[0]).toEqual({
      status: 'PROCESSING',
      lease_owner: 'current-sync-worker',
      imported_messages: 0,
    });

    await instagram.advanceInstagramSyncJob(database.db, {
      id: syncId,
      leaseOwner: 'current-sync-worker',
      cursor: null,
      importedMessages: 3,
      complete: true,
    });
    syncState = await sql<{
      status: string;
      lease_owner: string | null;
      imported_messages: number;
    }>`select status,lease_owner,imported_messages from messaging.instagram_sync_jobs
      where id=${syncId}::uuid`.execute(database.db);
    expect(syncState.rows[0]).toEqual({
      status: 'COMPLETED',
      lease_owner: null,
      imported_messages: 3,
    });
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
    const pageId = `page-${crypto.randomUUID()}`;
    const integration = await sql<{
      id: string;
    }>`insert into integrations.integrations(organization_id,provider_code,integration_type,name,status) values(${organizationId},'META_MESSENGER','MESSAGING','Facebook Messenger','ACTIVE') on conflict(organization_id,provider_code,integration_type) do update set status='ACTIVE' returning id`.execute(
      database.db,
    );
    const account = await sql<{
      id: string;
    }>`insert into integrations.integration_accounts(organization_id,integration_id,external_account_id,name,status,non_secret_config,secret_reference) values(${organizationId},${integration.rows[0]!.id},${pageId},'Window Page','ACTIVE','{}'::jsonb,'TEST') returning id`.execute(
      database.db,
    );
    await sql`update messaging.channel_connections set provider_account_id=${pageId},integration_account_id=${account.rows[0]!.id} where id=${facebookConnectionId}`.execute(
      database.db,
    );
    await sql`insert into messaging.facebook_connection_state(organization_id,channel_connection_id,integration_account_id,app_id,page_id,status,graph_api_version,granted_scopes,required_scopes,page_tasks,subscribed_fields,permission_review_status,routing_status,webhook_subscription_healthy,credential_healthy) values(${organizationId},${facebookConnectionId},${account.rows[0]!.id},'test-app',${pageId},'CONNECTED','v26.0',${[...messaging.FACEBOOK_REQUIRED_SCOPES]}::text[],${[...messaging.FACEBOOK_REQUIRED_SCOPES]}::text[],array['MESSAGING'],${[...messaging.FACEBOOK_WEBHOOK_FIELDS]}::text[],'ADVANCED_ACCESS_CONFIRMED','OWNER_CONFIRMED',true,true)`.execute(
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

  it('imports historical messages without reopening or reordering an existing conversation', async () => {
    const facebookConnectionId = await messaging.createChannelConnection(database.db, {
      organizationId,
      channelKind: 'FACEBOOK',
      displayName: 'Historical Page',
      status: 'ACTIVE',
    });
    await sql`update messaging.channel_connections set provider_account_id=${`page-${crypto.randomUUID()}`} where id=${facebookConnectionId}`.execute(
      database.db,
    );
    const senderId = `psid-history-${crypto.randomUUID()}`;
    const identity = await messaging.createContactIdentity(database.db, {
      organizationId,
      channelConnectionId: facebookConnectionId,
      channelKind: 'FACEBOOK',
      externalSubjectId: senderId,
    });
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: facebookConnectionId,
      contactId: identity.contactId,
      contactIdentityId: identity.identityId,
    });
    const currentActivity = new Date('2026-10-20T12:00:00.000Z');
    await sql`update messaging.conversations set status='RESOLVED',resolved_at=now(),last_message_at=${currentActivity},last_inbound_at=${currentActivity} where id=${conversationId}`.execute(
      database.db,
    );

    await messaging.ingestHistoricalFacebookMessage(database.db, {
      organizationId,
      connectionId: facebookConnectionId,
      senderId,
      fromPage: false,
      messageId: `history-${crypto.randomUUID()}`,
      text: 'An older customer message',
      providerCreatedAt: new Date('2025-01-01T00:00:00.000Z'),
      providerConversationId: `thread-${crypto.randomUUID()}`,
    });

    const state = await sql<{
      status: string;
      last_message_at: Date;
      last_inbound_at: Date;
    }>`select status,last_message_at,last_inbound_at from messaging.conversations where id=${conversationId}`.execute(
      database.db,
    );
    expect(state.rows[0]).toMatchObject({ status: 'RESOLVED' });
    expect(state.rows[0]!.last_message_at.toISOString()).toBe(currentActivity.toISOString());
    expect(state.rows[0]!.last_inbound_at.toISOString()).toBe(currentActivity.toISOString());
  });
});

describe('Instagram messaging provider boundaries', () => {
  it('deduplicates account-scoped webhooks and prevents duplicate active conversations', async () => {
    const accountId = `ig-${crypto.randomUUID()}`;
    const instagramConnectionId = await messaging.createChannelConnection(database.db, {
      organizationId,
      channelKind: 'INSTAGRAM',
      displayName: 'Instagram Test Account',
      status: 'ACTIVE',
    });
    await sql`update messaging.channel_connections set provider_account_id=${accountId} where id=${instagramConnectionId}`.execute(
      database.db,
    );
    const entry = [
      {
        id: accountId,
        messaging: [
          {
            sender: { id: 'igsid-1' },
            recipient: { id: accountId },
            timestamp: Date.now(),
            message: { mid: `ig-mid.${crypto.randomUUID()}`, text: 'হ্যালো Instagram 👋' },
          },
        ],
      },
    ];
    expect(await messaging.acceptInstagramWebhookEvents(database.db, entry)).toMatchObject({
      accepted: 1,
      duplicates: 0,
    });
    expect(await messaging.acceptInstagramWebhookEvents(database.db, entry)).toMatchObject({
      accepted: 0,
      duplicates: 1,
    });
    const resolved = await Promise.all(
      Array.from({ length: 4 }, () =>
        messaging.resolveInstagramConversation(database.db, {
          organizationId,
          connectionId: instagramConnectionId,
          senderId: 'igsid-1',
        }),
      ),
    );
    expect(new Set(resolved.map((item) => item.conversationId)).size).toBe(1);
    expect(new Set(resolved.map((item) => item.contactIdentityId)).size).toBe(1);
  });

  it('enforces Instagram authorization and the customer-initiated reply window', async () => {
    const accountId = `ig-${crypto.randomUUID()}`;
    const pageId = `page-${crypto.randomUUID()}`;
    const connectionId = await messaging.createChannelConnection(database.db, {
      organizationId,
      channelKind: 'INSTAGRAM',
      displayName: 'Instagram Window Account',
      status: 'ACTIVE',
      capabilities: { attachments: true },
    });
    const integration = await sql<{
      id: string;
    }>`insert into integrations.integrations(organization_id,provider_code,integration_type,name,status) values(${organizationId},'META_INSTAGRAM','MESSAGING','Instagram Direct','ACTIVE') on conflict(organization_id,provider_code,integration_type) do update set status='ACTIVE' returning id`.execute(
      database.db,
    );
    const account = await sql<{
      id: string;
    }>`insert into integrations.integration_accounts(organization_id,integration_id,external_account_id,name,status,non_secret_config,secret_reference) values(${organizationId},${integration.rows[0]!.id},${accountId},'Instagram Window Account','ACTIVE','{}'::jsonb,'TEST') returning id`.execute(
      database.db,
    );
    await sql`update messaging.channel_connections set provider_account_id=${accountId},integration_account_id=${account.rows[0]!.id} where id=${connectionId}`.execute(
      database.db,
    );
    await sql`insert into messaging.instagram_connection_state(organization_id,channel_connection_id,integration_account_id,app_id,page_id,page_name,instagram_account_id,username,account_type,status,graph_api_version,granted_scopes,required_scopes,page_tasks,subscribed_fields,permission_review_status,webhook_subscription_healthy,credential_healthy) values(${organizationId},${connectionId},${account.rows[0]!.id},'ig-app',${pageId},'Maevelle Facebook Page',${accountId},'maevelle','BUSINESS','CONNECTED','v26.0',${[...messaging.INSTAGRAM_REQUIRED_SCOPES]}::text[],${[...messaging.INSTAGRAM_REQUIRED_SCOPES]}::text[],array['MESSAGING'],${[...messaging.INSTAGRAM_WEBHOOK_FIELDS]}::text[],'ADVANCED_ACCESS_CONFIRMED',true,true)`.execute(
      database.db,
    );
    const identity = await messaging.createContactIdentity(database.db, {
      organizationId,
      channelConnectionId: connectionId,
      channelKind: 'INSTAGRAM',
      externalSubjectId: 'igsid-window',
    });
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: connectionId,
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
        text: 'Unsolicited',
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
        text: 'Eligible reply',
      }),
    ).resolves.toMatchObject({ replayed: false });
  });

  it('reconciles Facebook echo to recover UNKNOWN message delivery and complete intent', async () => {
    const fbConnId = await messaging.createChannelConnection(database.db, {
      organizationId,
      channelKind: 'FACEBOOK',
      displayName: 'Facebook Echo Test',
      status: 'ACTIVE',
    });
    const identity = await messaging.createContactIdentity(database.db, {
      organizationId,
      channelConnectionId: fbConnId,
      channelKind: 'FACEBOOK',
      externalSubjectId: 'psid-echo-test',
    });
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: fbConnId,
      contactId: identity.contactId,
      contactIdentityId: identity.identityId,
    });
    const messageId = crypto.randomUUID();
    const providerMessageId = `mid.fb.${crypto.randomUUID()}`;
    await sql`insert into messaging.messages(id,organization_id,conversation_id,sequence,direction,sender_type,sender_membership_id,message_type,text_body,delivery_state,failed_at,failure_code)
      values(${messageId},${organizationId},${conversationId},100,'OUTBOUND','STAFF',${membershipId},'TEXT','Echo test message','UNKNOWN',now(),'LEASE_EXPIRED')`.execute(
      database.db,
    );
    await sql`insert into messaging.delivery_intents(id,organization_id,message_id,channel_connection_id,status,provider_request_key,last_error_code)
      values(${crypto.randomUUID()},${organizationId},${messageId},${fbConnId},'RECONCILIATION_REQUIRED',${`req-${crypto.randomUUID()}`},'LEASE_EXPIRED')`.execute(
      database.db,
    );
    await sql`insert into messaging.message_external_references(organization_id,message_id,channel_connection_id,reference_type,external_id)
      values(${organizationId},${messageId},${fbConnId},'PROVIDER_MESSAGE',${providerMessageId})`.execute(
      database.db,
    );

    const reconciled = await messaging.reconcileFacebookEcho(database.db, {
      organizationId,
      connectionId: fbConnId,
      providerMessageId,
    });
    expect(reconciled).toBe(true);

    const msgCheck = await sql<{
      delivery_state: string;
      failed_at: string | null;
      failure_code: string | null;
      intent_status: string;
    }>`select m.delivery_state,m.failed_at::text,m.failure_code,di.status as intent_status
       from messaging.messages m
       join messaging.delivery_intents di on di.message_id=m.id
       where m.id=${messageId}`.execute(database.db);

    expect(msgCheck.rows[0]).toEqual({
      delivery_state: 'SENT',
      failed_at: null,
      failure_code: null,
      intent_status: 'SUCCEEDED',
    });

    const events = await sql<{
      count: string;
    }>`select count(*)::text from messaging.realtime_events where aggregate_id=${messageId} and event_type='messaging.message.delivery_changed.v1' and payload->>'state'='SENT'`.execute(
      database.db,
    );
    expect(Number(events.rows[0]!.count)).toBeGreaterThanOrEqual(1);
  });

  it('reconciles Instagram echo to recover UNKNOWN message delivery and complete intent', async () => {
    const igConnId = await messaging.createChannelConnection(database.db, {
      organizationId,
      channelKind: 'INSTAGRAM',
      displayName: 'Instagram Echo Test',
      status: 'ACTIVE',
    });
    const identity = await messaging.createContactIdentity(database.db, {
      organizationId,
      channelConnectionId: igConnId,
      channelKind: 'INSTAGRAM',
      externalSubjectId: 'igsid-echo-test',
    });
    const conversationId = await messaging.createConversation(database.db, {
      organizationId,
      channelConnectionId: igConnId,
      contactId: identity.contactId,
      contactIdentityId: identity.identityId,
    });
    const messageId = crypto.randomUUID();
    const providerMessageId = `mid.ig.${crypto.randomUUID()}`;
    await sql`insert into messaging.messages(id,organization_id,conversation_id,sequence,direction,sender_type,sender_membership_id,message_type,text_body,delivery_state,failed_at,failure_code)
      values(${messageId},${organizationId},${conversationId},101,'OUTBOUND','STAFF',${membershipId},'TEXT','Instagram echo message','UNKNOWN',now(),'LEASE_EXPIRED')`.execute(
      database.db,
    );
    await sql`insert into messaging.delivery_intents(id,organization_id,message_id,channel_connection_id,status,provider_request_key,last_error_code)
      values(${crypto.randomUUID()},${organizationId},${messageId},${igConnId},'RECONCILIATION_REQUIRED',${`req-${crypto.randomUUID()}`},'LEASE_EXPIRED')`.execute(
      database.db,
    );
    await sql`insert into messaging.message_external_references(organization_id,message_id,channel_connection_id,reference_type,external_id)
      values(${organizationId},${messageId},${igConnId},'PROVIDER_MESSAGE',${providerMessageId})`.execute(
      database.db,
    );

    const reconciled = await messaging.reconcileInstagramEcho(database.db, {
      organizationId,
      connectionId: igConnId,
      providerMessageId,
    });
    expect(reconciled).toBe(true);

    const msgCheck = await sql<{
      delivery_state: string;
      failed_at: string | null;
      failure_code: string | null;
      intent_status: string;
    }>`select m.delivery_state,m.failed_at::text,m.failure_code,di.status as intent_status
       from messaging.messages m
       join messaging.delivery_intents di on di.message_id=m.id
       where m.id=${messageId}`.execute(database.db);

    expect(msgCheck.rows[0]).toEqual({
      delivery_state: 'SENT',
      failed_at: null,
      failure_code: null,
      intent_status: 'SUCCEEDED',
    });

    const events = await sql<{
      count: string;
    }>`select count(*)::text from messaging.realtime_events where aggregate_id=${messageId} and event_type='messaging.message.delivery_changed.v1' and payload->>'state'='SENT'`.execute(
      database.db,
    );
    expect(Number(events.rows[0]!.count)).toBeGreaterThanOrEqual(1);
  });
});
