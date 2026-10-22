import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';

import type {
  FacebookConnectionView,
  FacebookEligiblePage,
  FacebookOAuthStatusView,
  FacebookReplyEligibility,
  FacebookSyncView,
} from '@maevelle/contracts/messaging';
import {
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  type EncryptionKey,
} from '@maevelle/security';
import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import { acceptInboundMessage, appendRealtimeEvent, MessagingDomainError } from './index.js';

type Db = Kysely<DatabaseSchema>;
export const FACEBOOK_REQUIRED_SCOPES = [
  'pages_show_list',
  'pages_manage_metadata',
  'pages_messaging',
  'pages_read_engagement',
] as const;
export const FACEBOOK_WEBHOOK_FIELDS = [
  'messages',
  'messaging_postbacks',
  'message_deliveries',
  'message_reads',
] as const;
const WINDOW_MS = 24 * 60 * 60 * 1_000;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

export async function createFacebookOAuthAttempt(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    membershipId: string;
    scopes: readonly string[];
    encryptionKey: EncryptionKey;
  },
) {
  const state = generateOpaqueToken(32);
  const result = await sql<{
    id: string;
    expires_at: Date;
  }>`insert into messaging.facebook_oauth_attempts(organization_id,actor_id,membership_id,state_digest,requested_scopes,expires_at)
    values(${input.organizationId},${input.actorId},${input.membershipId},${digest(state)},${input.scopes}::text[],now()+interval '10 minutes') returning id,expires_at`.execute(
    db,
  );
  return { id: result.rows[0]!.id, state, expiresAt: result.rows[0]!.expires_at.toISOString() };
}

export async function authorizeFacebookOAuthAttempt(
  db: Db,
  input: {
    state: string;
    userToken: string;
    grantedScopes: readonly string[];
    pages: readonly {
      id: string;
      name: string;
      category: string | null;
      tasks: readonly string[];
      accessToken: string;
    }[];
    encryptionKey: EncryptionKey;
  },
): Promise<string> {
  return db.transaction().execute(async (tx) => {
    const found = await sql<{
      id: string;
      organization_id: string;
      status: string;
      expires_at: Date;
    }>`select id,organization_id,status,expires_at from messaging.facebook_oauth_attempts where state_digest=${digest(input.state)} for update`.execute(
      tx,
    );
    const attempt = found.rows[0];
    if (!attempt || attempt.status !== 'PENDING' || attempt.expires_at <= new Date())
      throw new MessagingDomainError(
        'VALIDATION_FAILED',
        'Facebook authorization state is invalid or expired.',
      );
    const safePages: FacebookEligiblePage[] = input.pages.map((page) => {
      const missingTask = !page.tasks.includes('MESSAGING');
      const missingScopes = FACEBOOK_REQUIRED_SCOPES.filter(
        (scope) => !input.grantedScopes.includes(scope),
      );
      return {
        pageId: page.id,
        name: page.name,
        category: page.category,
        tasks: page.tasks,
        grantedScopes: input.grantedScopes,
        isEligible: !missingTask && missingScopes.length === 0,
        ineligibilityReasons: [
          ...(missingTask ? ['PAGE_MESSAGING_TASK_REQUIRED'] : []),
          ...missingScopes.map((scope) => `MISSING_${scope.toUpperCase()}`),
        ],
      };
    });
    const encrypted = encryptSecret(
      JSON.stringify({ userToken: input.userToken, pages: input.pages }),
      input.encryptionKey,
    );
    await sql`update messaging.facebook_oauth_attempts set status='AUTHORIZED',granted_scopes=${input.grantedScopes}::text[],authorization_ciphertext=${encrypted},authorization_key_id=${input.encryptionKey.id},eligible_pages=${JSON.stringify(safePages)}::jsonb,authorized_at=now(),updated_at=now() where id=${attempt.id}`.execute(
      tx,
    );
    return attempt.id;
  });
}

export async function failFacebookOAuthAttempt(db: Db, state: string, code: string): Promise<void> {
  await sql`update messaging.facebook_oauth_attempts set status='FAILED',error_code=${code},updated_at=now() where state_digest=${digest(state)} and status='PENDING'`.execute(
    db,
  );
}

export async function getFacebookOAuthStatus(
  db: Db,
  input: { organizationId: string; actorId: string; membershipId: string; attemptId: string },
): Promise<FacebookOAuthStatusView> {
  const found = await sql<{
    id: string;
    status: FacebookOAuthStatusView['status'];
    eligible_pages: unknown;
    error_code: string | null;
    expires_at: Date;
  }>`select id,case when status in('PENDING','AUTHORIZED','CONSUMED','FAILED') then status else 'EXPIRED' end status,eligible_pages,error_code,expires_at from messaging.facebook_oauth_attempts where organization_id=${input.organizationId} and actor_id=${input.actorId} and membership_id=${input.membershipId} and id=${input.attemptId}::uuid`.execute(
    db,
  );
  const row = found.rows[0];
  if (!row)
    throw new MessagingDomainError(
      'CONVERSATION_NOT_FOUND',
      'Facebook authorization attempt was not found.',
    );
  return {
    attemptId: row.id,
    status: row.expires_at <= new Date() && row.status === 'PENDING' ? 'EXPIRED' : row.status,
    pages: Array.isArray(row.eligible_pages) ? (row.eligible_pages as FacebookEligiblePage[]) : [],
    errorCode: row.error_code,
    expiresAt: row.expires_at.toISOString(),
  };
}

