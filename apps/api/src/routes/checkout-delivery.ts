import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import type { ShopperAddressInput, UpdateCheckoutDeliveryDto } from '@maevelle/contracts';
import {
  getCheckoutDelivery,
  updateCheckoutDelivery,
  listShopperAddresses,
  mutateShopperAddress,
  searchDeliveryAreas,
} from '@maevelle/database/checkout';
import { CustomerDomainError } from '@maevelle/database/customers';
import { resolveStorefrontContext } from '@maevelle/database/storefront';
import { checkoutRequestContext } from './checkout-context.js';
import { intentKey } from './checkout-input.js';
import { CheckoutRequestError } from './checkout-errors.js';
import type { CartShopperResolver } from './cart-context.js';

const uuid = Type.String({ format: 'uuid' });
const revision = Type.String({ pattern: '^[1-9][0-9]{0,18}$', maxLength: 19 });
const nullableText = (maxLength: number) =>
  Type.Optional(Type.Union([Type.String({ maxLength }), Type.Null()]));
const contact = {
  recipientName: Type.String({ minLength: 1, maxLength: 120 }),
  mobile: Type.String({ minLength: 1, maxLength: 40 }),
  geographyNodeId: uuid,
  addressLine1: Type.String({ minLength: 1, maxLength: 500 }),
  addressLine2: nullableText(300),
  instructions: nullableText(500),
};
const address = Type.Object(
  { ...contact, label: nullableText(60), isDefault: Type.Optional(Type.Boolean()) },
  { additionalProperties: false },
);
const params = Type.Object({ id: uuid }, { additionalProperties: false });
const offset = Type.Optional(Type.String({ pattern: '^(0|[1-9][0-9]{0,3}|10000)$', maxLength: 5 }));

