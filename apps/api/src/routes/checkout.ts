import { CheckoutRequestError } from './checkout-errors.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import type {
  CreateCheckoutDraftDto,
  UpdateCheckoutDraftDto,
  AdoptCheckoutDraftDto,
  CheckoutSourceDto,
} from '@maevelle/contracts';
import {
  createCheckoutDraft,
  getCheckoutDraft,
  updateCheckoutDraft,
  adoptCheckoutDraft,
  createCheckoutGuestSession,
  revokeCheckoutGuestSession,
} from '@maevelle/database/checkout';
import { resolveStorefrontContext } from '@maevelle/database/storefront';
import { cartCookies, guestCookiePrefix, type CartShopperResolver } from './cart-context.js';
import { hasShopperSessionCookie } from '../auth/shopper-partition.js';
import {
  checkoutRequestContext,
  checkoutGuestAuthority,
  checkoutGuestCookieName,
} from './checkout-context.js';
import { protectCheckoutRoutes } from './checkout-protection.js';

const uuid = Type.String({ format: 'uuid' });
const revision = Type.String({ pattern: '^[1-9][0-9]{0,18}$', maxLength: 19 });
const source = Type.Union([
  Type.Object(
    { kind: Type.Literal('CART'), cartId: uuid, cartRevision: revision },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('BUY_NOW'),
      variantId: uuid,
      quantity: Type.String({ pattern: '^[1-9][0-9]?$', maxLength: 2 }),
    },
    { additionalProperties: false },
  ),
]);
const params = Type.Object({ id: uuid }, { additionalProperties: false });
function intentKey(request: FastifyRequest) {
  const key = request.headers['idempotency-key'];
  if (
    typeof key !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)
  )
    throw new CheckoutRequestError('INVALID_REQUEST', 400, 'A UUID idempotency key is required.');
  return key.toLowerCase();
}
/** Reject before Fastify's default removeAdditional/coercion can change request intent. */
function strictBody(request: FastifyRequest, allowed: readonly string[]) {
  const body = request.body;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !allowed.includes(k))
  )
    throw new CheckoutRequestError('INVALID_REQUEST', 400, 'Unknown or invalid Checkout field.');
  const input = body as Record<string, unknown>;
  if ('revision' in input && typeof input.revision !== 'string')
    throw new CheckoutRequestError('INVALID_REQUEST', 400, 'Revision must be a string.');
  if ('source' in input) {
    const item = input.source as Record<string, unknown> | null;
    const fields =
      item?.kind === 'CART'
        ? ['kind', 'cartId', 'cartRevision']
        : ['kind', 'variantId', 'quantity'];
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      Object.keys(item).some((k) => !fields.includes(k)) ||
      Object.values(item).some((value) => typeof value !== 'string')
    )
      throw new CheckoutRequestError('INVALID_REQUEST', 400, 'Invalid Checkout source fields.');
  }
}
export function registerCheckoutRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  config: RuntimeConfig,
  resolveShopper: CartShopperResolver,
) {
  app.register(async (checkout) => {
    protectCheckoutRoutes(checkout, database, config);
    checkout.post(
      '/storefront/v1/checkout/guest-sessions',
      {
        bodyLimit: 1024,
        preValidation: async (r) => strictBody(r, []),
        schema: { body: Type.Object({}, { additionalProperties: false }) },
      },
      async (request, reply) => {
        if (
          hasShopperSessionCookie(request.headers.cookie) ||
          (await resolveShopper(request, true))
        )
          throw new CheckoutRequestError(
            'OWNER_CHANGED',
            409,
            'Use your account Checkout authority.',
          );
        const context = await resolveStorefrontContext(
          database.db,
          config.storefrontOrganizationCode,
        );
        if (!context)
          throw new CheckoutRequestError(
            'UNAVAILABLE',
            503,
            'Checkout configuration is unavailable.',
          );
        const slots = (request.headers.cookie ?? '')
          .split(';')
          .filter((p) => p.includes('maevelle_checkout_guest_'));
        if (slots.length >= 16)
          throw new CheckoutRequestError(
            'GUEST_CONTEXT_LIMIT',
            409,
            'Resolve existing Checkout sessions first.',
          );
        const result = await createCheckoutGuestSession(database.db, context);
        const secure = config.nodeEnv === 'production';
        reply.header(
          'set-cookie',
          `${checkoutGuestCookieName(result.session.id, secure)}=${result.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure ? '; Secure' : ''}`,
        );
        return reply.code(201).send({ data: result.session });
      },
    );
    checkout.delete(
      '/storefront/v1/checkout/guest-sessions/:id',
      {
        bodyLimit: 1024,
        preValidation: async (r) => strictBody(r, []),
        schema: { params, body: Type.Object({}, { additionalProperties: false }) },
      },
      async (request, reply) => {
        const { owner } = await checkoutRequestContext(database, config, request, resolveShopper);
        if (owner.kind !== 'GUEST' || owner.sessionId !== (request.params as { id: string }).id)
          throw new CheckoutRequestError('NOT_FOUND', 404, 'Guest session was not found.');
        await revokeCheckoutGuestSession(database.db, owner);
        reply.header(
          'set-cookie',
          `${checkoutGuestCookieName(owner.sessionId, config.nodeEnv === 'production')}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.nodeEnv === 'production' ? '; Secure' : ''}`,
        );
        return { data: { revoked: true } };
      },
    );
    const cartToken = (
      request: FastifyRequest,
      intent: CheckoutSourceDto | undefined,
      guest: boolean,
    ) => {
      if (!guest || intent?.kind !== 'CART') return undefined;
      // The explicit source ID selects a slot. Liveness belongs to the Cart domain
      // after Checkout receipt replay, so a lost response survives Cart expiry.
      const secure = config.nodeEnv === 'production';
      const tokens = cartCookies(request, secure);
      const name = `${guestCookiePrefix(secure)}${intent.cartId.toLowerCase().replaceAll('-', '')}`;
      const pair = (request.headers.cookie ?? '')
        .split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${name}=`));
      const token = pair?.slice(name.length + 1);
      return token && tokens.includes(token) ? token : undefined;
    };
    checkout.post(
      '/storefront/v1/checkouts',
      {
        bodyLimit: 4096,
        preValidation: async (r) => strictBody(r, ['source']),
        schema: { body: Type.Object({ source }, { additionalProperties: false }) },
      },
      async (request, reply) => {
        const { owner, context } = await checkoutRequestContext(
          database,
          config,
          request,
          resolveShopper,
        );
        const input = request.body as CreateCheckoutDraftDto;
        const result = await createCheckoutDraft(
          database.db,
          context,
          owner,
          input,
          intentKey(request),
          cartToken(request, input.source, owner.kind === 'GUEST'),
        );
        return reply.code(201).send({ data: result });
      },
    );
    checkout.get('/storefront/v1/checkouts/:id', { schema: { params } }, async (request) => {
      const { owner } = await checkoutRequestContext(database, config, request, resolveShopper);
      return {
        data: await getCheckoutDraft(database.db, owner, (request.params as { id: string }).id),
      };
    });
    checkout.patch(
      '/storefront/v1/checkouts/:id',
      {
        bodyLimit: 4096,
        preValidation: async (r) => strictBody(r, ['revision', 'source', 'action']),
        schema: {
          params,
          body: Type.Object(
            {
              revision,
              source: Type.Optional(source),
              action: Type.Optional(Type.Literal('ABANDON')),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (request) => {
        const { owner, context } = await checkoutRequestContext(
          database,
          config,
          request,
          resolveShopper,
        );
        const input = request.body as UpdateCheckoutDraftDto;
        return {
          data: await updateCheckoutDraft(
            database.db,
            context,
            owner,
            (request.params as { id: string }).id,
            input,
            intentKey(request),
            cartToken(request, input.source, owner.kind === 'GUEST'),
          ),
        };
      },
    );
    checkout.post(
      '/storefront/v1/checkouts/:id/adoptions',
      {
        bodyLimit: 1024,
        preValidation: async (r) => strictBody(r, ['revision']),
        schema: { params, body: Type.Object({ revision }, { additionalProperties: false }) },
      },
      async (request) => {
        const { owner, context } = await checkoutRequestContext(
          database,
          config,
          request,
          resolveShopper,
        );
        if (owner.kind !== 'ACCOUNT')
          throw new CheckoutRequestError(
            'SHOPPER_SESSION_REQUIRED',
            401,
            'Sign in before adopting a draft.',
          );
        return {
          data: await adoptCheckoutDraft(
            database.db,
            owner,
            checkoutGuestAuthority(request, config, context.organizationId),
            (request.params as { id: string }).id,
            (request.body as AdoptCheckoutDraftDto).revision,
            intentKey(request),
          ),
        };
      },
    );
  });
}