export async function connectFacebookPage(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    membershipId: string;
    attemptId: string;
    pageId: string;
    appId: string;
    graphApiVersion: string;
    requiredScopes: readonly string[];
    encryptionKey: EncryptionKey;
  },
): Promise<string> {
  return db.transaction().execute(async (tx) => {
    const found = await sql<{
      status: string;
      authorization_ciphertext: string | null;
      authorization_key_id: string | null;
      granted_scopes: string[];
      expires_at: Date;
    }>`select status,authorization_ciphertext,authorization_key_id,granted_scopes,expires_at from messaging.facebook_oauth_attempts where organization_id=${input.organizationId} and actor_id=${input.actorId} and membership_id=${input.membershipId} and id=${input.attemptId}::uuid for update`.execute(
      tx,
    );
    const attempt = found.rows[0];
    if (
      !attempt ||
      attempt.status !== 'AUTHORIZED' ||
      attempt.expires_at <= new Date() ||
      !attempt.authorization_ciphertext ||
      attempt.authorization_key_id !== input.encryptionKey.id
    )
      throw new MessagingDomainError(
        'VALIDATION_FAILED',
        'Facebook authorization is not ready for Page selection.',
      );
    const authorization = JSON.parse(
      decryptSecret(attempt.authorization_ciphertext, input.encryptionKey),
    ) as {
      pages: Array<{
        id: string;
        name: string;
        category: string | null;
        tasks: string[];
        accessToken: string;
      }>;
    };
    const page = authorization.pages.find((candidate) => candidate.id === input.pageId);
    if (!page || !page.tasks.includes('MESSAGING'))
      throw new MessagingDomainError(
        'VALIDATION_FAILED',
        'The selected Page is not eligible for Messenger connection.',
      );
    const missingScopes = input.requiredScopes.filter(
      (scope) => !attempt.granted_scopes.includes(scope),
    );
    await sql`select pg_advisory_xact_lock(hashtextextended(${`facebook:${input.appId}:${page.id}`},0))`.execute(
      tx,
    );
    const prior = await sql<{
      organization_id: string;
      channel_connection_id: string;
      integration_account_id: string;
      status: string;
    }>`select organization_id,channel_connection_id,integration_account_id,status from messaging.facebook_connection_state where app_id=${input.appId} and page_id=${page.id} for update`.execute(
      tx,
    );
    if (prior.rows[0]) {
      if (prior.rows[0].organization_id !== input.organizationId)
        throw new MessagingDomainError(
          'VALIDATION_FAILED',
          'This Facebook Page is already owned by another organization and requires an explicit transfer procedure.',
        );
      const status = missingScopes.length ? 'LIMITED_PERMISSIONS' : 'WEBHOOK_INCOMPLETE';
      await sql`update integrations.integration_accounts set name=${page.name},external_account_id=${page.id},status='ACTIVE',updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${prior.rows[0].integration_account_id}`.execute(
        tx,
      );
      await sql`insert into integrations.provider_credentials(integration_account_id,organization_id,secret_ciphertext,secret_key_id) values(${prior.rows[0].integration_account_id},${input.organizationId},${encryptSecret(JSON.stringify({ pageAccessToken: page.accessToken }), input.encryptionKey)},${input.encryptionKey.id}) on conflict(integration_account_id) do update set secret_ciphertext=excluded.secret_ciphertext,secret_key_id=excluded.secret_key_id,credential_version=integrations.provider_credentials.credential_version+1,updated_at=now()`.execute(
        tx,
      );
      await sql`update messaging.channel_connections set display_name=${page.name},status=${missingScopes.length ? 'DEGRADED' : 'ACTIVE'},last_error_code=null,updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${prior.rows[0].channel_connection_id}`.execute(
        tx,
      );
      await sql`update messaging.facebook_connection_state set status=${status},graph_api_version=${input.graphApiVersion},granted_scopes=${attempt.granted_scopes}::text[],required_scopes=${input.requiredScopes}::text[],page_tasks=${page.tasks}::text[],credential_healthy=true,webhook_subscription_healthy=false,subscribed_fields='{}',routing_status=case when ${prior.rows[0].status}='DISCONNECTED' then 'UNVERIFIED' else routing_status end,routing_confirmed_at=case when ${prior.rows[0].status}='DISCONNECTED' then null else routing_confirmed_at end,routing_confirmed_by_actor_id=case when ${prior.rows[0].status}='DISCONNECTED' then null else routing_confirmed_by_actor_id end,operational_status=case when ${prior.rows[0].status}='DISCONNECTED' then 'NOT_RUN' else operational_status end,operational_checked_at=case when ${prior.rows[0].status}='DISCONNECTED' then null else operational_checked_at end,operational_checked_by_actor_id=case when ${prior.rows[0].status}='DISCONNECTED' then null else operational_checked_by_actor_id end,disconnected_at=null,disconnected_by_actor_id=null,last_error_code=null,updated_at=now(),version=version+1 where organization_id=${input.organizationId} and channel_connection_id=${prior.rows[0].channel_connection_id}`.execute(
        tx,
      );
      await sql`update messaging.facebook_oauth_attempts set status='CONSUMED',authorization_ciphertext=null,authorization_key_id=null,consumed_at=now(),updated_at=now() where id=${input.attemptId}::uuid`.execute(
        tx,
      );
      await appendAuditEvent(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorType: 'USER',
        action: 'messaging.facebook.reauthorized',
        targetType: 'messaging.channel_connection',
        targetId: prior.rows[0].channel_connection_id,
        metadata: { pageId: page.id, missingScopes },
      });
      return prior.rows[0].channel_connection_id;
    }
    const integration = await sql<{
      id: string;
    }>`insert into integrations.integrations(organization_id,provider_code,integration_type,name,status) values(${input.organizationId},'META_MESSENGER','MESSAGING','Facebook Messenger','ACTIVE') on conflict(organization_id,provider_code,integration_type) do update set status='ACTIVE',updated_at=now(),version=integrations.integrations.version+1 returning id`.execute(
      tx,
    );
    const account = await sql<{
      id: string;
    }>`insert into integrations.integration_accounts(organization_id,integration_id,external_account_id,name,status,non_secret_config,secret_reference) values(${input.organizationId},${integration.rows[0]!.id},${page.id},${page.name},'ACTIVE',${JSON.stringify({ graphApiVersion: input.graphApiVersion })}::jsonb,'DATABASE_ENCRYPTED') returning id`.execute(
      tx,
    );
    await sql`insert into integrations.provider_credentials(integration_account_id,organization_id,secret_ciphertext,secret_key_id) values(${account.rows[0]!.id},${input.organizationId},${encryptSecret(JSON.stringify({ pageAccessToken: page.accessToken }), input.encryptionKey)},${input.encryptionKey.id})`.execute(
      tx,
    );
    const status = missingScopes.length ? 'LIMITED_PERMISSIONS' : 'WEBHOOK_INCOMPLETE';
    const connection = await sql<{
      id: string;
    }>`insert into messaging.channel_connections(organization_id,channel_kind,display_name,status,provider_account_id,integration_account_id,capability_snapshot,configuration) values(${input.organizationId},'FACEBOOK',${page.name},${missingScopes.length ? 'DEGRADED' : 'ACTIVE'},${page.id},${account.rows[0]!.id},${JSON.stringify({ text: true, attachments: true, replies: true, readReceipts: true, maximumTextLength: 2000 })}::jsonb,${JSON.stringify({ graphApiVersion: input.graphApiVersion })}::jsonb) returning id`.execute(
      tx,
    );
    await sql`insert into messaging.facebook_connection_state(organization_id,channel_connection_id,integration_account_id,app_id,page_id,status,graph_api_version,granted_scopes,required_scopes,page_tasks,credential_healthy) values(${input.organizationId},${connection.rows[0]!.id},${account.rows[0]!.id},${input.appId},${page.id},${status},${input.graphApiVersion},${attempt.granted_scopes}::text[],${input.requiredScopes}::text[],${page.tasks}::text[],true)`.execute(
      tx,
    );
    await sql`update messaging.facebook_oauth_attempts set status='CONSUMED',authorization_ciphertext=null,authorization_key_id=null,consumed_at=now(),updated_at=now() where id=${input.attemptId}::uuid`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorType: 'USER',
      action: 'messaging.facebook.connected',
      targetType: 'messaging.channel_connection',
      targetId: connection.rows[0]!.id,
      metadata: { pageId: page.id, missingScopes },
    });
    return connection.rows[0]!.id;
  });
}

