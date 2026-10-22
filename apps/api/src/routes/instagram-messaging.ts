import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { RuntimeConfig } from '@maevelle/config';
import type { InstagramConnectionView } from '@maevelle/contracts/messaging';
import { MetaGraphError, MetaMessengerClient } from '@maevelle/core';
import type { DatabaseClient } from '@maevelle/database';
import * as instagram from '@maevelle/database/messaging';

import { verifyMetaSignature } from './facebook-messaging.js';
import {
  authenticateMessagingAdmin,
  parseExpectedVersion,
  sendMessagingError,
  type MessagingAuth,
} from './messaging-route-support.js';

function configured(config: RuntimeConfig) {
  if (
    !config.instagramAppId ||
    !config.instagramAppSecret ||
    !config.instagramGraphApiVersion ||
    !config.instagramOAuthCallbackUrl
  )
    return undefined;
  return new MetaMessengerClient({
    appId: config.instagramAppId,
    appSecret: config.instagramAppSecret,
    graphApiVersion: config.instagramGraphApiVersion,
    oauthCallbackUrl: config.instagramOAuthCallbackUrl,
    requestTimeoutMs: config.metaRequestTimeoutMs,
  });
}

function encryptionKey(config: RuntimeConfig) {
  return { id: 'runtime-auth-key', value: Buffer.from(config.authEncryptionKey, 'base64') };
}

function graphErrorCode(error: unknown): string {
  return error instanceof MetaGraphError ? error.code : 'INSTAGRAM_OPERATION_FAILED';
}

function adminMessagingDestination(config: RuntimeConfig): URL {
  return new URL(
    '/admin/messaging',
    config.authTrustedOrigins[0] ?? new URL(config.authBaseUrl).origin,
  );
}

const connectionParams = Type.Object({ connectionId: Type.String({ format: 'uuid' }) });

