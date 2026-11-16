import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import type { CheckoutPaymentMethod, CheckoutPaymentMethodStatusDto } from '@maevelle/contracts';
import { findActiveAdminContext, isOperationalControlEnabled } from '@maevelle/database/platform';
import { configurePaymentMethod, listPaymentMethods } from '@maevelle/database/payments';
import type { createAuth } from '../auth/auth.js';
import { checkoutCommerce } from './checkout-commerce.js';
import { paymentAdmin, sendPaymentError } from './payments.js';

const path = '/admin/payments/checkout-methods';
const method = Type.Union([
  Type.Literal('COD'),
  Type.Literal('BKASH_MANUAL'),
  Type.Literal('NAGAD_MANUAL'),
]);

export function registerCheckoutMethodRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: ReturnType<typeof createAuth>,
  config?: RuntimeConfig,
) {
  const { db } = database;
  const commerce = config ? checkoutCommerce(config) : undefined;
  app.get(path, async (request, reply) => {
    const actor = await paymentAdmin(database, auth, request.headers, 'payments.view');
    if (!actor)
      return reply
        .code(403)
        .send({ error: { code: 'FORBIDDEN', message: 'Payment access is required.' } });
    const { organizationId } = actor;
    const methods = await listPaymentMethods(db, organizationId);
    const [accepting, configured, canViewWallets] = await Promise.all([
      isOperationalControlEnabled(db, organizationId, 'checkout_enabled'),
      commerce?.methodConfigurations?.(db, organizationId),
      findActiveAdminContext(db, actor.actorId, {
        organizationId,
        requiredCapability: 'payments.destinations.view',
      }),
    ]);
    const data = methods.map(({ code, status }): CheckoutPaymentMethodStatusDto => {
      const setup = configured?.get(code);
      const canEnable = Boolean(setup);
      const enabled = status === 'ACTIVE';
      const available = canEnable && enabled && accepting;
      return {
        method: code,
        enabled,
        available,
        canEnable,
        deliveryAreas: setup?.deliveryAreas ?? [],
        ...(canViewWallets && setup?.wallet ? { wallet: setup.wallet } : {}),
        reason: available
          ? null
          : !canEnable
            ? 'SETUP_REQUIRED'
            : !enabled
              ? 'METHOD_DISABLED'
              : 'ORDERS_PAUSED',
      };
    });
    return { data };
  });

  app.put(
    `${path}/:method`,
    {
      schema: {
        params: Type.Object({ method }),
        body: Type.Object({
          status: Type.Union([Type.Literal('ACTIVE'), Type.Literal('DISABLED')]),
        }),
      },
    },
    async (request, reply) => {
      const actor = await paymentAdmin(database, auth, request.headers, 'payments.manage');
      if (!actor)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Payment management is required.' } });
      const { organizationId, actorId } = actor;
      const { method } = request.params as { method: CheckoutPaymentMethod };
      const { status } = request.body as { status: 'ACTIVE' | 'DISABLED' };
      const methods = await listPaymentMethods(db, organizationId);
      const current = methods.find(({ code }) => code === method);
      if (!current)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Payment method was not found.' } });
      const approved =
        status === 'ACTIVE'
          ? (await commerce?.methodConfigurations?.(db, organizationId))?.get(method)
          : null;
      if (status === 'ACTIVE' && !approved)
        return reply.code(422).send({
          error: {
            code: 'POLICY_BLOCKED',
            message: 'Complete Checkout setup for this payment method before enabling it.',
          },
        });
      if (current.status === status) return reply.code(204).send();
      try {
        await configurePaymentMethod(db, {
          organizationId,
          actorId,
          code: method,
          status,
          name: current.name,
          displayOrder: current.displayOrder,
          instructions: current.instructions,
          paymentWindowMinutes: approved?.paymentWindowMinutes ?? current.paymentWindowMinutes,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendPaymentError(reply, error);
      }
    },
  );
}