interface ConnectionRow {
  id: string;
  provider_account_id: string;
  display_name: string;
  facebook_status: FacebookConnectionView['status'];
  graph_api_version: string;
  granted_scopes: string[];
  required_scopes: string[];
  page_tasks: string[];
  subscribed_fields: string[];
  permission_review_status: FacebookConnectionView['permissionReviewStatus'];
  routing_status: FacebookConnectionView['readiness']['routing'];
  operational_status: FacebookConnectionView['readiness']['operational'];
  sync_status: FacebookSyncView['status'] | null;
  coverage_status: FacebookSyncView['coverageStatus'] | null;
  webhook_subscription_healthy: boolean;
  credential_healthy: boolean;
  last_webhook_at: Date | null;
  last_inbound_at: Date | null;
  last_outbound_at: Date | null;
  last_verified_at: Date | null;
  last_error_code: string | null;
  disconnected_at: Date | null;
  version: string;
}
function mapConnection(row: ConnectionRow): FacebookConnectionView {
  const missingScopes = row.required_scopes.filter((scope) => !row.granted_scopes.includes(scope));
  const authorization = !row.credential_healthy
    ? 'NEEDS_REAUTHORIZATION'
    : missingScopes.length || !row.page_tasks.includes('MESSAGING')
      ? 'INCOMPLETE'
      : 'READY';
  const webhook = row.webhook_subscription_healthy
    ? 'READY'
    : row.last_verified_at
      ? 'UNHEALTHY'
      : 'NOT_SUBSCRIBED';
  const history =
    row.coverage_status === 'PROVIDER_EXHAUSTED'
      ? 'PROVIDER_EXHAUSTED'
      : row.coverage_status === 'UNAVAILABLE'
        ? 'UNAVAILABLE'
        : row.sync_status === 'FAILED'
          ? 'FAILED'
          : row.sync_status === 'PENDING' || row.sync_status === 'PROCESSING'
            ? 'IN_PROGRESS'
            : 'NOT_STARTED';
  const blockers = [
    ...(authorization !== 'READY' ? [`AUTHORIZATION_${authorization}`] : []),
    ...(row.permission_review_status !== 'ADVANCED_ACCESS_CONFIRMED'
      ? ['ADVANCED_ACCESS_NOT_CONFIRMED']
      : []),
    ...(webhook !== 'READY' ? [`WEBHOOK_${webhook}`] : []),
    ...(row.routing_status !== 'OWNER_CONFIRMED' ? [`ROUTING_${row.routing_status}`] : []),
    ...(!row.last_inbound_at ? ['INBOUND_NOT_OBSERVED'] : []),
    ...(!row.last_outbound_at ? ['OUTBOUND_NOT_OBSERVED'] : []),
    ...(row.operational_status !== 'PASSED' ? [`OPERATIONAL_${row.operational_status}`] : []),
  ];
  return {
    id: row.id,
    pageId: row.provider_account_id,
    pageName: row.display_name,
    status: row.facebook_status,
    graphApiVersion: row.graph_api_version,
    grantedScopes: row.granted_scopes,
    missingScopes,
    permissionReviewStatus: row.permission_review_status,
    subscribedFields: row.subscribed_fields,
    webhookSubscriptionHealthy: row.webhook_subscription_healthy,
    credentialHealthy: row.credential_healthy,
    lastWebhookAt: iso(row.last_webhook_at),
    lastInboundAt: iso(row.last_inbound_at),
    lastOutboundAt: iso(row.last_outbound_at),
    lastVerifiedAt: iso(row.last_verified_at),
    lastErrorCode: row.last_error_code,
    disconnectedAt: iso(row.disconnected_at),
    readiness: {
      authorization,
      webhook,
      routing: row.routing_status,
      inbound: row.last_inbound_at ? 'OBSERVED' : 'UNVERIFIED',
      outbound: row.last_outbound_at ? 'OBSERVED' : 'UNVERIFIED',
      history,
      operational: row.operational_status,
      isOperational: blockers.length === 0,
      blockers,
    },
    version: row.version,
  };
}
const connectionSelect = sql.raw(
  `select cc.id,cc.provider_account_id,cc.display_name,state.status facebook_status,state.graph_api_version,state.granted_scopes,state.required_scopes,state.page_tasks,state.subscribed_fields,state.permission_review_status,state.routing_status,state.operational_status,state.webhook_subscription_healthy,state.credential_healthy,state.last_webhook_at,state.last_inbound_at,state.last_outbound_at,state.last_verified_at,state.last_error_code,state.disconnected_at,state.version::text,sync.status sync_status,sync.coverage_status from messaging.channel_connections cc join messaging.facebook_connection_state state on state.organization_id=cc.organization_id and state.channel_connection_id=cc.id left join lateral(select job.status,job.coverage_status from messaging.facebook_sync_jobs job where job.organization_id=cc.organization_id and job.channel_connection_id=cc.id order by job.created_at desc limit 1) sync on true`,
);

export async function listFacebookConnections(
  db: Db,
  organizationId: string,
): Promise<readonly FacebookConnectionView[]> {
  const rows =
    await sql<ConnectionRow>`${connectionSelect} where cc.organization_id=${organizationId} order by cc.created_at desc`.execute(
      db,
    );
  return rows.rows.map(mapConnection);
}
export async function getFacebookConnection(
  db: Db,
  organizationId: string,
  connectionId: string,
): Promise<FacebookConnectionView> {
  const rows =
    await sql<ConnectionRow>`${connectionSelect} where cc.organization_id=${organizationId} and cc.id=${connectionId}::uuid`.execute(
      db,
    );
  if (!rows.rows[0])
    throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Facebook connection was not found.');
  return mapConnection(rows.rows[0]);
}

export async function loadFacebookCredential(
  db: Db,
  input: { connectionId: string; organizationId?: string; encryptionKey: EncryptionKey },
): Promise<{
  organizationId: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  graphApiVersion: string;
  status: string;
  grantedScopes: readonly string[];
  pageTasks: readonly string[];
  webhookSubscriptionHealthy: boolean;
  routingStatus: FacebookConnectionView['readiness']['routing'];
  lastInboundAt: Date | null;
}> {
  const organizationScope = input.organizationId
    ? sql` and cc.organization_id=${input.organizationId}`
    : sql``;
  const result = await sql<{
    organization_id: string;
    provider_account_id: string;
    display_name: string;
    graph_api_version: string;
    facebook_status: string;
    granted_scopes: string[];
    page_tasks: string[];
    webhook_subscription_healthy: boolean;
    routing_status: FacebookConnectionView['readiness']['routing'];
    secret_ciphertext: string;
    secret_key_id: string;
    last_inbound_at: Date | null;
  }>`select cc.organization_id,cc.provider_account_id,cc.display_name,state.graph_api_version,state.status facebook_status,state.granted_scopes,state.page_tasks,state.webhook_subscription_healthy,state.routing_status,credential.secret_ciphertext,credential.secret_key_id,state.last_inbound_at from messaging.channel_connections cc join messaging.facebook_connection_state state on state.organization_id=cc.organization_id and state.channel_connection_id=cc.id join integrations.provider_credentials credential on credential.organization_id=state.organization_id and credential.integration_account_id=state.integration_account_id where cc.id=${input.connectionId}::uuid${organizationScope}`.execute(
    db,
  );
  const row = result.rows[0];
  if (!row || row.secret_key_id !== input.encryptionKey.id)
    throw new MessagingDomainError(
      'CONNECTION_UNAVAILABLE',
      'Facebook credentials are unavailable.',
    );
  const credential = JSON.parse(decryptSecret(row.secret_ciphertext, input.encryptionKey)) as {
    pageAccessToken: string;
  };
  return {
    organizationId: row.organization_id,
    pageId: row.provider_account_id,
    pageName: row.display_name,
    pageAccessToken: credential.pageAccessToken,
    graphApiVersion: row.graph_api_version,
    status: row.facebook_status,
    grantedScopes: row.granted_scopes,
    pageTasks: row.page_tasks,
    webhookSubscriptionHealthy: row.webhook_subscription_healthy,
    routingStatus: row.routing_status,
    lastInboundAt: row.last_inbound_at,
  };
}

