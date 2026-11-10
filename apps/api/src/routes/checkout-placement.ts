import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import type { PlaceCheckoutDto, SubmitCheckoutPaymentClaimDto } from '@maevelle/contracts';
import {
  checkoutGuestOrderCredential,
  getCheckoutDraft,
  getCommittedCheckoutOrder,
  getCheckoutOrderPayment,
  submitCheckoutPaymentClaim,
  recoverCheckoutPaymentClaim,
  placeReviewedCheckout,
  reviewCheckoutFinalTerms,
} from '@maevelle/database/checkout';
import { guestCookiePrefix, type CartShopperResolver } from './cart-context.js';
import { checkoutRequestContext } from './checkout-context.js';
import { CheckoutRequestError } from './checkout-errors.js';
import { intentKey, strictBody } from './checkout-input.js';
import { publicFinalTerms } from './checkout-public-money.js';

const uuid = Type.String({ format: 'uuid' });
const params = Type.Object({ id: uuid }, { additionalProperties: false });
const digest = Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' });
const review = {
  revision: Type.String({ pattern: '^[1-9][0-9]{0,18}$', maxLength: 19 }),
  quoteId: uuid,
  quoteFingerprint: digest,
  method: Type.Union([
    Type.Literal('COD'),
    Type.Literal('BKASH_MANUAL'),
    Type.Literal('NAGAD_MANUAL'),
  ]),
};
function validate(request: FastifyRequest, fields: readonly string[]) {
  strictBody(request, fields);
  if (
    Object.values(request.body as Record<string, unknown>).some(
      (value) => typeof value !== 'string',
    )
  )
    throw new CheckoutRequestError('INVALID_REQUEST', 400, 'Placement fields must be strings.');
}
function grantCookieName(draftId: string, secure: boolean) {
  return `${secure ? '__Host-' : ''}maevelle_checkout_order_${draftId.replaceAll('-', '')}`;
}

function readGrant(request: FastifyRequest, draftId: string, secure: boolean) {
  const name = grantCookieName(draftId, secure);
  const pairs = (request.headers.cookie ?? '')
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair.startsWith(`${name}=`));
  return pairs.length === 1 ? pairs[0]!.slice(name.length + 1) : undefined;
}

