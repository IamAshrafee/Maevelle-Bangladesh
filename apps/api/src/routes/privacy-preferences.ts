import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHmac } from 'node:crypto';
import { Type } from 'typebox';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import type { SavePrivacyPreferencesDto } from '@maevelle/contracts';
import { incrementAuthStorageValue } from '@maevelle/database/platform';
import {
  PrivacyAuthorityError,
  lockPrivacyOwner,
  privacyBrowserSession,
  privacyContext,
  readPrivacyPreferences,
  savePrivacyPreferences,
  ingestAuthorizedObservation,
  unconsentedObservation,
  type StorefrontEventInput,
} from '@maevelle/database/analytics';
import type { CartShopperResolver } from './cart-context.js';
import { resolvePrivacyOwner, privacyCookie, privacyCookieName } from './privacy-context.js';
import { rateLimitClientIp } from '../rate-limit-client.js';

const revision = Type.String({ pattern: '^(0|[1-9][0-9]{0,17})$' });
const choice = Type.Object(
  {
    decision: Type.Union([Type.Literal('GRANTED'), Type.Literal('DENIED')]),
    expectedRevision: revision,
    expectedBrowserRevision: revision,
  },
  { additionalProperties: false },
);
const schema = Type.Object(
  {
    policyVersion: Type.String({ maxLength: 64 }),
    choices: Type.Object(
      { ANALYTICS: choice, ADVERTISING: choice },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
const fail = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.code(status).send({ error: { code, message } });

export function registerPrivacyPreferencesRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  config: RuntimeConfig,
  resolveShopper: CartShopperResolver,
) {
  const secure = config.nodeEnv === 'production';
  const protect = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('cache-control', 'private, no-store').header('referrer-policy', 'no-referrer');
    if (
      request.headers['x-privacy-request'] !== '1' ||
      (request.headers.origin &&
        request.headers.origin !== new URL(config.storefrontBaseUrl).origin) ||
      (request.method !== 'GET' &&
        request.headers.origin !== new URL(config.storefrontBaseUrl).origin) ||
      (request.headers['sec-fetch-site'] &&
        !['same-origin', 'same-site', 'none'].includes(request.headers['sec-fetch-site']))
    )
      return fail(reply, 403, 'ORIGIN_REJECTED', 'Privacy request origin is not trusted.');
    if (Object.keys(request.query as object).length)
      return fail(reply, 400, 'INVALID_REQUEST', 'Query parameters are not supported.');
    const ip = rateLimitClientIp(request, config.apiTrustedGatewayIp);
    if (!ip) return fail(reply, 503, 'UNAVAILABLE', 'Request protection is unavailable.');
    const key = createHmac('sha256', config.betterAuthSecret)
      .update(`privacy-rate:v1:${ip}:${request.method}`)
      .digest('hex');
    if (
      (await incrementAuthStorageValue(database.db, key, 60)) >
      (request.method === 'GET' ? 120 : 30)
    ) {
      reply.header('retry-after', '60');
      return fail(reply, 429, 'RATE_LIMITED', 'Too many privacy requests. Try again shortly.');
    }
  };
  app.register(async (privacy) => {
    privacy.setErrorHandler((error, _request, reply) => {
      reply.header('cache-control', 'private, no-store');
      if (error instanceof PrivacyAuthorityError)
        return fail(
          reply,
          error.code === 'SESSION_EXPIRED' ? 401 : 409,
          error.code,
          error.code === 'CONSENT_REVISION_CONFLICT'
            ? 'Your choices changed. Reload and review them before saving.'
            : 'Reload privacy preferences for your current session.',
        );
      const transport = error as { validation?: unknown; statusCode?: number };
      const invalid = transport.validation || transport.statusCode === 400;
      return fail(
        reply,
        transport.statusCode === 413 ? 413 : invalid ? 400 : 503,
        transport.statusCode === 413
          ? 'PAYLOAD_TOO_LARGE'
          : invalid
            ? 'INVALID_REQUEST'
            : 'UNAVAILABLE',
        invalid
          ? 'Enter valid privacy choices.'
          : 'Privacy preferences are temporarily unavailable.',
      );
    });
    privacy.get(
      '/storefront/v1/analytics/consent',
      { onRequest: protect },
      async (request, reply) => {
        const owner = await resolvePrivacyOwner(database, config, request, resolveShopper);
        let token: string | undefined;
        try {
          token = privacyCookie(request, secure);
        } catch {
          /* A malformed preference cookie cannot select an existing subject. */
        }
        const result = await database.db.transaction().execute(async (tx) => {
          await lockPrivacyOwner(tx, owner);
          // Bootstrap limits use durable, purpose-scoped counters and never include contact data.
          if (!token) {
            const ip = rateLimitClientIp(request, config.apiTrustedGatewayIp)!;
            const key = createHmac('sha256', config.betterAuthSecret)
              .update(`privacy-bootstrap:v1:${ip}`)
              .digest('hex');
            if ((await incrementAuthStorageValue(tx, key, 60)) > 12)
              throw new PrivacyAuthorityError('PRIVACY_CONTEXT_CHANGED');
          }
          const browser = await privacyBrowserSession(tx, owner, token, true);
          return {
            ...browser,
            data: await readPrivacyPreferences(tx, owner, browser.session, config.betterAuthSecret),
          };
        });
        if (result.token)
          reply.header(
            'set-cookie',
            `${privacyCookieName(secure)}=${result.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((result.session.expires_at.valueOf() - Date.now()) / 1000))}${secure ? '; Secure' : ''}`,
          );
        return { data: result.data };
      },
    );
    privacy.put(
      '/storefront/v1/analytics/consent',
      {
        onRequest: protect,
        bodyLimit: 2048,
        schema: { body: schema },
        preValidation: async (request, reply) => {
          const b = request.body as Record<string, unknown> | null;
          const exact = (v: unknown, keys: string[]) =>
            v &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            Object.keys(v).length === keys.length &&
            Object.keys(v).every((k) => keys.includes(k));
          if (
            !exact(b, ['policyVersion', 'choices']) ||
            !exact(b?.choices, ['ANALYTICS', 'ADVERTISING']) ||
            !Object.values(b!.choices as object).every((v) =>
              exact(v, ['decision', 'expectedRevision', 'expectedBrowserRevision']),
            )
          )
            return fail(
              reply,
              400,
              'INVALID_REQUEST',
              'Only purpose decisions and revision preconditions are accepted.',
            );
        },
      },
      async (request) => {
        const owner = await resolvePrivacyOwner(database, config, request, resolveShopper);
        return {
          data: await database.db.transaction().execute(async (tx) => {
            await lockPrivacyOwner(tx, owner);
            const { session } = await privacyBrowserSession(
              tx,
              owner,
              privacyCookie(request, secure),
              false,
            );
            if (
              request.headers['x-privacy-context'] !==
              privacyContext(config.betterAuthSecret, owner, session)
            )
              throw new PrivacyAuthorityError('PRIVACY_CONTEXT_CHANGED');
            await savePrivacyPreferences(
              tx,
              owner,
              session,
              request.body as SavePrivacyPreferencesDto,
            );
            return readPrivacyPreferences(tx, owner, session, config.betterAuthSecret);
          }),
        };
      },
    );
  });
  return async (request: FastifyRequest, input: StorefrontEventInput) => {
    try {
      const owner = await resolvePrivacyOwner(database, config, request, resolveShopper);
      return await database.db.transaction().execute(async (tx) => {
        await lockPrivacyOwner(tx, owner);
        const { session } = await privacyBrowserSession(
          tx,
          owner,
          privacyCookie(request, secure),
          false,
        );
        return ingestAuthorizedObservation(
          tx,
          owner,
          session,
          config.betterAuthSecret,
          typeof request.headers['x-privacy-context'] === 'string'
            ? request.headers['x-privacy-context']
            : undefined,
          typeof request.headers['x-privacy-observation'] === 'string'
            ? request.headers['x-privacy-observation']
            : undefined,
          input,
        );
      });
    } catch (error) {
      if (error instanceof PrivacyAuthorityError) return unconsentedObservation();
      throw error;
    }
  };
}