export async function loadFacebookDeliveryContext(
  db: Db,
  input: { organizationId: string; connectionId: string; messageId: string },
): Promise<{
  recipientId: string;
  eligibleUntil: Date | null;
  text: string | null;
  attachment: null | { provider: string; bucket: string; key: string; mimeType: string };
}> {
  const result = await sql<{
    external_subject_id: string;
    reply_eligible_until: Date | null;
    text_body: string | null;
    storage_provider: string | null;
    bucket_name: string | null;
    object_key: string | null;
    mime_type: string | null;
  }>`select identity.external_subject_id,conversation.reply_eligible_until,message.text_body,object.storage_provider,object.bucket_name,object.object_key,object.mime_type from messaging.messages message join messaging.conversations conversation on conversation.organization_id=message.organization_id and conversation.id=message.conversation_id join messaging.contact_identities identity on identity.organization_id=conversation.organization_id and identity.id=conversation.contact_identity_id left join messaging.message_attachments attachment on attachment.organization_id=message.organization_id and attachment.message_id=message.id left join media.media_assets asset on asset.organization_id=attachment.organization_id and asset.id=attachment.media_asset_id left join media.media_objects object on object.organization_id=asset.organization_id and object.id=asset.current_object_id where message.organization_id=${input.organizationId} and message.id=${input.messageId}::uuid and conversation.channel_connection_id=${input.connectionId}::uuid and conversation.channel_kind='FACEBOOK' order by attachment.position limit 2`.execute(
    db,
  );
  if (!result.rows[0] || result.rows.length > 1)
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Facebook delivery content is unavailable or ambiguous.',
    );
  const row = result.rows[0];
  return {
    recipientId: row.external_subject_id,
    eligibleUntil: row.reply_eligible_until,
    text: row.text_body,
    attachment:
      row.storage_provider && row.bucket_name && row.object_key && row.mime_type
        ? {
            provider: row.storage_provider,
            bucket: row.bucket_name,
            key: row.object_key,
            mimeType: row.mime_type,
          }
        : null,
  };
}

export async function recordFacebookProviderFailure(
  db: Db,
  input: { organizationId: string; connectionId: string; category: string; code: string },
): Promise<void> {
  const reauthorize = ['AUTHENTICATION', 'PERMISSION'].includes(input.category);
  await sql`update messaging.facebook_connection_state set status=case when ${reauthorize} then 'NEEDS_REAUTHORIZATION' else status end,credential_healthy=case when ${reauthorize} then false else credential_healthy end,last_error_at=now(),last_error_code=${input.code},updated_at=now(),version=version+1 where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid`.execute(
    db,
  );
  if (reauthorize)
    await sql`update messaging.channel_connections set status='DEGRADED',last_error_at=now(),last_error_code=${input.code},updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.connectionId}::uuid`.execute(
      db,
    );
}

export async function recordFacebookSendSuccess(
  db: Db,
  input: { organizationId: string; connectionId: string },
): Promise<void> {
  await sql`update messaging.facebook_connection_state set last_outbound_at=now(),last_error_code=null,updated_at=now() where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid`.execute(
    db,
  );
}

export async function markFacebookSubscription(
  db: Db,
  input: {
    organizationId: string;
    connectionId: string;
    healthy: boolean;
    fields: readonly string[];
    errorCode?: string;
    actorId?: string;
  },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    await sql`update messaging.facebook_connection_state set status=case when not ${input.healthy} then 'WEBHOOK_INCOMPLETE' when routing_status<>'OWNER_CONFIRMED' then 'ROUTING_UNVERIFIED' when required_scopes<@granted_scopes then 'CONNECTED' else 'LIMITED_PERMISSIONS' end,webhook_subscription_healthy=${input.healthy},subscribed_fields=${input.fields}::text[],last_verified_at=now(),last_error_at=case when ${input.errorCode ?? null} is null then last_error_at else now() end,last_error_code=${input.errorCode ?? null},updated_at=now(),version=version+1 where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid`.execute(
      tx,
    );
    await sql`update messaging.channel_connections connection set status=case when state.status='CONNECTED' then 'ACTIVE' else 'DEGRADED' end,last_healthy_at=case when state.status='CONNECTED' then now() else connection.last_healthy_at end,last_error_at=case when ${input.healthy} then connection.last_error_at else now() end,last_error_code=${input.errorCode ?? null},updated_at=now(),version=version+1 from messaging.facebook_connection_state state where connection.organization_id=${input.organizationId} and connection.id=${input.connectionId}::uuid and state.organization_id=connection.organization_id and state.channel_connection_id=connection.id`.execute(
      tx,
    );
    if (input.actorId)
      await appendAuditEvent(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorType: 'USER',
        action: input.healthy
          ? 'messaging.facebook.subscription_enabled'
          : 'messaging.facebook.subscription_disabled',
        targetType: 'messaging.channel_connection',
        targetId: input.connectionId,
        metadata: { fields: input.fields },
      });
  });
}

export async function assertFacebookConnectionVersion(
  db: Db,
  input: { organizationId: string; connectionId: string; expectedVersion: string },
): Promise<void> {
  const result =
    await sql`select 1 from messaging.facebook_connection_state where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid and version=${input.expectedVersion}::bigint and status<>'DISCONNECTED'`.execute(
      db,
    );
  if (!result.rows[0])
    throw new MessagingDomainError(
      'STALE_VERSION',
      'Facebook connection changed before this request.',
    );
}

export async function updateFacebookAssurance(
  db: Db,
  input: {
    organizationId: string;
    connectionId: string;
    actorId: string;
    expectedVersion: string;
    permissionReviewStatus?: FacebookConnectionView['permissionReviewStatus'];
    routingStatus?: FacebookConnectionView['readiness']['routing'];
    operationalStatus?: FacebookConnectionView['readiness']['operational'];
  },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const updated =
      await sql`update messaging.facebook_connection_state set permission_review_status=coalesce(${input.permissionReviewStatus ?? null},permission_review_status),routing_status=coalesce(${input.routingStatus ?? null},routing_status),routing_confirmed_at=case when ${input.routingStatus ?? null}='OWNER_CONFIRMED' then now() when ${input.routingStatus ?? null} is null then routing_confirmed_at else null end,routing_confirmed_by_actor_id=case when ${input.routingStatus ?? null}='OWNER_CONFIRMED' then ${input.actorId} when ${input.routingStatus ?? null} is null then routing_confirmed_by_actor_id else null end,operational_status=coalesce(${input.operationalStatus ?? null},operational_status),operational_checked_at=case when ${input.operationalStatus ?? null} in('PASSED','FAILED') then now() when ${input.operationalStatus ?? null} is null then operational_checked_at else null end,operational_checked_by_actor_id=case when ${input.operationalStatus ?? null} in('PASSED','FAILED') then ${input.actorId} when ${input.operationalStatus ?? null} is null then operational_checked_by_actor_id else null end,updated_at=now(),version=version+1 where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid and version=${input.expectedVersion}::bigint and status<>'DISCONNECTED' returning channel_connection_id`.execute(
        tx,
      );
    if (!updated.rows[0])
      throw new MessagingDomainError(
        'STALE_VERSION',
        'Facebook connection changed before this request.',
      );
    await sql`update messaging.facebook_connection_state set status=case when status in('SUSPENDED','NEEDS_REAUTHORIZATION','DISCONNECTED') then status when not webhook_subscription_healthy then 'WEBHOOK_INCOMPLETE' when routing_status<>'OWNER_CONFIRMED' then 'ROUTING_UNVERIFIED' when required_scopes<@granted_scopes then 'CONNECTED' else 'LIMITED_PERMISSIONS' end where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid`.execute(
      tx,
    );
    await sql`update messaging.channel_connections connection set status=case when state.status='CONNECTED' then 'ACTIVE' when state.status='SUSPENDED' then 'DISABLED' else 'DEGRADED' end,updated_at=now(),version=version+1 from messaging.facebook_connection_state state where connection.organization_id=${input.organizationId} and connection.id=${input.connectionId}::uuid and state.organization_id=connection.organization_id and state.channel_connection_id=connection.id`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorType: 'USER',
      action: 'messaging.facebook.assurance_updated',
      targetType: 'messaging.channel_connection',
      targetId: input.connectionId,
      metadata: {
        permissionReviewStatus: input.permissionReviewStatus ?? null,
        routingStatus: input.routingStatus ?? null,
        operationalStatus: input.operationalStatus ?? null,
      },
    });
  });
}

