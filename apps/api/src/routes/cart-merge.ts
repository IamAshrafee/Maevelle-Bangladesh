import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import type { RuntimeConfig } from '@maevelle/config';
import type {
  CartMergeCommitRequestDto,
  CartMergeGuestContextDto,
  CartMergeSelectionDto,
} from '@maevelle/contracts';
import { sql, type DatabaseClient } from '@maevelle/database';
import { commitCartMerge, previewCartMerge } from '@maevelle/database/cart';
import { hashToken } from '@maevelle/security';
import {
  cartCookies,
  CartRequestError,
  guestCookiePrefix,
  requireAccountCartOwner,
  resolveCartRequest,
  type CartShopperResolver,
} from './cart-context.js';
import { cartIntentKey, object, uuid, version } from './cart-schemas.js';

const selection = { guestCartId: uuid, guestOwnerContext: uuid, ownerContext: uuid };

function tokenInSlot(
  request: FastifyRequest,
  secure: boolean,
  cartId: string,
  tokens: readonly string[],
) {
  const name = guestCookiePrefix(secure) + cartId.replaceAll('-', '');
  const parts = (request.headers.cookie ?? '').split(';').map((part) => part.trim());
  return tokens.find((token) => parts.includes(`${name}=${token}`));
}

export function registerCartMergeRoutes(
  app: FastifyInstance,
  base: string,
  database: DatabaseClient,
  config: RuntimeConfig,
  resolveShopper: CartShopperResolver,
) {
  const secure = config.nodeEnv === 'production';
  const owner = async (request: FastifyRequest) =>
    requireAccountCartOwner(
      (await resolveCartRequest(database, config, request, resolveShopper, true)).owner,
    );
  app.get(`${base}/merge/guests`, async (request) => {
    const account = await owner(request);
    const tokens = cartCookies(request, secure);
    if (!tokens.length) return { data: [] };
    const result = await sql<{ id: string; owner_context: string; public_token_hash: string }>`
      select id,owner_context,public_token_hash from cart.carts
      where organization_id=${account.organizationId} and currency_code=${account.currency}
        and status='ACTIVE' and credential_state='SLOT_V1' and owner_account_id is null
        and expires_at>clock_timestamp() and public_token_hash=any(${tokens.map(hashToken)})
      order by id
    `.execute(database.db);
    const data: CartMergeGuestContextDto[] = result.rows.flatMap((row) => {
      const token = tokenInSlot(request, secure, row.id, tokens);
      return token && hashToken(token) === row.public_token_hash
        ? [{ cartId: row.id, ownerContext: row.owner_context }]
        : [];
    });
    return { data };
  });
  app.post(
    `${base}/merge/preview`,
    {
      bodyLimit: 4096,
      schema: { body: object(selection) },
    },
    async (request) => {
      const account = await owner(request);
      const body = request.body as CartMergeSelectionDto;
      const token = tokenInSlot(request, secure, body.guestCartId, cartCookies(request, secure));
      return { data: await previewCartMerge(database.db, account, body, token) };
    },
  );
  app.post(
    `${base}/merge/commit`,
    {
      bodyLimit: 4096,
      schema: {
        body: object({
          ...selection,
          version,
          reviewFingerprint: Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' }),
        }),
      },
    },
    async (request, reply) => {
      const account = await owner(request);
      const body = request.body as CartMergeCommitRequestDto;
      const key = cartIntentKey(request);
      let token: string | undefined;
      try {
        token = tokenInSlot(request, secure, body.guestCartId, cartCookies(request, secure));
      } catch (error) {
        // An exact authenticated replay can succeed independently of guest cookies.
        if (!(error instanceof CartRequestError)) throw error;
      }
      const data = await commitCartMerge(database.db, account, body, key, token);
      reply.header(
        'set-cookie',
        `${guestCookiePrefix(secure)}${body.guestCartId.replaceAll('-', '')}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
      );
      return { data };
    },
  );
}
