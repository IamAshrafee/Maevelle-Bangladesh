import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type {
  ReplaceGuestCartLineVariantRequestDto,
  WishlistCartTransferRequestDto,
} from '@maevelle/contracts';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import {
  addCartLine,
  applyCartCoupon,
  createGuestCart,
  clearCart,
  getGuestCart,
  establishAccountCart,
  getAccountCart,
  type CartMutationScope,
  removeCartCoupon,
  removeCartLine,
  replaceCartLineVariant,
  setCartLineQuantity,
  transferAccountWishlistItem,
} from '@maevelle/database/cart';
import { protectCartRoutes } from './cart-protection.js';
import {
  CartRequestError,
  guestCookiePrefix,
  requireAccountCartOwner,
  resolveCartRequest,
  type CartShopperResolver,
} from './cart-context.js';
import { cartIntentKey, object, uuid, version } from './cart-schemas.js';
import { registerCartMergeRoutes } from './cart-merge.js';

const common = { version, ownerContext: Type.Optional(uuid) };
const units = Type.String({ pattern: '^[1-9][0-9]?$', maxLength: 2 });

/** Encapsulation keeps Cart protection/error behavior out of unrelated dirty routes. */
export function registerCartRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  config: RuntimeConfig,
  resolveShopper: CartShopperResolver,
): void {
  registerCartFamily(app, database, config, resolveShopper, 'guest');
  registerCartFamily(app, database, config, resolveShopper, 'account');
}