export async function disconnectFacebookConnection(
  db: Db,
  input: { organizationId: string; connectionId: string; actorId: string; errorCode?: string },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const found = await sql<{
      integration_account_id: string;
    }>`update messaging.facebook_connection_state set status='DISCONNECTED',credential_healthy=false,webhook_subscription_healthy=false,disconnected_at=now(),disconnected_by_actor_id=${input.actorId},last_error_code=${input.errorCode ?? null},updated_at=now(),version=version+1 where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid and status<>'DISCONNECTED' returning integration_account_id`.execute(
      tx,
    );
    if (!found.rows[0])
      throw new MessagingDomainError(
        'CONVERSATION_NOT_FOUND',
        'Facebook connection was not found.',
      );
    await sql`update messaging.channel_connections set status='DISCONNECTED',updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.connectionId}::uuid`.execute(
      tx,
    );
    await sql`delete from integrations.provider_credentials where organization_id=${input.organizationId} and integration_account_id=${found.rows[0].integration_account_id}::uuid`.execute(
      tx,
    );
    await sql`update integrations.integration_accounts set status='DISABLED',updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${found.rows[0].integration_account_id}::uuid`.execute(
      tx,
    );
    await sql`with failed as(update messaging.delivery_intents set status='FAILED_FINAL',last_error_code='CONNECTION_DISCONNECTED',completed_at=now(),updated_at=now() where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid and status in('PENDING','RETRY_WAIT') returning message_id) update messaging.messages message set delivery_state='FAILED_PERMANENT',failed_at=now(),failure_code='CONNECTION_DISCONNECTED',updated_at=now() from failed where message.organization_id=${input.organizationId} and message.id=failed.message_id`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorType: 'USER',
      action: 'messaging.facebook.disconnected',
      targetType: 'messaging.channel_connection',
      targetId: input.connectionId,
      metadata: {},
    });
  });
}

export async function setFacebookConnectionSuspended(
  db: Db,
  input: {
    organizationId: string;
    connectionId: string;
    actorId: string;
    suspended: boolean;
    expectedVersion: string;
  },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const updated = await sql<{
      version: string;
    }>`update messaging.facebook_connection_state state set status=case when ${input.suspended} then 'SUSPENDED' when not credential_healthy then 'NEEDS_REAUTHORIZATION' when not webhook_subscription_healthy then 'WEBHOOK_INCOMPLETE' when routing_status<>'OWNER_CONFIRMED' then 'ROUTING_UNVERIFIED' when required_scopes<@granted_scopes then 'CONNECTED' else 'LIMITED_PERMISSIONS' end,updated_at=now(),version=version+1 where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid and version=${input.expectedVersion}::bigint and status<>'DISCONNECTED' returning version::text`.execute(
      tx,
    );
    if (!updated.rows[0])
      throw new MessagingDomainError(
        'STALE_VERSION',
        'Facebook connection changed before this request.',
      );
    await sql`update messaging.channel_connections connection set status=case when state.status='SUSPENDED' then 'DISABLED' when state.status='CONNECTED' then 'ACTIVE' else 'DEGRADED' end,updated_at=now(),version=version+1 from messaging.facebook_connection_state state where connection.organization_id=${input.organizationId} and connection.id=${input.connectionId}::uuid and state.organization_id=connection.organization_id and state.channel_connection_id=connection.id`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorType: 'USER',
      action: input.suspended ? 'messaging.facebook.suspended' : 'messaging.facebook.resumed',
      targetType: 'messaging.channel_connection',
      targetId: input.connectionId,
      metadata: {},
    });
  });
}

export function facebookEventKey(pageId: string, event: Record<string, unknown>): string {
  const message =
    event.message && typeof event.message === 'object'
      ? (event.message as Record<string, unknown>)
      : undefined;
  if (typeof message?.mid === 'string') return `message:${message.mid}`;
  const postback =
    event.postback && typeof event.postback === 'object'
      ? (event.postback as Record<string, unknown>)
      : undefined;
  if (typeof postback?.mid === 'string') return `postback:${postback.mid}`;
  return `event:${digest(JSON.stringify({ pageId, sender: event.sender, recipient: event.recipient, timestamp: event.timestamp, delivery: event.delivery, read: event.read, postback: event.postback, reaction: event.reaction }))}`;
}

export async function acceptFacebookWebhookEvents(
  db: Db,
  entries: readonly Record<string, unknown>[],
): Promise<{ accepted: number; duplicates: number; unknownPages: number }> {
  let accepted = 0,
    duplicates = 0,
    unknownPages = 0;
  for (const entry of entries) {
    const pageId = typeof entry.id === 'string' ? entry.id : '';
    if (!pageId || !Array.isArray(entry.messaging)) continue;
    const connection = await sql<{
      organization_id: string;
      id: string;
    }>`select organization_id,id from messaging.channel_connections where channel_kind='FACEBOOK' and provider_account_id=${pageId} and status<>'DISCONNECTED'`.execute(
      db,
    );
    if (!connection.rows[0]) unknownPages++;
    for (const raw of entry.messaging) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const event = raw as Record<string, unknown>;
      const key = facebookEventKey(pageId, event);
      const eventType = event.message
        ? 'MESSAGE'
        : event.postback
          ? 'POSTBACK'
          : event.delivery
            ? 'DELIVERY'
            : event.read
              ? 'READ'
              : 'UNSUPPORTED';
      const inserted =
        await sql`insert into messaging.provider_events(organization_id,channel_connection_id,provider,provider_account_id,event_key,event_type,payload,provider_occurred_at,status) values(${connection.rows[0]?.organization_id ?? null},${connection.rows[0]?.id ?? null},'META_MESSENGER',${pageId},${key},${eventType},${JSON.stringify(event)}::jsonb,${typeof event.timestamp === 'number' ? new Date(event.timestamp) : null},${connection.rows[0] ? 'PENDING' : 'IGNORED'}) on conflict(provider,provider_account_id,event_key) do nothing returning id`.execute(
          db,
        );
      if (inserted.rows.length) accepted++;
      else duplicates++;
    }
    if (connection.rows[0])
      await sql`update messaging.facebook_connection_state set last_webhook_at=now(),updated_at=now() where organization_id=${connection.rows[0].organization_id} and channel_connection_id=${connection.rows[0].id}`.execute(
        db,
      );
  }
  return { accepted, duplicates, unknownPages };
}

