import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { ReplaceGuestCartLineVariantRequestDto } from '@maevelle/contracts';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import {
  addGuestCartLine,
  applyGuestCartCoupon,
  createGuestCart,
  clearGuestCart,
  getGuestCart,
  removeGuestCartCoupon,
  removeGuestCartLine,
  replaceGuestCartLineVariant,
  setGuestCartLineQuantity,
} from '@maevelle/database/cart';
import { protectCartRoutes } from './cart-protection.js';
import {
  CartRequestError,
  guestCookiePrefix,
  resolveCartRequest,
  type CartShopperResolver,
} from './cart-context.js';

const uuid = Type.String({ format: 'uuid' });
const version = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 1 });
const common = { version, ownerContext: Type.Optional(uuid) };
const units = Type.String({ pattern: '^[1-9][0-9]?$', maxLength: 2 });
const object = (
  properties: Record<
    string,
    ReturnType<typeof Type.String> | typeof version | ReturnType<typeof Type.Optional>
  >,
) => Type.Object(properties, { additionalProperties: false });

/** Encapsulation keeps Cart protection/error behavior out of unrelated dirty routes. */
export function registerCartRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  config: RuntimeConfig,
  resolveShopper: CartShopperResolver,
): void {
  app.register(async (cart) => {
    protectCartRoutes(cart, database, config);
    const resolve = async (request: Parameters<CartShopperResolver>[0]) => {
      const resolved = await resolveCartRequest(database, config, request, resolveShopper);
      if (resolved.owner?.kind === 'ACCOUNT')
        throw new CartRequestError(
          'ACCOUNT_CART_NOT_READY',
          409,
          'Account Cart integration is not available yet. Your guest Cart has not been changed.',
        );
      return resolved;
    };
    cart.post(
      '/storefront/v1/carts',
      {
        bodyLimit: 65_536,
        schema: {
          body: object({
            organizationId: Type.Optional(uuid),
            currency: Type.Optional(Type.String({ pattern: '^[A-Z]{3}$' })),
            ownerContext: Type.Optional(uuid),
          }),
        },
      },
      async (request, reply) => {
        const resolved = await resolve(request);
        const body = request.body as { organizationId?: string; currency?: string };
        // Legacy fields are checked as assertions, never used as authority.
        if (
          (body.organizationId && body.organizationId !== resolved.context.organizationId) ||
          (body.currency && body.currency !== resolved.context.currency)
        )
          throw new CartRequestError(
            'INVALID_CONFIGURATION',
            422,
            'Cart context does not match this storefront.',
          );
        if (resolved.token) return { data: await getGuestCart(database.db, resolved.token) };
        const created = await createGuestCart(database.db, resolved.context);
        const secure = config.nodeEnv === 'production';
        const cookie = `${guestCookiePrefix(secure)}${created.cart.id.replaceAll('-', '')}=${created.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? '; Secure' : ''}`;
        reply.header('set-cookie', cookie);
        return reply.code(201).send({ data: created.cart });
      },
    );
    cart.get('/storefront/v1/carts/current', async (request) => {
      const resolved = await resolve(request);
      if (!resolved.token)
        throw new CartRequestError('NOT_FOUND', 404, 'No guest Cart session is established.');
      return { data: await getGuestCart(database.db, resolved.token) };
    });
    const mutation = async (request: Parameters<CartShopperResolver>[0]) => {
      const resolved = await resolve(request);
      if (!resolved.token || !resolved.owner || resolved.owner.kind !== 'GUEST')
        throw new CartRequestError(
          'SESSION_ESTABLISHMENT_REQUIRED',
          409,
          'Establish a guest session and return its cookie before changing the Cart.',
        );
      const body = request.body as { version: number; ownerContext?: string };
      const key = request.headers['idempotency-key'];
      if (
        key !== undefined &&
        (typeof key !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
      )
        throw new CartRequestError('INVALID_REQUEST', 400, 'Idempotency key must be a UUID.');
      if (!key)
        throw new CartRequestError(
          'INTENT_KEY_REQUIRED',
          400,
          'Every Cart mutation requires a UUID idempotency key.',
        );
      if (key && !body.ownerContext && !request.headers['x-cart-context'])
        throw new CartRequestError(
          'OWNER_CONTEXT_REQUIRED',
          409,
          'Explicit intents require the observed Cart owner context.',
        );
      return {
        token: resolved.token,
        expectedVersion: body.version,
        organizationId: resolved.context.organizationId,
        currency: resolved.context.currency,
        ownerContext: resolved.owner.ownerContext,
        ...(typeof key === 'string' ? { idempotencyKey: key } : {}),
      };
    };
    cart.delete(
      '/storefront/v1/carts/current',
      { bodyLimit: 65_536, schema: { body: object(common) } },
      async (request) => ({ data: await clearGuestCart(database.db, await mutation(request)) }),
    );
    // Explicit browser recovery. Forget local credentials only; retain every Cart and receipt.
    // No credential is adopted, rotated, transferred or returned by this operation.
    cart.delete(
      '/storefront/v1/carts/session',
      { bodyLimit: 65_536, schema: { body: object({}) } },
      async (request, reply) => {
        const secure = config.nodeEnv === 'production';
        const names = new Set(
          (request.headers.cookie ?? '')
            .split(';')
            .map((part) => part.trim().split('=')[0]!)
            .filter(
              (name) =>
                name === 'maevelle_cart' ||
                /^(?:__Host-)?maevelle_cart_[A-Za-z0-9_-]{1,200}$/.test(name),
            ),
        );
        if (names.size > 33)
          throw new CartRequestError(
            'CART_CONTEXT_LIMIT',
            409,
            'Clear this site’s Cart cookies in browser settings.',
          );
        if (names.size)
          reply.header(
            'set-cookie',
            [...names].map(
              (name) =>
                `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
            ),
          );
        return { data: { sessionForgotten: true } };
      },
    );
    cart.post(
      '/storefront/v1/carts/current/lines',
      {
        bodyLimit: 65_536,
        schema: { body: object({ ...common, variantId: uuid, quantity: units }) },
      },
      async (request) => {
        const body = request.body as { variantId: string; quantity: string };
        return {
          data: await addGuestCartLine(database.db, {
            ...(await mutation(request)),
            variantId: body.variantId,
            quantity: body.quantity,
          }),
        };
      },
    );
    cart.patch(
      '/storefront/v1/carts/current/lines/:lineId',
      {
        bodyLimit: 65_536,
        schema: { params: object({ lineId: uuid }), body: object({ ...common, quantity: units }) },
      },
      async (request) => {
        const scope = await mutation(request);
        return {
          data: await setGuestCartLineQuantity(database.db, {
            ...scope,
            lineId: (request.params as { lineId: string }).lineId,
            quantity: (request.body as { quantity: string }).quantity,
          }),
        };
      },
    );
    cart.put(
      '/storefront/v1/carts/current/lines/:lineId/variant',
      {
        bodyLimit: 65_536,
        schema: {
          params: object({ lineId: uuid }),
          body: object({ ...common, targetVariantId: uuid, quantity: units }),
        },
      },
      async (request) => {
        const { targetVariantId, quantity } = request.body as ReplaceGuestCartLineVariantRequestDto;
        return {
          data: await replaceGuestCartLineVariant(database.db, {
            ...(await mutation(request)),
            lineId: (request.params as { lineId: string }).lineId,
            targetVariantId,
            quantity,
          }),
        };
      },
    );
    cart.delete(
      '/storefront/v1/carts/current/lines/:lineId',
      {
        bodyLimit: 65_536,
        schema: { params: object({ lineId: uuid }), body: object(common) },
      },
      async (request) => ({
        data: await removeGuestCartLine(database.db, {
          ...(await mutation(request)),
          lineId: (request.params as { lineId: string }).lineId,
        }),
      }),
    );
    cart.post(
      '/storefront/v1/carts/current/coupons',
      {
        bodyLimit: 65_536,
        schema: {
          body: object({
            ...common,
            couponCode: Type.String({ minLength: 2, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' }),
          }),
        },
      },
      async (request) => ({
        data: await applyGuestCartCoupon(database.db, {
          ...(await mutation(request)),
          couponCode: (request.body as { couponCode: string }).couponCode,
        }),
      }),
    );
    cart.delete(
      '/storefront/v1/carts/current/coupons/:couponCode',
      {
        bodyLimit: 65_536,
        schema: {
          params: object({
            couponCode: Type.String({ minLength: 2, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' }),
          }),
          body: object(common),
        },
      },
      async (request) => ({
        data: await removeGuestCartCoupon(database.db, {
          ...(await mutation(request)),
          couponCode: (request.params as { couponCode: string }).couponCode,
        }),
      }),
    );
  });
}
