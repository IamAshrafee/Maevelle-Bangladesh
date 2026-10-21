import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { completeMediaUploadSession, createMediaUploadSession } from './media.js';
import * as messaging from './messaging/index.js';
import { createOrganization } from './platform.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 12,
});
const digestKey = Buffer.alloc(32, 7);
let organizationId: string;
let actorId: string;
let membershipId: string;

beforeAll(async () => {
  organizationId = (
    await createOrganization(database.db, {
      code: `storefront-chat-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Storefront Chat Test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    })
  ).id;
  const email = `storefront-agent-${crypto.randomUUID()}@example.test`;
  const actor = await sql<{ id: string }>`insert into iam.users(name,email,email_normalized,email_verified,status)
    values('Storefront Agent',${email},${email},true,'ACTIVE') returning id`.execute(database.db);
  actorId = actor.rows[0]!.id;
  const membership = await sql<{ id: string }>`insert into iam.organization_memberships(
      organization_id,user_id,membership_type,status,display_name,activated_at
    ) values(${organizationId},${actorId},'OWNER','ACTIVE','Storefront Agent',now()) returning id`.execute(
    database.db,
  );
  membershipId = membership.rows[0]!.id;
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
  ],
});

async function issueVisitor() {
  const issued = await messaging.createOrResumeVisitorSession(database.db, {
    organizationId,
    digestKey,
    context: { pageType: 'OTHER', path: '/help/contact' },
  });
  const visitor = await messaging.authenticateVisitorCredential(database.db, {
    organizationId,
    credential: issued.credential,
    digestKey,
  });
  return { issued, visitor };
}

describe('storefront website chat', () => {
  it('resumes a durable visitor and converges concurrent starts on one active conversation', async () => {
    const { issued, visitor } = await issueVisitor();
    const resumed = await messaging.createOrResumeVisitorSession(database.db, {
      organizationId,
      credential: issued.credential,
      digestKey,
      context: { pageType: 'OTHER', path: '/returns' },
    });
    expect(resumed.created).toBe(false);
    expect(resumed.session.id).toBe(issued.session.id);
    expect(resumed.conversation.id).toBe(issued.conversation.id);

    const concurrent = await Promise.all(
      Array.from({ length: 6 }, () =>
        messaging.startVisitorConversation(database.db, visitor, {
          pageType: 'OTHER',
          path: '/shipping',
        }),
      ),
    );
    expect(new Set(concurrent.map((item) => item.id))).toEqual(
      new Set([issued.conversation.id]),
    );
    const count = await sql<{ count: string }>`select count(*)::text count from messaging.conversations
      where organization_id=${organizationId} and contact_identity_id=${visitor.contactIdentityId}
        and channel_kind='WEBSITE' and status in ('NEW','OPEN','PENDING','RESOLVED')`.execute(
      database.db,
    );
    expect(count.rows[0]!.count).toBe('1');
  });

  it('keeps history and realtime replay scoped to the authenticated visitor', async () => {
    const first = await issueVisitor();
    const second = await issueVisitor();
    const inbound = await messaging.sendVisitorMessage(database.db, {
      visitor: first.visitor,
      conversationId: first.issued.conversation.id,
      idempotencyKey: crypto.randomUUID(),
      clientMessageId: crypto.randomUUID(),
      text: 'Private visitor message',
    });
    await messaging.markConversationRead(database.db, {
      organizationId,
      conversationId: first.issued.conversation.id,
      membershipId,
      access: 'ALL',
      lastReadSequence: inbound.message.sequence,
    });

    await expect(
      messaging.getVisitorConversation(
        database.db,
        second.visitor,
        first.issued.conversation.id,
      ),
    ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
    const secondEvents = await messaging.listVisitorRealtimeEvents(database.db, {
      visitor: second.visitor,
      after: '0',
    });
    expect(
      secondEvents.some((event) => event.conversationId === first.issued.conversation.id),
    ).toBe(false);
    const firstEvents = await messaging.listVisitorRealtimeEvents(database.db, {
      visitor: first.visitor,
      after: '0',
    });
    expect(
      firstEvents.some(
        (event) =>
          event.conversationId === first.issued.conversation.id &&
          event.type === 'messaging.message.created.v1',
      ),
    ).toBe(true);
    expect(
      firstEvents.some((event) => event.payload.readerScope === 'MEMBERSHIP'),
    ).toBe(false);
  });

  it('makes visitor sends idempotent and rejects revoked credentials', async () => {
    const { issued, visitor } = await issueVisitor();
    const idempotencyKey = crypto.randomUUID();
    const clientMessageId = crypto.randomUUID();
    const first = await messaging.sendVisitorMessage(database.db, {
      visitor,
      conversationId: issued.conversation.id,
      idempotencyKey,
      clientMessageId,
      text: 'Please help with my order',
    });
    const replay = await messaging.sendVisitorMessage(database.db, {
      visitor,
      conversationId: issued.conversation.id,
      idempotencyKey,
      clientMessageId,
      text: 'Please help with my order',
    });
    expect(replay.replayed).toBe(true);
    expect(replay.message.id).toBe(first.message.id);
    const sameClientRetry = await messaging.sendVisitorMessage(database.db, {
      visitor,
      conversationId: issued.conversation.id,
      idempotencyKey: crypto.randomUUID(),
      clientMessageId,
      text: 'Please help with my order',
    });
    expect(sameClientRetry).toMatchObject({ replayed: true, message: { id: first.message.id } });
    await expect(
      messaging.sendVisitorMessage(database.db, {
        visitor,
        conversationId: issued.conversation.id,
        idempotencyKey: crypto.randomUUID(),
        clientMessageId,
        text: 'Different input under a new key',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    await expect(
      messaging.sendVisitorMessage(database.db, {
        visitor,
        conversationId: issued.conversation.id,
        idempotencyKey,
        clientMessageId,
        text: 'Different input',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });

    await messaging.revokeVisitorSession(database.db, visitor);
    await expect(
      messaging.authenticateVisitorCredential(database.db, {
        organizationId,
        credential: issued.credential,
        digestKey,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('links only through an authenticated customer account and rotates the visitor credential', async () => {
    const { issued, visitor } = await issueVisitor();
    const customer = await sql<{ id: string }>`insert into customers.customers(
      organization_id,customer_number,display_name,first_source,latest_source
    ) values (${organizationId},${`CUS-${crypto.randomUUID()}`},'Linked Customer','STOREFRONT','STOREFRONT')
      returning id`.execute(database.db);
    await sql`insert into customers.customer_accounts(
      organization_id,customer_id,user_id,link_type,status
    ) values (${organizationId},${customer.rows[0]!.id},${actorId},'VERIFIED_EMAIL','ACTIVE')`.execute(
      database.db,
    );

    const linked = await messaging.linkVisitorToAuthenticatedUser(database.db, {
      visitor,
      userId: actorId,
      digestKey,
    });
    expect(linked.credential).not.toBe('');
    expect(linked.session.isCustomerLinked).toBe(true);
    await expect(
      messaging.authenticateVisitorCredential(database.db, {
        organizationId,
        credential: issued.credential,
        digestKey,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    const rotated = await messaging.authenticateVisitorCredential(database.db, {
      organizationId,
      credential: linked.credential,
      digestKey,
    });
    expect(rotated.customerId).toBe(customer.rows[0]!.id);
    const evidence = await sql<{ count: string }>`select count(*)::text count
      from messaging.contact_customer_link_events where organization_id=${organizationId}
        and contact_id=${visitor.contactId} and customer_id=${customer.rows[0]!.id}
        and action='LINKED' and method='AUTHENTICATED_ACCOUNT'`.execute(database.db);
    expect(evidence.rows[0]!.count).toBe('1');
  });

  it('delivers staff replies through the website channel and records visitor read evidence', async () => {
    const { issued, visitor } = await issueVisitor();
    const outbound = await messaging.prepareOutboundMessage(database.db, {
      actor: actor(),
      access: 'ALL',
      conversationId: issued.conversation.id,
      idempotencyKey: crypto.randomUUID(),
      clientMessageId: crypto.randomUUID(),
      text: 'A support reply',
    });
    const registry = new messaging.ChannelAdapterRegistry();
    registry.register({
      kind: 'WEBSITE',
      deliver: async (command) => ({
        type: 'ACCEPTED',
        providerMessageId: `website:${command.messageId}`,
      }),
    });
    expect(
      await messaging.processMessagingDeliveries(database.db, registry, 'storefront-test', 100),
    ).toBeGreaterThanOrEqual(1);

    const history = await messaging.listVisitorMessages(database.db, {
      visitor,
      conversationId: issued.conversation.id,
    });
    expect(history.data).toEqual([
      expect.objectContaining({
        id: outbound.message.id,
        delivery: expect.objectContaining({ state: 'SENT' }),
      }),
    ]);
    await messaging.markVisitorConversationRead(database.db, {
      visitor,
      conversationId: issued.conversation.id,
      lastReadSequence: outbound.message.sequence,
    });
    const readHistory = await messaging.listVisitorMessages(database.db, {
      visitor,
      conversationId: issued.conversation.id,
    });
    expect(readHistory.data[0]).toMatchObject({
      id: outbound.message.id,
      delivery: { state: 'READ' },
    });
  });

  it('accepts only ready visitor-owned image uploads and protects attachment access', async () => {
    const owner = await issueVisitor();
    const other = await issueVisitor();
    const ownerHash = messaging.visitorMediaOwnerHash(
      digestKey,
      owner.visitor.contactIdentityId,
    );
    const checksum = 'a'.repeat(64);
    const media = await createMediaUploadSession(database.db, {
      organizationId,
      uploadSource: 'MESSAGING_ATTACHMENT',
      guestOwnerHash: ownerHash,
      originalFilename: 'question.png',
      declaredMimeType: 'image/png',
      declaredByteSize: 68,
      visibility: 'PRIVATE',
      storageProvider: 'local',
      bucket: 'private',
      objectKey: (assetId) => `messaging/${assetId}/question.png`,
      expiresAt: new Date(Date.now() + 15 * 60_000),
      maximumBytes: messaging.WEBSITE_ATTACHMENT_MAX_BYTES,
    });
    await completeMediaUploadSession(database.db, {
      organizationId,
      sessionId: media.id,
      actualByteSize: 68,
      actualContentType: 'image/png',
      checksumSha256: checksum,
      guestOwnerHash: ownerHash,
    });
    const object = await sql<{ id: string }>`select current_object_id id from media.media_assets
      where organization_id=${organizationId} and id=${media.assetId}`.execute(database.db);
    await sql`update media.media_objects set width_px=1,height_px=1,file_format='png'
      where organization_id=${organizationId} and id=${object.rows[0]!.id}`.execute(database.db);
    await sql`insert into media.media_renditions(
      organization_id,asset_id,source_object_id,rendition_key,storage_provider,bucket_name,object_key,
      mime_type,byte_size,checksum_sha256,width_px,height_px,processor_version
    ) values (${organizationId},${media.assetId},${object.rows[0]!.id},'zoom','local','private',
      ${`messaging/${media.assetId}/zoom.webp`},'image/webp',20,${'b'.repeat(64)},1,1,'test-v1')`.execute(
      database.db,
    );
    await sql`update media.media_assets set status='READY',updated_at=now(),version=version+1
      where organization_id=${organizationId} and id=${media.assetId}`.execute(database.db);
    const uploadId = await messaging.registerWebsiteAttachmentUpload(database.db, {
      visitor: owner.visitor,
      conversationId: owner.issued.conversation.id,
      mediaAssetId: media.assetId,
      mediaUploadSessionId: media.id,
      fileName: 'question.png',
      mimeType: 'image/png',
      byteSize: 68,
      sha256: checksum,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    expect(
      await messaging.refreshWebsiteAttachmentUploadStatus(database.db, {
        visitor: owner.visitor,
        uploadId,
      }),
    ).toMatchObject({ status: 'AVAILABLE' });
    const sent = await messaging.sendVisitorMessage(database.db, {
      visitor: owner.visitor,
      conversationId: owner.issued.conversation.id,
      idempotencyKey: crypto.randomUUID(),
      clientMessageId: crypto.randomUUID(),
      attachmentIds: [uploadId],
    });
    expect(sent.message).toMatchObject({ type: 'ATTACHMENT' });
    expect(sent.message.attachments).toHaveLength(1);
    const attachmentId = sent.message.attachments[0]!.id;
    expect(
      await messaging.authorizeVisitorAttachment(database.db, {
        visitor: owner.visitor,
        attachmentId,
      }),
    ).toMatchObject({ assetId: media.assetId, mimeType: 'image/webp' });
    await expect(
      messaging.authorizeVisitorAttachment(database.db, {
        visitor: other.visitor,
        attachmentId,
      }),
    ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
  });
});