export interface ClaimedFacebookEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly connectionId: string;
  readonly pageId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly attemptCount: number;
  readonly maxAttempts: number;
}
export async function claimFacebookProviderEvent(
  db: Db,
  workerId: string,
): Promise<ClaimedFacebookEvent | undefined> {
  const result = await sql<{
    id: string;
    organization_id: string;
    channel_connection_id: string;
    provider_account_id: string;
    event_type: string;
    payload: Record<string, unknown>;
    attempt_count: number;
    max_attempts: number;
  }>`with candidate as(select event.id from messaging.provider_events event join messaging.facebook_connection_state state on state.organization_id=event.organization_id and state.channel_connection_id=event.channel_connection_id where event.provider='META_MESSENGER' and state.status not in('SUSPENDED','DISCONNECTED') and ((event.status in('PENDING','RETRY_WAIT') and event.available_at<=now()) or (event.status='PROCESSING' and event.lease_expires_at<=now())) and event.attempt_count<event.max_attempts order by event.available_at,event.id for update of event skip locked limit 1) update messaging.provider_events event set status='PROCESSING',lease_owner=${workerId},lease_expires_at=now()+interval '60 seconds',attempt_count=attempt_count+1 from candidate where event.id=candidate.id returning event.id::text,event.organization_id,event.channel_connection_id,event.provider_account_id,event.event_type,event.payload,event.attempt_count,event.max_attempts`.execute(
    db,
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        organizationId: row.organization_id,
        connectionId: row.channel_connection_id,
        pageId: row.provider_account_id,
        eventType: row.event_type,
        payload: row.payload,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
      }
    : undefined;
}
export async function completeFacebookProviderEvent(
  db: Db,
  input: {
    id: string;
    outcome: 'PROCESSED' | 'IGNORED' | 'RETRY' | 'FAILED_FINAL';
    errorCode?: string;
  },
): Promise<void> {
  const status = input.outcome === 'RETRY' ? 'RETRY_WAIT' : input.outcome;
  await sql`update messaging.provider_events set status=${status},available_at=case when ${status}='RETRY_WAIT' then now()+(least(1800,power(2,greatest(attempt_count-1,0))*5)::text||' seconds')::interval else available_at end,lease_owner=null,lease_expires_at=null,last_error_code=${input.errorCode ?? null},processed_at=case when ${status}<>'RETRY_WAIT' then now() else null end where id=${input.id}::bigint and status='PROCESSING'`.execute(
    db,
  );
}

export async function resolveFacebookConversation(
  db: Db,
  input: {
    organizationId: string;
    connectionId: string;
    senderId: string;
    displayName?: string | null;
    providerConversationId?: string | null;
    reuseClosed?: boolean;
  },
): Promise<{ conversationId: string; contactIdentityId: string }> {
  return db.transaction().execute(async (tx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:${input.connectionId}:${input.senderId}`},0))`.execute(
      tx,
    );
    let identity = await sql<{
      id: string;
      contact_id: string;
    }>`select id,contact_id from messaging.contact_identities where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid and external_subject_id=${input.senderId}`.execute(
      tx,
    );
    if (!identity.rows[0]) {
      const contact = await sql<{
        id: string;
      }>`insert into messaging.contacts(organization_id,display_name) values(${input.organizationId},${input.displayName ?? null}) returning id`.execute(
        tx,
      );
      identity = await sql<{
        id: string;
        contact_id: string;
      }>`insert into messaging.contact_identities(organization_id,contact_id,channel_kind,channel_connection_id,external_subject_id,display_name,verification_status) values(${input.organizationId},${contact.rows[0]!.id},'FACEBOOK',${input.connectionId},${input.senderId},${input.displayName ?? null},'CHANNEL_ASSERTED') returning id,contact_id`.execute(
        tx,
      );
    } else
      await sql`update messaging.contact_identities set last_seen_at=now(),updated_at=now() where organization_id=${input.organizationId} and id=${identity.rows[0].id}`.execute(
        tx,
      );
    let conversation = await sql<{
      id: string;
    }>`select id from messaging.conversations where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid and contact_identity_id=${identity.rows[0]!.id} and (${input.reuseClosed ?? false} or status in('NEW','OPEN','PENDING','RESOLVED')) order by created_at desc limit 1`.execute(
      tx,
    );
    if (!conversation.rows[0])
      conversation = await sql<{
        id: string;
      }>`insert into messaging.conversations(organization_id,channel_connection_id,channel_kind,contact_id,contact_identity_id,provider_conversation_id,status) values(${input.organizationId},${input.connectionId},'FACEBOOK',${identity.rows[0]!.contact_id},${identity.rows[0]!.id},${input.providerConversationId ?? null},'NEW') returning id`.execute(
        tx,
      );
    return { conversationId: conversation.rows[0]!.id, contactIdentityId: identity.rows[0]!.id };
  });
}

export async function ingestFacebookMessage(
  db: Db,
  input: {
    organizationId: string;
    connectionId: string;
    senderId: string;
    messageId: string;
    text?: string | null;
    providerCreatedAt?: Date | null;
    structuredPayload?: Record<string, unknown>;
    attachments?: readonly {
      kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'STICKER' | 'PROVIDER_SHARE';
      externalId?: string;
      sourceUrl?: string;
      mimeType?: string;
      mediaAssetId?: string;
      fileName?: string;
      byteSize?: number;
    }[];
  },
): Promise<void> {
  const target = await resolveFacebookConversation(db, input);
  await acceptInboundMessage(db, {
    organizationId: input.organizationId,
    conversationId: target.conversationId,
    contactIdentityId: target.contactIdentityId,
    idempotencyKey: `facebook:${input.connectionId}:${input.messageId}`,
    externalMessageId: input.messageId,
    ...(input.text ? { text: input.text } : {}),
    ...(input.attachments ? { providerAttachments: input.attachments } : {}),
    ...(input.providerCreatedAt ? { providerCreatedAt: input.providerCreatedAt } : {}),
  });
  const eligibleUntil = new Date((input.providerCreatedAt ?? new Date()).getTime() + WINDOW_MS);
  await sql`update messaging.conversations set reply_eligible_until=${eligibleUntil},context=context || ${JSON.stringify(input.structuredPayload ?? {})}::jsonb where organization_id=${input.organizationId} and id=${target.conversationId}::uuid`.execute(
    db,
  );
  await sql`update messaging.facebook_connection_state set last_inbound_at=now(),updated_at=now() where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid`.execute(
    db,
  );
}

export async function ingestHistoricalFacebookMessage(
  db: Db,
  input: {
    organizationId: string;
    connectionId: string;
    senderId: string;
    fromPage: boolean;
    messageId: string;
    text?: string | null;
    providerCreatedAt: Date;
    providerConversationId: string;
    attachments?: readonly {
      kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'STICKER' | 'PROVIDER_SHARE';
      externalId?: string;
      mimeType?: string;
    }[];
  },
): Promise<boolean> {
  const target = await resolveFacebookConversation(db, {
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    senderId: input.senderId,
    providerConversationId: input.providerConversationId,
    reuseClosed: true,
  });
  if (!input.fromPage) {
    const accepted = await acceptInboundMessage(db, {
      organizationId: input.organizationId,
      conversationId: target.conversationId,
      contactIdentityId: target.contactIdentityId,
      idempotencyKey: `facebook-history:${input.connectionId}:${input.messageId}`,
      externalMessageId: input.messageId,
      ...(input.text ? { text: input.text } : {}),
      ...(input.attachments ? { providerAttachments: input.attachments } : {}),
      providerCreatedAt: input.providerCreatedAt,
      historical: true,
    });
    return !accepted.replayed;
  }
  return db.transaction().execute(async (tx) => {
    const existing =
      await sql`select 1 from messaging.message_external_references where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}::uuid and reference_type='PROVIDER_MESSAGE' and external_id=${input.messageId}`.execute(
        tx,
      );
    if (existing.rows[0]) return false;
    const allocation = await sql<{
      sequence: string;
    }>`update messaging.conversations set next_message_sequence=next_message_sequence+1,last_message_sequence=next_message_sequence,last_outbound_at=greatest(coalesce(last_outbound_at,'-infinity'::timestamptz),${input.providerCreatedAt}),updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${target.conversationId}::uuid returning (next_message_sequence-1)::text sequence`.execute(
      tx,
    );
    const message = await sql<{
      id: string;
    }>`insert into messaging.messages(organization_id,conversation_id,sequence,direction,sender_type,message_type,text_body,provider_message_id,delivery_state,provider_created_at,sent_at,created_at) values(${input.organizationId},${target.conversationId},${allocation.rows[0]!.sequence}::bigint,'OUTBOUND','PROVIDER',${input.attachments?.length ? (input.text ? 'MIXED' : 'ATTACHMENT') : 'TEXT'},${input.text ?? null},${input.messageId},'SENT',${input.providerCreatedAt},${input.providerCreatedAt},${input.providerCreatedAt}) returning id`.execute(
      tx,
    );
    for (const [position, attachment] of (input.attachments ?? []).entries())
      await sql`insert into messaging.message_attachments(organization_id,message_id,position,kind,mime_type,security_status,provider_metadata) values(${input.organizationId},${message.rows[0]!.id},${position},${attachment.kind},${attachment.mimeType ?? null},'REMOTE_ONLY',${JSON.stringify({ externalId: attachment.externalId ?? null, historical: true })}::jsonb)`.execute(
        tx,
      );
    await sql`insert into messaging.message_external_references(organization_id,message_id,channel_connection_id,reference_type,external_id) values(${input.organizationId},${message.rows[0]!.id},${input.connectionId},'PROVIDER_MESSAGE',${input.messageId})`.execute(
      tx,
    );
    await sql`update messaging.conversations set last_message_id=case when last_message_at is null or last_message_at<=${input.providerCreatedAt} then ${message.rows[0]!.id} else last_message_id end,last_message_at=greatest(coalesce(last_message_at,'-infinity'::timestamptz),${input.providerCreatedAt}) where organization_id=${input.organizationId} and id=${target.conversationId}`.execute(
      tx,
    );
    return true;
  });
}

