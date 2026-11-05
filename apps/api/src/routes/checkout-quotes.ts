import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import type { CreateCheckoutQuoteDto, AcknowledgeCheckoutQuoteDto } from '@maevelle/contracts';
import {
  createCheckoutQuote,
  getCheckoutQuote,
  acknowledgeCheckoutQuote,
  getCheckoutDraft,
} from '@maevelle/database/checkout';
import { checkoutRequestContext } from './checkout-context.js';
import { cartCookies, guestCookiePrefix, type CartShopperResolver } from './cart-context.js';
import { strictBody, intentKey } from './checkout-input.js';
import { CheckoutRequestError } from './checkout-errors.js';

const uuid = Type.String({ format: 'uuid' });
const revision = Type.String({ pattern: '^[1-9][0-9]{0,18}$', maxLength: 19 });
const params = Type.Object({ id: uuid }, { additionalProperties: false });
const quoteParams = Type.Object({ id: uuid, quoteId: uuid }, { additionalProperties: false });
export function registerCheckoutQuoteRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  config: RuntimeConfig,
  resolveShopper: CartShopperResolver,
) {
  const context = async (request: FastifyRequest) => {
    const { owner } = await checkoutRequestContext(database, config, request, resolveShopper);
    const { id } = request.params as { id: string };
    // Source selects the cookie slot; the quote transaction rechecks Cart authority/revision.
    const draft = await getCheckoutDraft(database.db, owner, id);
    let token: string | undefined;
    if (owner.kind === 'GUEST' && draft.source.kind === 'CART') {
      const secure = config.nodeEnv === 'production';
      const name = `${guestCookiePrefix(secure)}${draft.source.cartId.replaceAll('-', '')}`;
      const pair = (request.headers.cookie ?? '')
        .split(';')
        .map((p) => p.trim())
        .find((p) => p.startsWith(`${name}=`));
      const candidate = pair?.slice(name.length + 1);
      if (candidate && cartCookies(request, secure).includes(candidate)) token = candidate;
    }
    return { owner, id, token };
  };
  app.post(
    '/storefront/v1/checkouts/:id/quotes',
    {
      bodyLimit: 2048,
      preValidation: async (request) => {
        strictBody(request, ['revision', 'couponCodes']);
        const c = (request.body as { couponCodes?: unknown }).couponCodes;
        if (c !== undefined && (!Array.isArray(c) || c.some((v) => typeof v !== 'string')))
          throw new CheckoutRequestError('INVALID_REQUEST', 400, 'Coupon codes must be strings.');
      },
      schema: {
        params,
        body: Type.Object(
          {
            revision,
            couponCodes: Type.Optional(
              Type.Array(Type.String({ minLength: 2, maxLength: 64 }), { maxItems: 10 }),
            ),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const { owner, id, token } = await context(request);
      return reply.code(201).send({
        data: await createCheckoutQuote(
          database.db,
          owner,
          id,
          request.body as CreateCheckoutQuoteDto,
          intentKey(request),
          token,
        ),
      });
    },
  );
  app.get(
    '/storefront/v1/checkouts/:id/quotes/current',
    { schema: { params } },
    async (request) => {
      const { owner, id, token } = await context(request);
      return { data: await getCheckoutQuote(database.db, owner, id, undefined, token) };
    },
  );
  app.get(
    '/storefront/v1/checkouts/:id/quotes/:quoteId',
    { schema: { params: quoteParams } },
    async (request) => {
      const { owner, id, token } = await context(request);
      return {
        data: await getCheckoutQuote(
          database.db,
          owner,
          id,
          (request.params as { quoteId: string }).quoteId,
          token,
        ),
      };
    },
  );
  app.post(
    '/storefront/v1/checkouts/:id/quotes/:quoteId/acknowledgements',
    {
      bodyLimit: 1024,
      preValidation: async (request) => {
        strictBody(request, ['revision', 'fingerprint']);
        if (typeof (request.body as { fingerprint?: unknown }).fingerprint !== 'string')
          throw new CheckoutRequestError(
            'INVALID_REQUEST',
            400,
            'A quote fingerprint is required.',
          );
      },
      schema: {
        params: quoteParams,
        body: Type.Object(
          { revision, fingerprint: Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' }) },
          { additionalProperties: false },
        ),
      },
    },
    async (request) => {
      const { owner, id, token } = await context(request);
      return {
        data: await acknowledgeCheckoutQuote(
          database.db,
          owner,
          id,
          (request.params as { quoteId: string }).quoteId,
          request.body as AcknowledgeCheckoutQuoteDto,
          intentKey(request),
          token,
        ),
      };
    },
  );
}