/** Preserve intent before Fastify can coerce primitives or strip extra fields. */
function strict(
  request: FastifyRequest,
  allowed: readonly string[],
  nested?: 'address' | 'delivery',
) {
  const check = (body: unknown, keys: readonly string[], stringsOnly = false) => {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.entries(body).some(
        ([key, value]) =>
          !keys.includes(key) ||
          (stringsOnly &&
            !(
              typeof value === 'string' ||
              (['label', 'addressLine2', 'instructions'].includes(key) && value === null) ||
              (key === 'isDefault' && typeof value === 'boolean')
            )),
      )
    )
      throw new CheckoutRequestError('INVALID_REQUEST', 400, 'Invalid delivery request fields.');
  };
  check(request.body, allowed);
  const body = request.body as Record<string, unknown>;
  for (const [key, value] of Object.entries(body))
    if (key !== nested && typeof value !== 'string')
      throw new CheckoutRequestError('INVALID_REQUEST', 400, 'Expected a string field.');
  if (nested && nested in body)
    check(
      body[nested],
      nested === 'address' ? [...Object.keys(contact), 'label', 'isDefault'] : Object.keys(contact),
      true,
    );
}
export function registerCheckoutDeliveryRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  config: RuntimeConfig,
  resolveShopper: CartShopperResolver,
) {
  const context = (request: FastifyRequest) =>
    checkoutRequestContext(database, config, request, resolveShopper);
  app.get('/storefront/v1/checkouts/:id/delivery', { schema: { params } }, async (request) => {
    const { owner } = await context(request);
    return {
      data: await getCheckoutDelivery(database.db, owner, (request.params as { id: string }).id),
    };
  });
  app.put(
    '/storefront/v1/checkouts/:id/delivery',
    {
      bodyLimit: 8192,
      preValidation: async (request) => {
        strict(
          request,
          ['revision', 'delivery', 'savedAddressId', 'savedAddressRevision', 'action'],
          'delivery',
        );
        const body = request.body as Record<string, unknown>;
        const keys = Object.keys(body).sort().join(',');
        if (
          ![
            'delivery,revision',
            'revision,savedAddressId,savedAddressRevision',
            'action,revision',
          ].includes(keys)
        )
          throw new CheckoutRequestError(
            'INVALID_REQUEST',
            400,
            'Supply exactly one delivery change.',
          );
      },
      schema: {
        params,
        body: Type.Object(
          {
            revision,
            delivery: Type.Optional(Type.Object(contact, { additionalProperties: false })),
            savedAddressId: Type.Optional(uuid),
            savedAddressRevision: Type.Optional(revision),
            action: Type.Optional(Type.Literal('REVALIDATE')),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request) => {
      const body = request.body as UpdateCheckoutDeliveryDto;
      const { owner } = await context(request);
      return {
        data: await updateCheckoutDelivery(
          database.db,
          owner,
          (request.params as { id: string }).id,
          body,
          intentKey(request),
        ),
      };
    },
  );
  app.get(
    '/storefront/v1/checkout/delivery-areas',
    {
      schema: {
        querystring: Type.Object(
          { query: Type.String({ minLength: 2, maxLength: 80 }), offset },
          { additionalProperties: false },
        ),
      },
      preValidation: async (request) => {
        if (Object.keys(request.query as object).some((key) => !['query', 'offset'].includes(key)))
          throw new CheckoutRequestError('INVALID_REQUEST', 400, 'Unknown search field.');
        const query = (request.query as { query?: unknown }).query;
        if (
          typeof query !== 'string' ||
          query.trim().length < 2 ||
          /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(query)
        )
          throw new CheckoutRequestError(
            'INVALID_REQUEST',
            400,
            'Enter at least two characters of an area name.',
          );
      },
    },
    async (request) => {
      const resolved = await resolveStorefrontContext(
        database.db,
        config.storefrontOrganizationCode,
      );
      if (!resolved)
        throw new CheckoutRequestError(
          'UNAVAILABLE',
          503,
          'Delivery configuration is unavailable.',
        );
      const q = request.query as { query: string; offset?: string };
      return {
        data: await searchDeliveryAreas(database.db, {
          ...resolved,
          query: q.query,
          offset: Number(q.offset ?? '0'),
        }),
      };
    },
  );
  app.get(
    '/storefront/v1/checkout/addresses',
    {
      schema: { querystring: Type.Object({ offset }, { additionalProperties: false }) },
      preValidation: async (request) => {
        if (Object.keys(request.query as object).some((key) => key !== 'offset'))
          throw new CheckoutRequestError('INVALID_REQUEST', 400, 'Unknown address field.');
      },
    },
    async (request) => {
      const { owner } = await context(request);
      return {
        data: await listShopperAddresses(
          database.db,
          owner,
          Number((request.query as { offset?: string }).offset ?? '0'),
        ),
      };
    },
  );
  const addressWrite = async (request: FastifyRequest, kind: 'CREATE' | 'UPDATE' | 'REMOVE') => {
    const { owner } = await context(request);
    const body = request.body as { address: ShopperAddressInput; revision: string };
    const id = (request.params as { id?: string }).id;
    try {
      return {
        data: await mutateShopperAddress(
          database.db,
          owner,
          kind === 'CREATE'
            ? { kind, address: body.address }
            : kind === 'UPDATE'
              ? { kind, id: id!, revision: body.revision, address: body.address }
              : { kind, id: id!, revision: body.revision },
          intentKey(request),
        ),
      };
    } catch (error) {
      if (error instanceof CustomerDomainError)
        throw new CheckoutRequestError(
          error.code,
          error.code === 'NOT_FOUND' ? 404 : 422,
          'Check the saved address details.',
        );
      throw error;
    }
  };
  app.post(
    '/storefront/v1/checkout/addresses',
    {
      bodyLimit: 8192,
      preValidation: async (request) => strict(request, ['address'], 'address'),
      schema: { body: Type.Object({ address }, { additionalProperties: false }) },
    },
    async (request, reply) => reply.code(201).send(await addressWrite(request, 'CREATE')),
  );
  app.put(
    '/storefront/v1/checkout/addresses/:id',
    {
      bodyLimit: 8192,
      preValidation: async (request) => strict(request, ['revision', 'address'], 'address'),
      schema: { params, body: Type.Object({ revision, address }, { additionalProperties: false }) },
    },
    (request) => addressWrite(request, 'UPDATE'),
  );
  app.delete(
    '/storefront/v1/checkout/addresses/:id',
    {
      bodyLimit: 1024,
      preValidation: async (request) => strict(request, ['revision']),
      schema: { params, body: Type.Object({ revision }, { additionalProperties: false }) },
    },
    (request) => addressWrite(request, 'REMOVE'),
  );
}