export async function reconcileFacebookEcho(
  db: Db,
  input: { organizationId: string; connectionId: string; providerMessageId: string },
): Promise<boolean> {
  const result = await sql<{
    message_id: string;
    conversation_id: string;
  }>`select ref.message_id,message.conversation_id from messaging.message_external_references ref join messaging.messages message on message.organization_id=ref.organization_id and message.id=ref.message_id where ref.organization_id=${input.organizationId} and ref.channel_connection_id=${input.connectionId}::uuid and ref.reference_type='PROVIDER_MESSAGE' and ref.external_id=${input.providerMessageId}`.execute(
    db,
  );
  if (!result.rows[0]) return false;
  await sql`update messaging.messages set delivery_state=case when delivery_state in('QUEUED','SENDING') then 'SENT' else delivery_state end,sent_at=coalesce(sent_at,now()),updated_at=now() where organization_id=${input.organizationId} and id=${result.rows[0].message_id}`.execute(
    db,
  );
  return true;
}

export async function applyFacebookReceipt(
  db: Db,
  input: {
    organizationId: string;
    connectionId: string;
    providerMessageIds: readonly string[];
    state: 'DELIVERED' | 'READ';
    occurredAt: Date;
  },
): Promise<number> {
  const result = await sql<{
    id: string;
    conversation_id: string;
  }>`update messaging.messages message set delivery_state=case when ${input.state}='READ' then 'READ' when delivery_state in('SENT','SENDING','QUEUED') then 'DELIVERED' else delivery_state end,delivered_at=case when ${input.state} in('DELIVERED','READ') then coalesce(delivered_at,${input.occurredAt}) else delivered_at end,read_at=case when ${input.state}='READ' then coalesce(read_at,${input.occurredAt}) else read_at end,updated_at=now() from messaging.message_external_references ref where ref.organization_id=${input.organizationId} and ref.channel_connection_id=${input.connectionId}::uuid and ref.reference_type='PROVIDER_MESSAGE' and ref.external_id=any(${input.providerMessageIds}::text[]) and message.organization_id=ref.organization_id and message.id=ref.message_id returning message.id,message.conversation_id`.execute(
    db,
  );
  for (const row of result.rows)
    await appendRealtimeEvent(db, {
      organizationId: input.organizationId,
      audienceType: 'ORGANIZATION',
      conversationId: row.conversation_id,
      eventType: 'messaging.message.delivery_changed.v1',
      aggregateId: row.id,
      aggregateVersion: 1,
      payload: { conversationId: row.conversation_id, messageId: row.id, state: input.state },
    });
  return result.rows.length;
}

export async function applyFacebookReadWatermark(
  db: Db,
  input: { organizationId: string; connectionId: string; recipientId: string; occurredAt: Date },
): Promise<number> {
  const result = await sql<{
    id: string;
    conversation_id: string;
  }>`update messaging.messages message set delivery_state='READ',delivered_at=coalesce(delivered_at,${input.occurredAt}),read_at=coalesce(read_at,${input.occurredAt}),updated_at=now() from messaging.conversations conversation join messaging.contact_identities identity on identity.organization_id=conversation.organization_id and identity.id=conversation.contact_identity_id where message.organization_id=${input.organizationId} and message.conversation_id=conversation.id and conversation.channel_connection_id=${input.connectionId}::uuid and identity.external_subject_id=${input.recipientId} and message.direction='OUTBOUND' and message.provider_created_at is null and message.created_at<=${input.occurredAt} and message.delivery_state in('QUEUED','SENDING','SENT','DELIVERED') returning message.id,message.conversation_id`.execute(
    db,
  );
  for (const row of result.rows)
    await appendRealtimeEvent(db, {
      organizationId: input.organizationId,
      audienceType: 'ORGANIZATION',
      conversationId: row.conversation_id,
      eventType: 'messaging.message.delivery_changed.v1',
      aggregateId: row.id,
      aggregateVersion: 1,
      payload: { conversationId: row.conversation_id, messageId: row.id, state: 'READ' },
    });
  return result.rows.length;
}

export async function getFacebookReplyEligibility(
  db: Db,
  input: { organizationId: string; conversationId: string },
): Promise<FacebookReplyEligibility> {
  const result = await sql<{
    connection_status: string;
    credential_healthy: boolean;
    granted_scopes: string[];
    page_tasks: string[];
    reply_eligible_until: Date | null;
  }>`select state.status connection_status,state.credential_healthy,state.granted_scopes,state.page_tasks,conversation.reply_eligible_until from messaging.conversations conversation join messaging.facebook_connection_state state on state.organization_id=conversation.organization_id and state.channel_connection_id=conversation.channel_connection_id where conversation.organization_id=${input.organizationId} and conversation.id=${input.conversationId}::uuid and conversation.channel_kind='FACEBOOK'`.execute(
    db,
  );
  const row = result.rows[0];
  if (!row)
    throw new MessagingDomainError(
      'CONVERSATION_NOT_FOUND',
      'Facebook conversation was not found.',
    );
  const messagingPermissionMissing =
    !row.granted_scopes.includes('pages_messaging') || !row.page_tasks.includes('MESSAGING');
  const unavailable =
    !row.credential_healthy ||
    messagingPermissionMissing ||
    !['CONNECTED', 'LIMITED_PERMISSIONS'].includes(row.connection_status);
  const noMessage = !row.reply_eligible_until;
  const closed = row.reply_eligible_until !== null && row.reply_eligible_until <= new Date();
  const reason = unavailable
    ? row.connection_status === 'NEEDS_REAUTHORIZATION' || messagingPermissionMissing
      ? 'PERMISSION_MISSING'
      : ['WEBHOOK_INCOMPLETE', 'ROUTING_UNVERIFIED', 'AUTHORIZATION_PENDING'].includes(
            row.connection_status,
          )
        ? 'ACTIVATION_INCOMPLETE'
        : 'CONNECTION_UNAVAILABLE'
    : noMessage
      ? 'NO_CUSTOMER_MESSAGE'
      : closed
        ? 'WINDOW_CLOSED'
        : 'ELIGIBLE';
  return {
    allowed: reason === 'ELIGIBLE',
    reason,
    eligibleUntil: iso(row.reply_eligible_until),
    supportedAttachmentMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    nextAction:
      reason === 'ELIGIBLE'
        ? 'REPLY'
        : reason === 'ACTIVATION_INCOMPLETE'
          ? 'REVIEW_ACTIVATION'
          : reason === 'PERMISSION_MISSING' || reason === 'CONNECTION_UNAVAILABLE'
            ? 'REAUTHORIZE'
            : 'WAIT_FOR_CUSTOMER',
  };
}