function registerCartFamily(
  app: FastifyInstance,
  database: DatabaseClient,
  config: RuntimeConfig,
  resolveShopper: CartShopperResolver,
  family: 'guest' | 'account',
): void {
  const account = family === 'account';
  app.register(async (cart) => {
    const base = account ? '/storefront/v1/carts/account' : '/storefront/v1/carts';
    protectCartRoutes(cart, database, config);
    if (account) registerCartMergeRoutes(cart, base, database, config, resolveShopper);
    const resolve = async (request: Parameters<CartShopperResolver>[0]) => {
      const resolved = await resolveCartRequest(database, config, request, resolveShopper, account);
      if (!account && resolved.owner?.kind === 'ACCOUNT')
        throw new CartRequestError(
          'ACCOUNT_CART_NOT_READY',
          409,
          'This route is for guest Cart sessions. Your guest Cart has not been changed.',
        );
      return resolved;
    };
    cart.post(
      base,
      {
        bodyLimit: 65_536,
        schema: {
          body: account
            ? object({})
            : object({
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
        if (account)
          return {
            data: await establishAccountCart(database.db, requireAccountCartOwner(resolved.owner)),
          };
        if (resolved.token) return { data: await getGuestCart(database.db, resolved.token) };
        const created = await createGuestCart(database.db, resolved.context);
        const secure = config.nodeEnv === 'production';
        const cookie = `${guestCookiePrefix(secure)}${created.cart.id.replaceAll('-', '')}=${created.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? '; Secure' : ''}`;
        reply.header('set-cookie', cookie);
        return reply.code(201).send({ data: created.cart });
      },
    );
    cart.get(`${base}/current`, async (request) => {
      const resolved = await resolve(request);
      if (account)
        return {
          data: await getAccountCart(database.db, requireAccountCartOwner(resolved.owner)),
        };
      if (!resolved.token)
        throw new CartRequestError('NOT_FOUND', 404, 'No guest Cart session is established.');
      return { data: await getGuestCart(database.db, resolved.token) };
    });
    const mutation = async (
      request: Parameters<CartShopperResolver>[0],
    ): Promise<CartMutationScope> => {
      const resolved = await resolve(request);
      const body = request.body as { version: number; ownerContext?: string };
      if (account) {
        const accountOwner = requireAccountCartOwner(resolved.owner);
        const key = cartIntentKey(request);
        const header = request.headers['x-cart-context'];
        if (!body.ownerContext)
          throw new CartRequestError(
            'OWNER_CONTEXT_REQUIRED',
            409,
            'Supply the observed account Cart owner context in the request.',
          );
        if (header !== undefined && header !== body.ownerContext)
          throw new CartRequestError('OWNER_CHANGED', 409, 'Cart context preconditions disagree.');
        return {
          account: accountOwner,
          ownerContext: body.ownerContext,
          expectedVersion: body.version,
          idempotencyKey: key,
        };
      }
      if (!resolved.token || resolved.owner?.kind !== 'GUEST')
        throw new CartRequestError(
          'SESSION_ESTABLISHMENT_REQUIRED',
          409,
          'Establish a guest session and return its cookie before changing the Cart.',
        );
      const key = cartIntentKey(request);
      if (!body.ownerContext && !request.headers['x-cart-context'])
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
        idempotencyKey: key,
      };
    };
    if (account)
      cart.post(
        `${base}/current/wishlist-transfers`,
        {
          bodyLimit: 65_536,
          schema: {
            body: Type.Object(
              {
                version,
                ownerContext: uuid,
                action: Type.Union([Type.Literal('ADD'), Type.Literal('MOVE')]),
                productId: uuid,
                variantId: uuid,
                quantity: units,
                wishlistVersion: version,
              },
              { additionalProperties: false },
            ),
          },
        },
        async (request) => {
          const scope = await mutation(request);
          if (!('account' in scope))
            throw new CartRequestError('OWNER_CHANGED', 409, 'Account Cart authority is required.');
          const { action, productId, variantId, quantity, wishlistVersion } =
            request.body as WishlistCartTransferRequestDto;
          return {
            data: await transferAccountWishlistItem(database.db, scope, {
              action,
              productId,
              variantId,
              quantity,
              wishlistVersion,
            }),
          };
        },
      );
    cart.delete(
      `${base}/current`,
      { bodyLimit: 65_536, schema: { body: object(common) } },
      async (request) => ({ data: await clearCart(database.db, await mutation(request)) }),
    );
    // Explicit browser recovery. Forget local credentials only; retain every Cart and receipt.
    // No credential is adopted, rotated, transferred or returned by this operation.
    if (!account)
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
      `${base}/current/lines`,
      {
        bodyLimit: 65_536,
        schema: { body: object({ ...common, variantId: uuid, quantity: units }) },
      },
      async (request) => {
        const body = request.body as { variantId: string; quantity: string };
        return {
          data: await addCartLine(database.db, {
            ...(await mutation(request)),
            variantId: body.variantId,
            quantity: body.quantity,
          }),
        };
      },
    );
    cart.patch(
      `${base}/current/lines/:lineId`,
      {
        bodyLimit: 65_536,
        schema: {
          params: object({ lineId: uuid }),
          body: object({ ...common, quantity: units }),
        },
      },
      async (request) => {
        const scope = await mutation(request);
        return {
          data: await setCartLineQuantity(database.db, {
            ...scope,
            lineId: (request.params as { lineId: string }).lineId,
            quantity: (request.body as { quantity: string }).quantity,
          }),
        };
      },
    );
    cart.put(
      `${base}/current/lines/:lineId/variant`,
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
          data: await replaceCartLineVariant(database.db, {
            ...(await mutation(request)),
            lineId: (request.params as { lineId: string }).lineId,
            targetVariantId,
            quantity,
          }),
        };
      },
    );
    cart.delete(
      `${base}/current/lines/:lineId`,
      {
        bodyLimit: 65_536,
        schema: { params: object({ lineId: uuid }), body: object(common) },
      },
      async (request) => ({
        data: await removeCartLine(database.db, {
          ...(await mutation(request)),
          lineId: (request.params as { lineId: string }).lineId,
        }),
      }),
    );
    cart.post(
      `${base}/current/coupons`,
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
        data: await applyCartCoupon(database.db, {
          ...(await mutation(request)),
          couponCode: (request.body as { couponCode: string }).couponCode,
        }),
      }),
    );
    cart.delete(
      `${base}/current/coupons/:couponCode`,
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
        data: await removeCartCoupon(database.db, {
          ...(await mutation(request)),
          couponCode: (request.params as { couponCode: string }).couponCode,
        }),
      }),
    );
  });
}