export function registerCheckoutPlacementRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  config: RuntimeConfig,
  resolveShopper: CartShopperResolver,
) {
  const context = async (request: FastifyRequest, source: boolean) => {
    const { owner } = await checkoutRequestContext(database, config, request, resolveShopper);
    const draftId = (request.params as { id: string }).id.toLowerCase();
    let cartToken: string | undefined;
    if (source && owner.kind === 'GUEST') {
      const draft = await getCheckoutDraft(database.db, owner, draftId);
      if (draft.source.kind === 'CART') {
        const secure = config.nodeEnv === 'production';
        const name = `${guestCookiePrefix(secure)}${draft.source.cartId.replaceAll('-', '')}`;
        const candidates = (request.headers.cookie ?? '')
          .split(';')
          .map((pair) => pair.trim())
          .filter((pair) => pair.startsWith(`${name}=`));
        const candidate = candidates[0]?.slice(name.length + 1);
        // This selects a candidate only. Missing/invalid Cart credentials must not
        // prevent an exact receipt replay under the original Checkout authority.
        if (candidates.length === 1 && candidate && /^[A-Za-z0-9_-]{43}$/.test(candidate))
          cartToken = candidate;
      }
    }
    return { owner, draftId, cartToken };
  };
  app.post(
    '/storefront/v1/checkouts/:id/final-terms',
    {
      bodyLimit: 1024,
      schema: { params, body: Type.Object(review, { additionalProperties: false }) },
      preValidation: async (request) => validate(request, Object.keys(review)),
    },
    async (request) => {
      const body = request.body as Omit<PlaceCheckoutDto, 'finalTermsFingerprint'>;
      return {
        data: publicFinalTerms(
          await reviewCheckoutFinalTerms(database.db, await context(request, true), {
            ...body,
            quoteId: body.quoteId.toLowerCase(),
          }),
        ),
      };
    },
  );

  const placement = { ...review, finalTermsFingerprint: digest };
  app.post(
    '/storefront/v1/checkouts/:id/placement',
    {
      bodyLimit: 1024,
      schema: { params, body: Type.Object(placement, { additionalProperties: false }) },
      preValidation: async (request) => validate(request, Object.keys(placement)),
    },
    async (request, reply) => {
      const key = intentKey(request);
      const body = request.body as PlaceCheckoutDto;
      const cmd = await context(request, true);
      const result = await placeReviewedCheckout(
        database.db,
        cmd,
        { ...body, quoteId: body.quoteId.toLowerCase() },
        key,
      );
      if (result.kind === 'COMMITTED' && cmd.owner.kind === 'GUEST') {
        const secure = config.nodeEnv === 'production';
        const name = grantCookieName(cmd.draftId, secure);
        const grant = checkoutGuestOrderCredential(cmd.owner, cmd.draftId, result.receipt.orderId);
        reply.header(
          'set-cookie',
          `${name}=${grant}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${secure ? '; Secure' : ''}`,
        );
      }
      const data =
        result.kind === 'COMMITTED'
          ? {
              ...result,
              receipt: { ...result.receipt, terms: publicFinalTerms(result.receipt.terms) },
            }
          : result;
      return reply.code(result.kind === 'REVIEW_REQUIRED' ? 409 : 200).send({ data });
    },
  );
  app.get('/storefront/v1/checkouts/:id/placement', { schema: { params } }, async (request) => {
    const { owner, draftId } = await context(request, false);
    const grant = readGrant(request, draftId, config.nodeEnv === 'production');
    const data = await getCommittedCheckoutOrder(database.db, owner, draftId, grant);
    return {
      data: { ...data, receipt: { ...data.receipt, terms: publicFinalTerms(data.receipt.terms) } },
    };
  });

  const paymentAccess = async (request: FastifyRequest) => {
    const { owner, draftId } = await context(request, false);
    const grant = readGrant(request, draftId, config.nodeEnv === 'production');
    return { owner, draftId, ...(grant ? { guestCredential: grant } : {}) };
  };
  app.get(
    '/storefront/v1/checkouts/:id/order-payment',
    { schema: { params } },
    async (request) => ({
      data: await getCheckoutOrderPayment(database.db, await paymentAccess(request)),
    }),
  );

  app.get(
    '/storefront/v1/checkouts/:id/order-payment/claims',
    { schema: { params } },
    async (request) => {
      const key = intentKey(request);
      return {
        data: await recoverCheckoutPaymentClaim(database.db, await paymentAccess(request), key),
      };
    },
  );

  const claim = {
    transactionId: Type.String({ minLength: 4, maxLength: 128 }),
    sendingMobile: Type.Optional(Type.String({ pattern: '^01[3-9][0-9]{8}$' })),
  };
  app.post(
    '/storefront/v1/checkouts/:id/order-payment/claims',
    {
      bodyLimit: 1024,
      schema: { params, body: Type.Object(claim, { additionalProperties: false }) },
      preValidation: async (request) => {
        strictBody(request, Object.keys(claim));
        if (
          Object.values(request.body as Record<string, unknown>).some(
            (value) => typeof value !== 'string',
          )
        )
          throw new CheckoutRequestError(
            'INVALID_REQUEST',
            400,
            'Payment claim fields must be strings.',
          );
      },
    },
    async (request) => {
      const key = intentKey(request);
      return {
        data: await submitCheckoutPaymentClaim(
          database.db,
          await paymentAccess(request),
          request.body as SubmitCheckoutPaymentClaimDto,
          key,
        ),
      };
    },
  );
}