export async function createFacebookSyncJob(
  db: Db,
  input: { organizationId: string; connectionId: string; membershipId: string },
): Promise<FacebookSyncView> {
  const result = await sql<{
    id: string;
  }>`insert into messaging.facebook_sync_jobs(organization_id,channel_connection_id,requested_by_membership_id) select state.organization_id,state.channel_connection_id,${input.membershipId} from messaging.facebook_connection_state state where state.organization_id=${input.organizationId} and state.channel_connection_id=${input.connectionId}::uuid and state.credential_healthy and state.status not in('SUSPENDED','DISCONNECTED','NEEDS_REAUTHORIZATION') on conflict(organization_id,channel_connection_id) where status in('PENDING','PROCESSING','PAUSED') do update set updated_at=now() returning id`.execute(
    db,
  );
  if (!result.rows[0])
    throw new MessagingDomainError(
      'CONNECTION_UNAVAILABLE',
      'Facebook historical synchronization is unavailable for this connection.',
    );
  return getFacebookSyncJob(db, input.organizationId, result.rows[0]!.id);
}
export async function getFacebookSyncJob(
  db: Db,
  organizationId: string,
  id: string,
): Promise<FacebookSyncView> {
  const result = await sql<{
    id: string;
    channel_connection_id: string;
    status: FacebookSyncView['status'];
    imported_conversations: number;
    imported_messages: number;
    duplicate_messages: number;
    attachment_failures: number;
    coverage_status: FacebookSyncView['coverageStatus'];
    error_count: number;
    last_error_code: string | null;
    started_at: Date | null;
    completed_at: Date | null;
    last_successful_at: Date | null;
    updated_at: Date;
  }>`select id,channel_connection_id,status,imported_conversations,imported_messages,duplicate_messages,attachment_failures,coverage_status,error_count,last_error_code,started_at,completed_at,last_successful_at,updated_at from messaging.facebook_sync_jobs where organization_id=${organizationId} and id=${id}::uuid`.execute(
    db,
  );
  const row = result.rows[0];
  if (!row)
    throw new MessagingDomainError(
      'CONVERSATION_NOT_FOUND',
      'Facebook synchronization was not found.',
    );
  return {
    id: row.id,
    connectionId: row.channel_connection_id,
    status: row.status,
    importedConversations: row.imported_conversations,
    importedMessages: row.imported_messages,
    duplicateMessages: row.duplicate_messages,
    attachmentFailures: row.attachment_failures,
    coverageStatus: row.coverage_status,
    errorCount: row.error_count,
    lastErrorCode: row.last_error_code,
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
    lastSuccessfulAt: iso(row.last_successful_at),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface ClaimedFacebookSyncJob {
  readonly id: string;
  readonly organizationId: string;
  readonly connectionId: string;
  readonly cursor: {
    conversationAfter?: string;
    conversationId?: string;
    messageAfter?: string;
    participantId?: string;
    endAfterCurrent?: boolean;
  } | null;
}
export async function claimFacebookSyncJob(
  db: Db,
  workerId: string,
): Promise<ClaimedFacebookSyncJob | undefined> {
  const result = await sql<{
    id: string;
    organization_id: string;
    channel_connection_id: string;
    cursor: string | null;
  }>`with candidate as(select id from messaging.facebook_sync_jobs where status in('PENDING','PROCESSING') and available_at<=now() and (lease_expires_at is null or lease_expires_at<=now()) order by created_at for update skip locked limit 1) update messaging.facebook_sync_jobs job set status='PROCESSING',lease_owner=${workerId},lease_expires_at=now()+interval '60 seconds',started_at=coalesce(started_at,now()),updated_at=now() from candidate where job.id=candidate.id returning job.id,job.organization_id,job.channel_connection_id,job.cursor`.execute(
    db,
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        organizationId: row.organization_id,
        connectionId: row.channel_connection_id,
        cursor: row.cursor ? (JSON.parse(row.cursor) as ClaimedFacebookSyncJob['cursor']) : null,
      }
    : undefined;
}
export async function advanceFacebookSyncJob(
  db: Db,
  input: {
    id: string;
    cursor: ClaimedFacebookSyncJob['cursor'];
    importedConversations?: number;
    importedMessages?: number;
    duplicateMessages?: number;
    attachmentFailures?: number;
    complete?: boolean;
    errorCode?: string;
  },
): Promise<void> {
  await sql`update messaging.facebook_sync_jobs set status=case when ${input.complete ?? false} then 'COMPLETED' else 'PROCESSING' end,cursor=${input.cursor ? JSON.stringify(input.cursor) : null},imported_conversations=imported_conversations+${input.importedConversations ?? 0},imported_messages=imported_messages+${input.importedMessages ?? 0},duplicate_messages=duplicate_messages+${input.duplicateMessages ?? 0},attachment_failures=attachment_failures+${input.attachmentFailures ?? 0},coverage_status=case when ${input.complete ?? false} then 'PROVIDER_EXHAUSTED' when coverage_status='UNKNOWN' then 'PARTIAL' else coverage_status end,error_count=error_count+${input.errorCode ? 1 : 0},last_error_code=${input.errorCode ?? null},available_at=now()+interval '5 seconds',lease_owner=null,lease_expires_at=null,completed_at=case when ${input.complete ?? false} then now() else null end,last_successful_at=now(),updated_at=now() where id=${input.id}::uuid`.execute(
    db,
  );
}
export async function failFacebookSyncJob(
  db: Db,
  id: string,
  code: string,
  retry: boolean,
  unavailable = false,
): Promise<void> {
  await sql`update messaging.facebook_sync_jobs set status=case when ${retry} then 'PROCESSING' else 'FAILED' end,coverage_status=case when ${unavailable} then 'UNAVAILABLE' else coverage_status end,error_count=error_count+1,last_error_code=${code},available_at=now()+interval '1 minute',lease_owner=null,lease_expires_at=null,completed_at=case when ${retry} then null else now() end,updated_at=now() where id=${id}::uuid`.execute(
    db,
  );
}

export async function purgeExpiredFacebookResources(db: Db): Promise<number> {
  const result = await sql<{
    id: string;
  }>`with oauth as(delete from messaging.facebook_oauth_attempts where expires_at<now()-interval '1 day' returning id),events as(delete from messaging.provider_events where expires_at<=now() returning id) select id::text from oauth union all select id::text from events`.execute(
    db,
  );
  return result.rows.length;
}

export async function refreshFacebookAttachmentSecurity(db: Db): Promise<number> {
  const result = await sql<{
    id: string;
  }>`update messaging.message_attachments attachment set security_status=case asset.status when 'READY' then 'AVAILABLE' when 'FAILED' then 'REJECTED' else attachment.security_status end from media.media_assets asset,messaging.messages message,messaging.conversations conversation where attachment.media_asset_id=asset.id and attachment.organization_id=asset.organization_id and message.organization_id=attachment.organization_id and message.id=attachment.message_id and conversation.organization_id=message.organization_id and conversation.id=message.conversation_id and conversation.channel_kind='FACEBOOK' and attachment.security_status='QUARANTINED' and asset.status in('READY','FAILED') returning attachment.id`.execute(
    db,
  );
  return result.rows.length;
}
