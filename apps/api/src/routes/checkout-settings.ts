import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import type { CheckoutOrderControlDto, PauseCheckoutOrdersDto } from '@maevelle/contracts';
import type { DatabaseClient } from '@maevelle/database';
import { pauseCheckoutOrders } from '@maevelle/database/checkout';
import { findActiveAdminContext, isOperationalControlEnabled } from '@maevelle/database/platform';
import type { createAuth } from '../auth/auth.js';

const route = '/admin/settings/checkout';
const organizationHeader = Type.Object({
  'x-organization-id': Type.String({ format: 'uuid' }),
});
const releaseStatus = 'BLOCKED' as const;

function forbidden(reply: FastifyReply) {
  return reply
    .code(403)
    .send({ error: { code: 'FORBIDDEN', message: 'An organization Owner is required.' } });
}

export function registerCheckoutSettingsRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: ReturnType<typeof createAuth>,
) {
  async function owner(request: FastifyRequest, capability: string) {
    const session = await auth.api.getSession({
      headers: new Headers(
        Object.entries(request.headers).flatMap(([key, value]) =>
          typeof value === 'string' ? [[key, value]] : [],
        ),
      ),
    });
    if (!session?.user?.id || !session.session?.id) return undefined;
    const organizationId = request.headers['x-organization-id'];
    if (typeof organizationId !== 'string') return undefined;
    const active = await findActiveAdminContext(database.db, session.user.id, {
      organizationId,
      requiredCapability: capability,
    });
    if (active?.membershipType === 'OWNER') return { ...active, actorId: session.user.id };
  }

  app.get(route, { schema: { headers: organizationHeader } }, async (request, reply) => {
    const active = await owner(request, 'settings.view');
    if (!active) return forbidden(reply);
    const data: CheckoutOrderControlDto = {
      paused: !(await isOperationalControlEnabled(
        database.db,
        active.organizationId,
        'checkout_enabled',
      )),
      releaseStatus,
    };
    return { data };
  });

  app.post(
    `${route}/pause`,
    {
      bodyLimit: 4096,
      schema: {
        headers: organizationHeader,
        body: Type.Object(
          { reason: Type.String({ minLength: 1, maxLength: 240, pattern: '\\S' }) },
          { additionalProperties: false },
        ),
      },
      preValidation: async (request, reply) => {
        if (
          request.body &&
          typeof request.body === 'object' &&
          Object.keys(request.body).some((key) => key !== 'reason')
        )
          return reply.code(400).send({
            error: { code: 'VALIDATION_FAILED', message: 'Only the pause reason is accepted.' },
          });
      },
    },
    async (request, reply) => {
      const active = await owner(request, 'settings.storefront.manage');
      if (!active) return forbidden(reply);
      const { reason } = request.body as PauseCheckoutOrdersDto;
      const applied = await pauseCheckoutOrders(database.db, {
        organizationId: active.organizationId,
        membershipId: active.membershipId,
        actorId: active.actorId,
        requestId: request.id,
        reason: reason.trim(),
      });
      if (!applied) return forbidden(reply);
      const data: CheckoutOrderControlDto = { paused: true, releaseStatus };
      return { data };
    },
  );
}
