import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { RuntimeConfig } from '@maevelle/config';
import { MetaGraphError, MetaMessengerClient } from '@maevelle/core';
import type { DatabaseClient } from '@maevelle/database';
import * as facebook from '@maevelle/database/messaging';

import {
  authenticateMessagingAdmin,
  hasMessagingInboxAccess,
  messagingAccess,
  parseExpectedVersion,
  sendMessagingError,
  type MessagingAuth,
} from './messaging-route-support.js';

function configured(config: RuntimeConfig) {
  if (
    !config.metaAppId ||
    !config.metaAppSecret ||
    !config.metaGraphApiVersion ||
    !config.metaOAuthCallbackUrl
  )
    return undefined;
  return new MetaMessengerClient({
    appId: config.metaAppId,
    appSecret: config.metaAppSecret,
    graphApiVersion: config.metaGraphApiVersion,
    oauthCallbackUrl: config.metaOAuthCallbackUrl,
    requestTimeoutMs: config.metaRequestTimeoutMs,
  });
}

function encryptionKey(config: RuntimeConfig) {
  return { id: 'runtime-auth-key', value: Buffer.from(config.authEncryptionKey, 'base64') };
}

export function verifyMetaSignature(
  rawBody: string,
  signature: string | undefined,
  appSecret: string,
): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const supplied = signature.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const expected = createHmac('sha256', appSecret).update(Buffer.from(rawBody, 'utf8')).digest();
  const received = Buffer.from(supplied, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function graphErrorCode(error: unknown): string {
  return error instanceof MetaGraphError ? error.code : 'META_OPERATION_FAILED';
}

export function registerFacebookMessagingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: MessagingAuth,
  config: RuntimeConfig,
): void {
  const client = configured(config);

  app.get(
    '/webhooks/meta/messenger',
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
        !config.metaWebhookVerifyToken ||
        query['hub.mode'] !== 'subscribe' ||
        query['hub.verify_token'] !== config.metaWebhookVerifyToken ||
        !query['hub.challenge']
      )
        return reply.code(403).send({
          error: { code: 'WEBHOOK_VERIFICATION_FAILED', message: 'Webhook verification failed.' },
        });
      return reply.type('text/plain').send(query['hub.challenge']);
    },
  );

  app.post('/webhooks/meta/messenger', { bodyLimit: 1_048_576 }, async (request, reply) => {
    const rawBody = (request as typeof request & { rawBody?: string }).rawBody;
    const signature =
      typeof request.headers['x-hub-signature-256'] === 'string'
        ? request.headers['x-hub-signature-256']
        : undefined;
    if (
      !rawBody ||
      !config.metaAppSecret ||
      !verifyMetaSignature(rawBody, signature, config.metaAppSecret)
    )
      return reply.code(401).send({
        error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Webhook signature is invalid.' },
      });
    const body = request.body as { object?: unknown; entry?: unknown };
    if (body.object !== 'page' || !Array.isArray(body.entry))
      return reply.code(400).send({
        error: { code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Expected a Page webhook payload.' },
      });
    await facebook.acceptFacebookWebhookEvents(
      database.db,
      body.entry.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
      ),
    );
    return reply.code(200).send('EVENT_RECEIVED');
  });

  app.get(
    '/integrations/messaging/facebook/oauth/callback',
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
        await facebook.failFacebookOAuthAttempt(
          database.db,
          query.state,
          query.error ? 'META_AUTHORIZATION_DENIED' : 'META_NOT_CONFIGURED',
        );
        return reply.code(client ? 400 : 503).send({
          error: {
            code: query.error ? 'META_AUTHORIZATION_DENIED' : 'META_NOT_CONFIGURED',
            message: query.error
              ? 'Facebook authorization was not completed.'
              : 'Facebook is not configured.',
          },
        });
      }
      try {
        const userToken = await client.exchangeCode(query.code);
        const [pages, permissions] = await Promise.all([
          client.listPages(userToken),
          client.inspectPermissions(userToken),
        ]);
        const attemptId = await facebook.authorizeFacebookOAuthAttempt(database.db, {
          state: query.state,
          userToken,
          grantedScopes: permissions,
          pages,
          encryptionKey: encryptionKey(config),
        });
        const destination = new URL(
          '/admin/messaging',
          config.authTrustedOrigins[0] ?? new URL(config.authBaseUrl).origin,
        );
        destination.searchParams.set('facebook', 'authorized');
        destination.searchParams.set('attemptId', attemptId);
        return reply.redirect(destination.toString(), 303);
      } catch (error) {
        await facebook.failFacebookOAuthAttempt(database.db, query.state, graphErrorCode(error));
        return reply.code(400).send({
          error: {
            code: graphErrorCode(error),
            message: 'Facebook authorization could not be completed.',
          },
        });
      }
    },
  );

  app.get('/admin/messaging/connections/facebook/availability', async (request, reply) => {
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
        configured: Boolean(client && config.metaWebhookVerifyToken),
        graphApiVersion: config.metaGraphApiVersion ?? null,
        requiredScopes: config.metaOAuthScopes,
        oauthCallbackUrl: config.metaOAuthCallbackUrl ?? null,
      },
    };
  });

  app.post('/admin/messaging/connections/facebook/oauth', async (request, reply) => {
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
          code: 'META_NOT_CONFIGURED',
          message: 'Facebook integration is not configured.',
        },
      });
    const attempt = await facebook.createFacebookOAuthAttempt(database.db, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      membershipId: context.membershipId,
      scopes: config.metaOAuthScopes,
      encryptionKey: encryptionKey(config),
    });
    return reply.code(201).send({
      data: {
        authorizationUrl: client.authorizationUrl(attempt.state, config.metaOAuthScopes),
        attemptId: attempt.id,
        expiresAt: attempt.expiresAt,
      },
    });
  });

  app.get(
    '/admin/messaging/connections/facebook/oauth/:attemptId',
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
          data: await facebook.getFacebookOAuthStatus(database.db, {
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
    '/admin/messaging/connections/facebook',
    {
      schema: {
        body: Type.Object({
          attemptId: Type.String({ format: 'uuid' }),
          pageId: Type.String({ minLength: 1, maxLength: 255 }),
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
      if (!client || !config.metaAppId || !config.metaGraphApiVersion)
        return reply.code(503).send({
          error: {
            code: 'META_NOT_CONFIGURED',
            message: 'Facebook integration is not configured.',
          },
        });
      try {
        const body = request.body as { attemptId: string; pageId: string };
        const id = await facebook.connectFacebookPage(database.db, {
          organizationId: context.organizationId,
          actorId: context.actorId,
          membershipId: context.membershipId,
          attemptId: body.attemptId,
          pageId: body.pageId,
          appId: config.metaAppId,
          graphApiVersion: config.metaGraphApiVersion,
          requiredScopes: config.metaOAuthScopes,
          encryptionKey: encryptionKey(config),
        });
        const credential = await facebook.loadFacebookCredential(database.db, {
          connectionId: id,
          organizationId: context.organizationId,
          encryptionKey: encryptionKey(config),
        });
        try {
          await client.verifyPage(credential.pageId, credential.pageAccessToken);
          await facebook.markFacebookSubscription(database.db, {
            organizationId: context.organizationId,
            connectionId: id,
            healthy: false,
            fields: [],
            errorCode: 'SUBSCRIPTION_NOT_ACTIVATED',
          });
        } catch (error) {
          if (error instanceof MetaGraphError)
            await facebook.recordFacebookProviderFailure(database.db, {
              organizationId: context.organizationId,
              connectionId: id,
              category: error.category,
              code: error.code,
            });
          await facebook.markFacebookSubscription(database.db, {
            organizationId: context.organizationId,
            connectionId: id,
            healthy: false,
            fields: [],
            errorCode: graphErrorCode(error),
          });
        }
        return reply.code(201).send({
          data: await facebook.getFacebookConnection(database.db, context.organizationId, id),
        });
      } catch (error) {
        if (error instanceof facebook.MessagingDomainError)
          return sendMessagingError(reply, error, request.id);
        throw error;
      }
    },
  );

  app.get('/admin/messaging/connections/facebook', async (request, reply) => {
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
    return { data: await facebook.listFacebookConnections(database.db, context.organizationId) };
  });

  app.get(
    '/admin/messaging/connections/facebook/:connectionId',
    { schema: { params: Type.Object({ connectionId: Type.String({ format: 'uuid' }) }) } },
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
          data: await facebook.getFacebookConnection(
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
    '/admin/messaging/connections/facebook/:connectionId',
    {
      schema: {
        params: Type.Object({ connectionId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({ suspended: Type.Boolean() }),
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
      try {
        const connectionId = (request.params as { connectionId: string }).connectionId;
        await facebook.setFacebookConnectionSuspended(database.db, {
          organizationId: context.organizationId,
          connectionId,
          actorId: context.actorId,
          suspended: (request.body as { suspended: boolean }).suspended,
          expectedVersion: parseExpectedVersion(request.headers['if-match']),
        });
        return {
          data: await facebook.getFacebookConnection(
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
    '/admin/messaging/connections/facebook/:connectionId/diagnostics',
    { schema: { params: Type.Object({ connectionId: Type.String({ format: 'uuid' }) }) } },
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
            code: 'META_NOT_CONFIGURED',
            message: 'Facebook integration is not configured.',
          },
        });
      const connectionId = (request.params as { connectionId: string }).connectionId;
      try {
        const credential = await facebook.loadFacebookCredential(database.db, {
          connectionId,
          organizationId: context.organizationId,
          encryptionKey: encryptionKey(config),
        });
        await client.verifyPage(credential.pageId, credential.pageAccessToken);
        const subscription = await client.inspectPageSubscription(
          credential.pageId,
          credential.pageAccessToken,
        );
        const healthy =
          subscription.subscribed &&
          facebook.FACEBOOK_WEBHOOK_FIELDS.every((field) => subscription.fields.includes(field));
        await facebook.markFacebookSubscription(database.db, {
          organizationId: context.organizationId,
          connectionId,
          healthy,
          fields: subscription.fields,
          ...(!healthy ? { errorCode: 'WEBHOOK_SUBSCRIPTION_INCOMPLETE' } : {}),
        });
        return {
          data: await facebook.getFacebookConnection(
            database.db,
            context.organizationId,
            connectionId,
          ),
        };
      } catch (error) {
        if (error instanceof facebook.MessagingDomainError)
          return sendMessagingError(reply, error, request.id);
        if (error instanceof MetaGraphError)
          await facebook.recordFacebookProviderFailure(database.db, {
            organizationId: context.organizationId,
            connectionId,
            category: error.category,
            code: error.code,
          });
        await facebook.markFacebookSubscription(database.db, {
          organizationId: context.organizationId,
          connectionId,
          healthy: false,
          fields: [],
          errorCode: graphErrorCode(error),
        });
        return reply.code(502).send({
          error: {
            code: graphErrorCode(error),
            message: 'Facebook connection verification failed.',
          },
        });
      }
    },
  );

  app.patch(
    '/admin/messaging/connections/facebook/:connectionId/assurance',
    {
      schema: {
        params: Type.Object({ connectionId: Type.String({ format: 'uuid' }) }),
        body: Type.Object(
          {
            permissionReviewStatus: Type.Optional(
              Type.Union([
                Type.Literal('UNKNOWN'),
                Type.Literal('DEVELOPMENT_ONLY'),
                Type.Literal('APP_REVIEW_PENDING'),
                Type.Literal('ADVANCED_ACCESS_CONFIRMED'),
              ]),
            ),
            routingStatus: Type.Optional(
              Type.Union([
                Type.Literal('UNVERIFIED'),
                Type.Literal('OWNER_CONFIRMED'),
                Type.Literal('CONFLICT'),
              ]),
            ),
            operationalStatus: Type.Optional(
              Type.Union([Type.Literal('NOT_RUN'), Type.Literal('PASSED'), Type.Literal('FAILED')]),
            ),
          },
          { minProperties: 1, additionalProperties: false },
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
      try {
        await facebook.updateFacebookAssurance(database.db, {
          organizationId: context.organizationId,
          connectionId,
          actorId: context.actorId,
          expectedVersion: parseExpectedVersion(request.headers['if-match']),
          ...(request.body as {
            permissionReviewStatus?:
              'UNKNOWN' | 'DEVELOPMENT_ONLY' | 'APP_REVIEW_PENDING' | 'ADVANCED_ACCESS_CONFIRMED';
            routingStatus?: 'UNVERIFIED' | 'OWNER_CONFIRMED' | 'CONFLICT';
            operationalStatus?: 'NOT_RUN' | 'PASSED' | 'FAILED';
          }),
        });
        return {
          data: await facebook.getFacebookConnection(
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

  app.put(
    '/admin/messaging/connections/facebook/:connectionId/subscription',
    {
      schema: {
        params: Type.Object({ connectionId: Type.String({ format: 'uuid' }) }),
        body: Type.Object(
          {
            subscribed: Type.Boolean(),
            businessSuiteCoexistenceReviewed: Type.Boolean(),
            routingImpactReviewed: Type.Boolean(),
          },
          { additionalProperties: false },
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
      if (!client)
        return reply.code(503).send({
          error: { code: 'META_NOT_CONFIGURED', message: 'Facebook is not configured.' },
        });
      const connectionId = (request.params as { connectionId: string }).connectionId;
      const body = request.body as {
        subscribed: boolean;
        businessSuiteCoexistenceReviewed: boolean;
        routingImpactReviewed: boolean;
      };
      if (
        body.subscribed &&
        (!body.businessSuiteCoexistenceReviewed || !body.routingImpactReviewed)
      )
        return reply.code(422).send({
          error: {
            code: 'META_ROUTING_REVIEW_REQUIRED',
            message: 'Business Suite coexistence and Conversation Routing must be reviewed first.',
          },
        });
      try {
        await facebook.assertFacebookConnectionVersion(database.db, {
          organizationId: context.organizationId,
          connectionId,
          expectedVersion: parseExpectedVersion(request.headers['if-match']),
        });
        const credential = await facebook.loadFacebookCredential(database.db, {
          organizationId: context.organizationId,
          connectionId,
          encryptionKey: encryptionKey(config),
        });
        if (body.subscribed && credential.routingStatus !== 'OWNER_CONFIRMED')
          return reply.code(409).send({
            error: {
              code: 'META_ROUTING_NOT_CONFIRMED',
              message: 'Conversation Routing must be owner-confirmed before subscription.',
            },
          });
        if (body.subscribed)
          await client.subscribePage(
            credential.pageId,
            credential.pageAccessToken,
            facebook.FACEBOOK_WEBHOOK_FIELDS,
          );
        else await client.unsubscribePage(credential.pageId, credential.pageAccessToken);
        await facebook.markFacebookSubscription(database.db, {
          organizationId: context.organizationId,
          connectionId,
          healthy: body.subscribed,
          fields: body.subscribed ? facebook.FACEBOOK_WEBHOOK_FIELDS : [],
          actorId: context.actorId,
          ...(!body.subscribed ? { errorCode: 'SUBSCRIPTION_DISABLED' } : {}),
        });
        return {
          data: await facebook.getFacebookConnection(
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

  app.delete(
    '/admin/messaging/connections/facebook/:connectionId',
    { schema: { params: Type.Object({ connectionId: Type.String({ format: 'uuid' }) }) } },
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
      let revokeError: string | undefined;
      if (client)
        try {
          const credential = await facebook.loadFacebookCredential(database.db, {
            connectionId,
            organizationId: context.organizationId,
            encryptionKey: encryptionKey(config),
          });
          await client.unsubscribePage(credential.pageId, credential.pageAccessToken);
        } catch (error) {
          revokeError = graphErrorCode(error);
        }
      try {
        await facebook.disconnectFacebookConnection(database.db, {
          organizationId: context.organizationId,
          connectionId,
          actorId: context.actorId,
          ...(revokeError ? { errorCode: `UNSUBSCRIBE_${revokeError}` } : {}),
        });
        return reply.code(204).send();
      } catch (error) {
        return sendMessagingError(reply, error, request.id);
      }
    },
  );

  app.get(
    '/admin/messaging/conversations/:conversationId/facebook-reply-eligibility',
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
          .send({ error: { code: 'FORBIDDEN', message: 'Messaging reply access is required.' } });
      try {
        const conversationId = (request.params as { conversationId: string }).conversationId;
        if (!hasMessagingInboxAccess(context))
          return reply
            .code(403)
            .send({ error: { code: 'FORBIDDEN', message: 'Messaging inbox access is required.' } });
        await facebook.getConversation(database.db, {
          organizationId: context.organizationId,
          conversationId,
          membershipId: context.membershipId,
          access: messagingAccess(context),
        });
        return {
          data: await facebook.getFacebookReplyEligibility(database.db, {
            organizationId: context.organizationId,
            conversationId,
          }),
        };
      } catch (error) {
        return sendMessagingError(reply, error, request.id);
      }
    },
  );

  app.post(
    '/admin/messaging/connections/facebook/:connectionId/syncs',
    { schema: { params: Type.Object({ connectionId: Type.String({ format: 'uuid' }) }) } },
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
          data: await facebook.createFacebookSyncJob(database.db, {
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
    '/admin/messaging/connections/facebook/syncs/:syncId',
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
          data: await facebook.getFacebookSyncJob(
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
