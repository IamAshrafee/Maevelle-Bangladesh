import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  addLandedCostComponent,
  CostingDomainError,
  createLandedCostRevision,
  createLandedCostWorksheet,
  finalizeLandedCostWorksheet,
  getInventoryValuation,
  getLandedCostWorksheet,
  listCogsRecognitions,
  listCostLayers,
  listLandedCostWorksheets,
  listOutboundCostAssignments,
  previewLandedCostWorksheet,
  type AllocationMethod,
} from '@maevelle/database/costing';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;
const money = Type.String({ pattern: '^-?\\d+(?:\\.\\d{1,4})?$' });
const methods = Type.Union(
  [
    'EQUAL',
    'QUANTITY',
    'PURCHASE_VALUE',
    'WEIGHT',
    'VOLUME',
    'CHARGEABLE_WEIGHT',
    'PERCENTAGE',
    'MANUAL',
  ].map((value) => Type.Literal(value)),
);

function headers(value: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(value).flatMap(([name, item]) =>
      typeof item === 'string' ? [[name, item]] : [],
    ),
  );
}
async function context(
  database: DatabaseClient,
  auth: Auth,
  requestHeaders: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: headers(requestHeaders) });
  if (!session?.user?.id) return undefined;
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return active ? { ...active, actorId: session.user.id } : undefined;
}
function sendError(
  reply: { code(status: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (error instanceof CostingDomainError)
    return reply
      .code(error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 422)
      .send({ error: { code: error.code, message: error.message } });
  throw error;
}

export function registerCostingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get('/admin/cost-layers', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'costing.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listCostLayers(database.db, active.organizationId) };
  });
  app.get('/admin/costing/cogs', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'costing.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listCogsRecognitions(database.db, active.organizationId) };
  });
  app.get('/admin/costing/valuation', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'costing.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const query = request.query as { inventoryItemId?: string; locationId?: string };
    return {
      data: await getInventoryValuation(database.db, {
        organizationId: active.organizationId,
        ...query,
      }),
    };
  });
  app.get('/admin/costing/outbound-assignments', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'costing.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listOutboundCostAssignments(database.db, active.organizationId) };
  });
  app.post(
    '/admin/landed-cost/worksheets',
    {
      schema: {
        body: Type.Object({
          shipmentId: Type.String({ minLength: 1 }),
          baseCurrencyCode: Type.String({ minLength: 3, maxLength: 3 }),
          notes: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'landed_cost.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createLandedCostWorksheet(database.db, {
            ...active,
            ...(request.body as { shipmentId: string; baseCurrencyCode: string; notes?: string }),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.get('/admin/landed-cost/worksheets', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'landed_cost.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listLandedCostWorksheets(database.db, active.organizationId) };
  });
  app.get('/admin/landed-cost/worksheets/:worksheetId', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'landed_cost.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await getLandedCostWorksheet(database.db, {
          organizationId: active.organizationId,
          worksheetId: (request.params as { worksheetId: string }).worksheetId,
        }),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });
  app.post(
    '/admin/landed-cost/worksheets/:worksheetId/revisions',
    {
      schema: {
        body: Type.Object({
          kind: Type.Union([Type.Literal('ADJUSTMENT'), Type.Literal('CREDIT')]),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'landed_cost.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createLandedCostRevision(database.db, {
            ...active,
            worksheetId: (request.params as { worksheetId: string }).worksheetId,
            ...(request.body as { kind: 'ADJUSTMENT' | 'CREDIT' }),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post(
    '/admin/landed-cost/revisions/:revisionId/components',
    {
      schema: {
        body: Type.Object({
          costType: Type.String({ minLength: 1 }),
          scope: Type.Union([Type.Literal('GLOBAL'), Type.Literal('DIRECT')]),
          directShipmentAllocationId: Type.Optional(Type.String()),
          originalAmount: money,
          originalCurrencyCode: Type.String({ minLength: 3, maxLength: 3 }),
          fxRate: Type.Optional(Type.String({ pattern: '^\\d+(?:\\.\\d{1,12})?$' })),
          fxSource: Type.Optional(Type.String()),
          valueStatus: Type.Union([
            Type.Literal('ESTIMATED'),
            Type.Literal('ACTUAL'),
            Type.Literal('CREDIT'),
          ]),
          allocationMethod: methods,
          reference: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'landed_cost.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await addLandedCostComponent(database.db, {
            ...active,
            revisionId: (request.params as { revisionId: string }).revisionId,
            ...(request.body as Omit<
              Parameters<typeof addLandedCostComponent>[1],
              'organizationId' | 'revisionId'
            > & { allocationMethod: AllocationMethod }),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.get('/admin/landed-cost/revisions/:revisionId/preview', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'landed_cost.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await previewLandedCostWorksheet(database.db, {
          organizationId: active.organizationId,
          revisionId: (request.params as { revisionId: string }).revisionId,
        }),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });
  app.post('/admin/landed-cost/revisions/:revisionId/finalize', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'landed_cost.finalize');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      await finalizeLandedCostWorksheet(database.db, {
        ...active,
        revisionId: (request.params as { revisionId: string }).revisionId,
      });
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