export function registerInstagramMessagingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: MessagingAuth,
  config: RuntimeConfig,
): void {
  const client = configured(config);
  const scopes = config.instagramOAuthScopes ?? instagram.INSTAGRAM_REQUIRED_SCOPES;

  app.get(
    '/webhooks/meta/instagram',
    {
      schema: {
        querystring: Type.Object({
          'hub.mode': Type.Optional(Type.String()),
          'hub.verify_token': Type.Optional(Type.String()),
          'hub.challenge': Type.Optional(Type.String({ maxLength: 500 })),
        }),
      },
    },
    async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;
      if (
        !config.instagramWebhookVerifyToken ||
        query['hub.mode'] !== 'subscribe' ||
        query['hub.verify_token'] !== config.instagramWebhookVerifyToken ||
        !query['hub.challenge']
      )
        return reply.code(403).send({
          error: { code: 'WEBHOOK_VERIFICATION_FAILED', message: 'Webhook verification failed.' },
        });
      return reply.type('text/plain').send(query['hub.challenge']);
    },
  );

  app.post('/webhooks/meta/instagram', { bodyLimit: 1_048_576 }, async (request, reply) => {
    const rawBody = (request as typeof request & { rawBody?: string }).rawBody;
    const signature =
      typeof request.headers['x-hub-signature-256'] === 'string'
        ? request.headers['x-hub-signature-256']
        : undefined;
    if (
      !rawBody ||
      !config.instagramAppSecret ||
      !verifyMetaSignature(rawBody, signature, config.instagramAppSecret)
    )
      return reply.code(401).send({
        error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Webhook signature is invalid.' },
      });
    const body = request.body as { object?: unknown; entry?: unknown };
    if (body.object !== 'instagram' || !Array.isArray(body.entry))
      return reply.code(400).send({
        error: {
          code: 'INVALID_WEBHOOK_PAYLOAD',
          message: 'Expected an Instagram webhook payload.',
        },
      });
    await instagram.acceptInstagramWebhookEvents(
      database.db,
      body.entry.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
      ),
    );
    return reply.code(200).send('EVENT_RECEIVED');
  });

  app.get(
    '/integrations/messaging/instagram/oauth/callback',
    {
      schema: {
        querystring: Type.Object({
          state: Type.String({ minLength: 20, maxLength: 500 }),
          code: Type.Optional(Type.String({ minLength: 1, maxLength: 2_000 })),
          error: Type.Optional(Type.String({ maxLength: 200 })),
        }),
      },
    },
    async (request, reply) => {
      const query = request.query as { state: string; code?: string; error?: string };
      if (!client || !query.code) {
        const errorCode = query.error ? 'META_AUTHORIZATION_DENIED' : 'INSTAGRAM_NOT_CONFIGURED';
        await instagram.failInstagramOAuthAttempt(database.db, query.state, errorCode);
        const destination = adminMessagingDestination(config);
        destination.searchParams.set('instagram', 'error');
        destination.searchParams.set('error', errorCode);
        return reply.redirect(destination.toString(), 303);
      }
      try {
        const userToken = await client.exchangeCode(query.code);
        const [accounts, permissions] = await Promise.all([
          client.listInstagramAccounts(userToken),
          client.inspectPermissions(userToken),
        ]);
        const attemptId = await instagram.authorizeInstagramOAuthAttempt(database.db, {
          state: query.state,
          userToken,
          grantedScopes: permissions,
          accounts,
          encryptionKey: encryptionKey(config),
        });
        const destination = adminMessagingDestination(config);
        destination.searchParams.set('instagram', 'authorized');
        destination.searchParams.set('attemptId', attemptId);
        return reply.redirect(destination.toString(), 303);
      } catch (error) {
        const errorCode = graphErrorCode(error);
        await instagram.failInstagramOAuthAttempt(database.db, query.state, errorCode);
        const destination = adminMessagingDestination(config);
        destination.searchParams.set('instagram', 'error');
        destination.searchParams.set('error', errorCode);
        return reply.redirect(destination.toString(), 303);
      }
    },
  );

  app.get('/admin/messaging/connections/instagram/availability', async (request, reply) => {
    const context = await authenticateMessagingAdmin(
      database,
      auth,
      request.headers,
      'messaging.connections.view',
    );
    if (!context)
      return reply
        .code(403)
        .send({ error: { code: 'FORBIDDEN', message: 'Connection access is required.' } });
    return {
      data: {
        configured: Boolean(client && config.instagramWebhookVerifyToken),
        authorizationMethod: 'FACEBOOK_LOGIN',
        graphApiVersion: config.instagramGraphApiVersion ?? null,
        requiredScopes: scopes,
        oauthCallbackUrl: config.instagramOAuthCallbackUrl ?? null,
        limitations: [
          'CUSTOMER_INITIATED_ONLY',
          'REQUESTS_INACTIVE_OVER_30_DAYS_NOT_RETURNED',
          'API_REPLY_MOVES_CONVERSATION_TO_GENERAL',
          'NO_GROUP_MESSAGING',
        ],
      },
    };
  });

  app.post('/admin/messaging/connections/instagram/oauth', async (request, reply) => {
    const context = await authenticateMessagingAdmin(
      database,
      auth,
      request.headers,
      'messaging.connections.manage',
    );
    if (!context)
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Connection management access is required.' },
      });
    if (!client)
      return reply.code(503).send({
        error: {
          code: 'INSTAGRAM_NOT_CONFIGURED',
          message: 'Instagram integration is not configured.',
        },
      });
    const attempt = await instagram.createInstagramOAuthAttempt(database.db, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      membershipId: context.membershipId,
      scopes,
    });
    return reply.code(201).send({
      data: {
        authorizationUrl: client.authorizationUrl(attempt.state, scopes),
        attemptId: attempt.id,
        expiresAt: attempt.expiresAt,
      },
    });
  });

  app.get(
    '/admin/messaging/connections/instagram/oauth/:attemptId',
    { schema: { params: Type.Object({ attemptId: Type.String({ format: 'uuid' }) }) } },
    async (request, reply) => {
      const context = await authenticateMessagingAdmin(
        database,
        auth,
        request.headers,
        'messaging.connections.manage',
      );
      if (!context)
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Connection management access is required.' },
        });
      try {
        return {
          data: await instagram.getInstagramOAuthStatus(database.db, {
            organizationId: context.organizationId,
            actorId: context.actorId,
            membershipId: context.membershipId,
            attemptId: (request.params as { attemptId: string }).attemptId,
          }),
        };
      } catch (error) {
        return sendMessagingError(reply, error, request.id);
      }
    },
  );

  app.post(
    '/admin/messaging/connections/instagram',
    {
      schema: {
        body: Type.Object({
          attemptId: Type.String({ format: 'uuid' }),
          instagramAccountId: Type.String({ minLength: 1, maxLength: 255 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticateMessagingAdmin(
        database,
        auth,
        request.headers,
        'messaging.connections.manage',
      );
      if (!context)
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Connection management access is required.' },
        });
      if (!client || !config.instagramAppId || !config.instagramGraphApiVersion)
        return reply.code(503).send({
          error: {
            code: 'INSTAGRAM_NOT_CONFIGURED',
            message: 'Instagram integration is not configured.',
          },
        });
      const body = request.body as { attemptId: string; instagramAccountId: string };
      try {
        const connectionId = await instagram.connectInstagramAccount(database.db, {
          organizationId: context.organizationId,
          actorId: context.actorId,
          membershipId: context.membershipId,
          attemptId: body.attemptId,
          instagramAccountId: body.instagramAccountId,
          appId: config.instagramAppId,
          graphApiVersion: config.instagramGraphApiVersion,
          requiredScopes: scopes,
          encryptionKey: encryptionKey(config),
        });
        const credential = await instagram.loadInstagramCredential(database.db, {
          organizationId: context.organizationId,
          connectionId,
          encryptionKey: encryptionKey(config),
        });
        try {
          await client.subscribeInstagramAccount(
            credential.instagramAccountId,
            credential.pageAccessToken,
            instagram.INSTAGRAM_WEBHOOK_FIELDS,
          );
          const subscription = await client.inspectInstagramSubscription(
            credential.instagramAccountId,
            credential.pageAccessToken,
          );
          await instagram.markInstagramSubscription(database.db, {
            organizationId: context.organizationId,
            connectionId,
            healthy: subscription.subscribed,
            fields: subscription.fields,
            actorId: context.actorId,
          });
        } catch (error) {
          await instagram.markInstagramSubscription(database.db, {
            organizationId: context.organizationId,
            connectionId,
            healthy: false,
            fields: [],
            errorCode: graphErrorCode(error),
            actorId: context.actorId,
          });
        }
        return reply.code(201).send({
          data: await instagram.getInstagramConnection(
            database.db,
            context.organizationId,
            connectionId,
          ),
        });
      } catch (error) {
        return sendMessagingError(reply, error, request.id);
      }
    },
  );

  app.get('/admin/messaging/connections/instagram', async (request, reply) => {
    const context = await authenticateMessagingAdmin(
      database,
      auth,
      request.headers,
      'messaging.connections.view',
    );
    if (!context)
      return reply
        .code(403)
        .send({ error: { code: 'FORBIDDEN', message: 'Connection access is required.' } });
    return { data: await instagram.listInstagramConnections(database.db, context.organizationId) };
  });

  app.get(
    '/admin/messaging/connections/instagram/:connectionId',
    { schema: { params: connectionParams } },
    async (request, reply) => {
      const context = await authenticateMessagingAdmin(
        database,
        auth,
        request.headers,
        'messaging.connections.view',
      );
      if (!context)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Connection access is required.' } });
      try {
        return {
          data: await instagram.getInstagramConnection(
            database.db,
            context.organizationId,
            (request.params as { connectionId: string }).connectionId,
          ),
        };
      } catch (error) {
        return sendMessagingError(reply, error, request.id);
      }
    },
  );

  app.patch(
    '/admin/messaging/connections/instagram/:connectionId',
    {
      schema: {
        params: connectionParams,
        body: Type.Object(
          {
            suspended: Type.Optional(Type.Boolean()),
            permissionReviewStatus: Type.Optional(
              Type.Union([
                Type.Literal('UNKNOWN'),
                Type.Literal('DEVELOPMENT_ONLY'),
                Type.Literal('APP_REVIEW_PENDING'),
                Type.Literal('ADVANCED_ACCESS_CONFIRMED'),
              ]),
            ),
          },
          { minProperties: 1 },
        ),
      },
    },
    async (request, reply) => {
      const context = await authenticateMessagingAdmin(
        database,
        auth,
        request.headers,
        'messaging.connections.manage',
      );
      if (!context)
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Connection management access is required.' },
        });
      const connectionId = (request.params as { connectionId: string }).connectionId;
      const body = request.body as {
        suspended?: boolean;
        permissionReviewStatus?: InstagramConnectionView['permissionReviewStatus'];
      };
      try {
        const expectedVersion = parseExpectedVersion(request.headers['if-match']);
        if (body.suspended !== undefined)
          await instagram.setInstagramConnectionSuspended(database.db, {
            organizationId: context.organizationId,
            connectionId,
            actorId: context.actorId,
            suspended: body.suspended,
            expectedVersion,
          });
        else
          await instagram.updateInstagramReviewStatus(database.db, {
            organizationId: context.organizationId,
            connectionId,
            actorId: context.actorId,
            expectedVersion,
            permissionReviewStatus: body.permissionReviewStatus!,
          });
        return {
          data: await instagram.getInstagramConnection(
            database.db,
            context.organizationId,
            connectionId,
          ),
        };
      } catch (error) {
        return sendMessagingError(reply, error, request.id);
      }
    },
  );

  app.post(
    '/admin/messaging/connections/instagram/:connectionId/diagnostics',
    { schema: { params: connectionParams } },
    async (request, reply) => {
      const context = await authenticateMessagingAdmin(
        database,
        auth,
        request.headers,
        'messaging.connections.manage',
      );
      if (!context)
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Connection management access is required.' },
        });
      if (!client)
        return reply.code(503).send({
          error: {
            code: 'INSTAGRAM_NOT_CONFIGURED',
            message: 'Instagram integration is not configured.',
          },
        });
      const connectionId = (request.params as { connectionId: string }).connectionId;
      try {
        const credential = await instagram.loadInstagramCredential(database.db, {
          organizationId: context.organizationId,
          connectionId,
          encryptionKey: encryptionKey(config),
        });
        const [account, subscription] = await Promise.all([
          client.verifyInstagramAccount(credential.instagramAccountId, credential.pageAccessToken),
          client.inspectInstagramSubscription(
            credential.instagramAccountId,
            credential.pageAccessToken,
          ),
        ]);
        if (account.id !== credential.instagramAccountId)
          throw new Error('INSTAGRAM_ACCOUNT_MISMATCH');
        await instagram.markInstagramSubscription(database.db, {
          organizationId: context.organizationId,
          connectionId,
          healthy: subscription.subscribed,
          fields: subscription.fields,
          actorId: context.actorId,
        });
        return {
          data: await instagram.getInstagramConnection(
            database.db,
            context.organizationId,
            connectionId,
          ),
        };
      } catch (error) {
        await instagram.recordInstagramProviderFailure(database.db, {
          organizationId: context.organizationId,
          connectionId,
          category: error instanceof MetaGraphError ? error.category : 'PROVIDER',
          code: graphErrorCode(error),
        });
        return sendMessagingError(reply, error, request.id);
      }
    },
  );

  app.delete(
    '/admin/messaging/connections/instagram/:connectionId',
    { schema: { params: connectionParams } },
    async (request, reply) => {
      const context = await authenticateMessagingAdmin(
        database,
        auth,
        request.headers,
        'messaging.connections.manage',
      );
      if (!context)
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Connection management access is required.' },
        });
      const connectionId = (request.params as { connectionId: string }).connectionId;
      let unsubscribeError: string | undefined;
      if (client)
        try {
          const credential = await instagram.loadInstagramCredential(database.db, {
            organizationId: context.organizationId,
            connectionId,
            encryptionKey: encryptionKey(config),
          });
          await client.unsubscribeInstagramAccount(
            credential.instagramAccountId,
            credential.pageAccessToken,
          );
        } catch (error) {
          unsubscribeError = graphErrorCode(error);
        }
      try {
        await instagram.disconnectInstagramConnection(database.db, {
          organizationId: context.organizationId,
          connectionId,
          actorId: context.actorId,
          ...(unsubscribeError ? { errorCode: unsubscribeError } : {}),
        });
        return reply.code(204).send();
      } catch (error) {
        return sendMessagingError(reply, error, request.id);
      }
    },
  );

  app.get(
    '/admin/messaging/conversations/:conversationId/instagram-reply-eligibility',
    { schema: { params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }) } },
    async (request, reply) => {
      const context = await authenticateMessagingAdmin(
        database,
        auth,
        request.headers,
        'messaging.reply',
      );
      if (!context)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Reply access is required.' } });
      try {
        return {
          data: await instagram.getInstagramReplyEligibility(database.db, {
            organizationId: context.organizationId,
            conversationId: (request.params as { conversationId: string }).conversationId,
          }),
        };
      } catch (error) {
        return sendMessagingError(reply, error, request.id);
      }
    },
  );

  app.post(
    '/admin/messaging/connections/instagram/:connectionId/syncs',
    { schema: { params: connectionParams } },
    async (request, reply) => {
      const context = await authenticateMessagingAdmin(
        database,
        auth,
        request.headers,
        'messaging.connections.manage',
      );
      if (!context)
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Connection management access is required.' },
        });
      try {
        return reply.code(202).send({
          data: await instagram.createInstagramSyncJob(database.db, {
            organizationId: context.organizationId,
            connectionId: (request.params as { connectionId: string }).connectionId,
            membershipId: context.membershipId,
          }),
        });
      } catch (error) {
        return sendMessagingError(reply, error, request.id);
      }
    },
  );

  app.get(
    '/admin/messaging/connections/instagram/syncs/:syncId',
    { schema: { params: Type.Object({ syncId: Type.String({ format: 'uuid' }) }) } },
    async (request, reply) => {
      const context = await authenticateMessagingAdmin(
        database,
        auth,
        request.headers,
        'messaging.connections.view',
      );
      if (!context)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Connection access is required.' } });
      try {
        return {
          data: await instagram.getInstagramSyncJob(
            database.db,
            context.organizationId,
            (request.params as { syncId: string }).syncId,
          ),
        };
      } catch (error) {
        return sendMessagingError(reply, error, request.id);
      }
    },
  );
}
