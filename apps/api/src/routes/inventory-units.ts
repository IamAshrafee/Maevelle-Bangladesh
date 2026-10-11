import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import { findActiveAdminContext } from '@maevelle/database/platform';
import {
  allocateUnitsToFulfillment,
  bulkInspectUnits,
  bulkMoveUnitsLocation,
  completeUnitRepair,
  convertStockToSerialized,
  findInventoryUnitByCode,
  getInventoryUnit,
  listInventoryUnits,
  listUnitEvents,
  listUnitInspections,
  listUnitRepairs,
  moveUnitLocation,
  performUnitInspection,
  receiveReturnedUnit,
  reconcileSerializedInventory,
  registerInventoryUnits,
  releaseUnitForSale,
  renderCode128Svg,
  requestUnitRepair,
  setVariantTrackingMode,
  updateUnitPackaging,
  writeOffUnit,
  UnitTraceabilityDomainError,
  type InspectionDisposition,
  type InspectionOutcome,
  type InspectionStage,
  type UnitCondition,
  type UnitSourceType,
  type UnitStatus,
  type VariantTrackingMode,
} from '@maevelle/database/inventory-units';

import type { createAuth } from '../auth/auth.js';
import {
  canAccessLocation,
  locationScopeError,
  locationScopeIds,
} from '../authorization/location-scope.js';

type Auth = ReturnType<typeof createAuth>;

function requestHeaders(value: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(value).flatMap(([name, header]) =>
      typeof header === 'string' ? [[name, header]] : [],
    ),
  );
}

async function requireAdmin(
  database: DatabaseClient,
  auth: Auth,
  headers: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: requestHeaders(headers) });
  if (!session?.user?.id) return undefined;
  const context = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
    ...(typeof headers['x-organization-id'] === 'string'
      ? { organizationId: headers['x-organization-id'] }
      : {}),
  });
  return context ? { ...context, actorId: session.user.id } : undefined;
}

function sendError(
  reply: { code(status: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (error instanceof UnitTraceabilityDomainError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'UNAUTHORIZED_ACCESS'
          ? 403
          : ['CONFLICT', 'RESERVATION_CONFLICT', 'STALE_VERSION'].includes(error.code)
            ? 409
            : 422;
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    return reply
      .code(409)
      .send({ error: { code: 'CONFLICT', message: 'A record with that unique key already exists.' } });
  }
  throw error;
}

const conditionSchema = Type.Union([
  Type.Literal('GRADE_A'),
  Type.Literal('GRADE_B'),
  Type.Literal('REPAIR_REQUIRED'),
  Type.Literal('DAMAGED_UNSELLABLE'),
]);

const statusSchema = Type.Union([
  Type.Literal('AWAITING_QC'),
  Type.Literal('AVAILABLE'),
  Type.Literal('RESERVED'),
  Type.Literal('IN_FULFILLMENT'),
  Type.Literal('DISPATCHED'),
  Type.Literal('ON_HOLD'),
  Type.Literal('RETURNED'),
  Type.Literal('WRITTEN_OFF'),
]);

const sourceTypeSchema = Type.Union([
  Type.Literal('INBOUND_RECEIPT'),
  Type.Literal('STOCK_CONVERSION'),
  Type.Literal('RETURN_RECEIPT'),
  Type.Literal('MANUAL_INTAKE'),
]);

const inspectionStageSchema = Type.Union([
  Type.Literal('INBOUND_INTAKE'),
  Type.Literal('REINSPECTION'),
  Type.Literal('RETURN_INSPECTION'),
  Type.Literal('ROUTINE_AUDIT'),
]);

const inspectionOutcomeSchema = Type.Union([
  Type.Literal('PASSED'),
  Type.Literal('PASSED_WITH_DEFECT'),
  Type.Literal('HOLD_FOR_REPAIR'),
  Type.Literal('QUARANTINE_DAMAGED'),
]);

const dispositionSchema = Type.Union([
  Type.Literal('RELEASE_SELLABLE'),
  Type.Literal('RESTRICTED_SALE'),
  Type.Literal('MOVE_TO_REPAIR'),
  Type.Literal('WRITE_OFF'),
  Type.Literal('HOLD'),
]);

export function registerInventoryUnitRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  // 1. List / Search Units
  app.get(
    '/admin/inventory/units',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          search: Type.Optional(Type.String()),
          variantId: Type.Optional(Type.String()),
          sku: Type.Optional(Type.String()),
          locationId: Type.Optional(Type.String()),
          condition: Type.Optional(conditionSchema),
          status: Type.Optional(statusSchema),
          sourceReceiptId: Type.Optional(Type.String()),
          packageReference: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const query = request.query as {
        page?: number;
        pageSize?: number;
        search?: string;
        variantId?: string;
        sku?: string;
        locationId?: string;
        condition?: UnitCondition;
        status?: UnitStatus;
        sourceReceiptId?: string;
        packageReference?: string;
      };

      if (query.locationId && !canAccessLocation(active, 'inventory.units.view', query.locationId)) {
        return reply.code(403).send(locationScopeError());
      }

      try {
        const result = await listInventoryUnits(database.db, active.organizationId, query);
        return { data: result.items, pagination: result.pagination };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 2. Fast Scanned Code / Barcode Lookup
  app.get(
    '/admin/inventory/units/lookup',
    {
      schema: {
        querystring: Type.Object({
          code: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      try {
        const { code } = request.query as { code: string };
        const unit = await findInventoryUnitByCode(database.db, {
          organizationId: active.organizationId,
          code,
        });

        if (!unit) {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: `No unit found for code "${code}".` },
          });
        }

        if (!canAccessLocation(active, 'inventory.units.view', unit.locationId)) {
          return reply.code(403).send(locationScopeError());
        }

        // Permitted transitions based on current status
        const permittedTransitions: UnitStatus[] = [];
        if (unit.status === 'AWAITING_QC') permittedTransitions.push('AVAILABLE', 'ON_HOLD', 'WRITTEN_OFF');
        if (unit.status === 'AVAILABLE') permittedTransitions.push('RESERVED', 'IN_FULFILLMENT', 'ON_HOLD', 'WRITTEN_OFF');
        if (unit.status === 'ON_HOLD') permittedTransitions.push('AVAILABLE', 'AWAITING_QC', 'WRITTEN_OFF');
        if (unit.status === 'RETURNED') permittedTransitions.push('AWAITING_QC', 'ON_HOLD', 'WRITTEN_OFF');

        return {
          data: {
            unit,
            scannableCode: unit.unitCode,
            barcodePayload: unit.barcodePayload,
            code128Svg: renderCode128Svg(unit.barcodePayload),
            permittedTransitions,
          },
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 3. Get Unit Details
  app.get('/admin/inventory/units/:unitId', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'inventory.units.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

    try {
      const { unitId } = request.params as { unitId: string };
      const unit = await getInventoryUnit(database.db, {
        organizationId: active.organizationId,
        unitId,
      });

      if (!canAccessLocation(active, 'inventory.units.view', unit.locationId)) {
        return reply.code(403).send(locationScopeError());
      }

      return { data: unit };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // 4. Get Unit Event History
  app.get(
    '/admin/inventory/units/:unitId/history',
    {
      schema: {
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          offset: Type.Optional(Type.Integer({ minimum: 0 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      try {
        const { unitId } = request.params as { unitId: string };
        const query = request.query as { limit?: number; offset?: number };
        const events = await listUnitEvents(database.db, {
          organizationId: active.organizationId,
          unitId,
          limit: query.limit,
          offset: query.offset,
        });
        return { data: events };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 5. Get Unit Inspections
  app.get('/admin/inventory/units/:unitId/inspections', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'inventory.units.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

    try {
      const { unitId } = request.params as { unitId: string };
      const inspections = await listUnitInspections(database.db, {
        organizationId: active.organizationId,
        unitId,
      });
      return { data: inspections };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // 6. Get Unit Repairs
  app.get('/admin/inventory/units/:unitId/repairs', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'inventory.units.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

    try {
      const { unitId } = request.params as { unitId: string };
      const repairs = await listUnitRepairs(database.db, {
        organizationId: active.organizationId,
        unitId,
      });
      return { data: repairs };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // 7. Get Unit Barcode SVG
  app.get('/admin/inventory/units/:unitId/barcode', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'inventory.units.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

    try {
      const { unitId } = request.params as { unitId: string };
      const unit = await getInventoryUnit(database.db, {
        organizationId: active.organizationId,
        unitId,
      });

      return {
        data: {
          unitId: unit.id,
          unitCode: unit.unitCode,
          barcodePayload: unit.barcodePayload,
          svg: renderCode128Svg(unit.barcodePayload),
        },
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // 8. Get Raw Unit Barcode SVG Image
  app.get('/admin/inventory/units/:unitId/barcode.svg', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'inventory.units.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

    try {
      const { unitId } = request.params as { unitId: string };
      const unit = await getInventoryUnit(database.db, {
        organizationId: active.organizationId,
        unitId,
      });

      return reply.type('image/svg+xml').send(renderCode128Svg(unit.barcodePayload));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // 8. Register Units
  app.post(
    '/admin/inventory/units/register',
    {
      schema: {
        body: Type.Object({
          variantId: Type.String(),
          locationId: Type.String(),
          quantity: Type.Integer({ minimum: 1, maximum: 500 }),
          sourceType: Type.Optional(sourceTypeSchema),
          sourceReceiptId: Type.Optional(Type.String()),
          sourceReceiptLineId: Type.Optional(Type.String()),
          sourceReturnReceiptId: Type.Optional(Type.String()),
          initialCondition: Type.Optional(conditionSchema),
          packageReference: Type.Optional(Type.String()),
          storageNotes: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const body = request.body as {
        variantId: string;
        locationId: string;
        quantity: number;
        sourceType?: UnitSourceType;
        sourceReceiptId?: string;
        sourceReceiptLineId?: string;
        sourceReturnReceiptId?: string;
        initialCondition?: UnitCondition;
        packageReference?: string;
        storageNotes?: string;
        notes?: string;
      };

      if (!canAccessLocation(active, 'inventory.units.manage', body.locationId)) {
        return reply.code(403).send(locationScopeError());
      }

      try {
        const units = await registerInventoryUnits(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          ...body,
        });
        return reply.code(201).send({ data: units });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 9. Record QC Inspection
  app.post(
    '/admin/inventory/units/:unitId/inspections',
    {
      schema: {
        body: Type.Object({
          inspectionStage: inspectionStageSchema,
          conditionResult: conditionSchema,
          defectDescription: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
          mediaAssetIds: Type.Optional(Type.Array(Type.String())),
          outcome: inspectionOutcomeSchema,
          disposition: Type.Optional(dispositionSchema),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const { unitId } = request.params as { unitId: string };
      const body = request.body as {
        inspectionStage: InspectionStage;
        conditionResult: UnitCondition;
        defectDescription?: string;
        notes?: string;
        mediaAssetIds?: readonly string[];
        outcome: InspectionOutcome;
        disposition?: InspectionDisposition;
      };

      try {
        const result = await performUnitInspection(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          unitId,
          ...body,
        });
        return reply.code(201).send({ data: result });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 10. Bulk Inspect Units
  app.post(
    '/admin/inventory/units/bulk-inspect',
    {
      schema: {
        body: Type.Object({
          unitIds: Type.Array(Type.String(), { minItems: 1, maxItems: 100 }),
          inspectionStage: inspectionStageSchema,
          conditionResult: conditionSchema,
          defectDescription: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
          outcome: inspectionOutcomeSchema,
          disposition: Type.Optional(dispositionSchema),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const body = request.body as {
        unitIds: readonly string[];
        inspectionStage: InspectionStage;
        conditionResult: UnitCondition;
        defectDescription?: string;
        notes?: string;
        outcome: InspectionOutcome;
        disposition?: InspectionDisposition;
      };

      try {
        const result = await bulkInspectUnits(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          ...body,
        });
        return { data: result };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 11. Request Repair
  app.post(
    '/admin/inventory/units/:unitId/repairs',
    {
      schema: {
        body: Type.Object({
          defectDescription: Type.String({ minLength: 1 }),
          actionRequired: Type.Optional(Type.String()),
          technicianName: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const { unitId } = request.params as { unitId: string };
      const body = request.body as {
        defectDescription: string;
        actionRequired?: string;
        technicianName?: string;
        notes?: string;
      };

      try {
        const repair = await requestUnitRepair(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          unitId,
          ...body,
        });
        return reply.code(201).send({ data: repair });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 12. Complete Repair
  app.patch(
    '/admin/inventory/units/repairs/:repairId/complete',
    {
      schema: {
        body: Type.Object({
          actionPerformed: Type.String({ minLength: 1 }),
          technicianName: Type.Optional(Type.String()),
          costAmount: Type.Optional(Type.String()),
          costCurrency: Type.Optional(Type.String()),
          mediaAssetIds: Type.Optional(Type.Array(Type.String())),
          notes: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const { repairId } = request.params as { repairId: string };
      const body = request.body as {
        actionPerformed: string;
        technicianName?: string;
        costAmount?: string;
        costCurrency?: string;
        mediaAssetIds?: readonly string[];
        notes?: string;
      };

      try {
        const repair = await completeUnitRepair(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          repairId,
          ...body,
        });
        return { data: repair };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 13. Move Unit Location
  app.patch(
    '/admin/inventory/units/:unitId/location',
    {
      schema: {
        body: Type.Object({
          newLocationId: Type.String(),
          newStorageNotes: Type.Optional(Type.String()),
          newPackageReference: Type.Optional(Type.String()),
          reason: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const { unitId } = request.params as { unitId: string };
      const body = request.body as {
        newLocationId: string;
        newStorageNotes?: string;
        newPackageReference?: string;
        reason?: string;
      };

      if (!canAccessLocation(active, 'inventory.units.manage', body.newLocationId)) {
        return reply.code(403).send(locationScopeError());
      }

      try {
        const unit = await moveUnitLocation(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          unitId,
          ...body,
        });
        return { data: unit };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 14. Bulk Move Locations
  app.post(
    '/admin/inventory/units/bulk-location',
    {
      schema: {
        body: Type.Object({
          unitIds: Type.Array(Type.String(), { minItems: 1, maxItems: 100 }),
          newLocationId: Type.String(),
          newStorageNotes: Type.Optional(Type.String()),
          newPackageReference: Type.Optional(Type.String()),
          reason: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const body = request.body as {
        unitIds: readonly string[];
        newLocationId: string;
        newStorageNotes?: string;
        newPackageReference?: string;
        reason?: string;
      };

      if (!canAccessLocation(active, 'inventory.units.manage', body.newLocationId)) {
        return reply.code(403).send(locationScopeError());
      }

      try {
        const result = await bulkMoveUnitsLocation(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          ...body,
        });
        return { data: result };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 15. Update Packaging
  app.patch(
    '/admin/inventory/units/:unitId/packaging',
    {
      schema: {
        body: Type.Object({
          packageReference: Type.String({ minLength: 1 }),
          storageNotes: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const { unitId } = request.params as { unitId: string };
      const body = request.body as {
        packageReference: string;
        storageNotes?: string;
      };

      try {
        const unit = await updateUnitPackaging(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          unitId,
          ...body,
        });
        return { data: unit };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 16. Release Restricted / Hold Unit For Sale
  app.post(
    '/admin/inventory/units/:unitId/release',
    {
      schema: {
        body: Type.Object({
          reason: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.release');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const { unitId } = request.params as { unitId: string };
      const { reason } = request.body as { reason: string };

      try {
        const unit = await releaseUnitForSale(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          unitId,
          reason,
        });
        return { data: unit };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 17. Write Off Unit
  app.post(
    '/admin/inventory/units/:unitId/write-off',
    {
      schema: {
        body: Type.Object({
          reason: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.write_off');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const { unitId } = request.params as { unitId: string };
      const { reason } = request.body as { reason: string };

      try {
        const unit = await writeOffUnit(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          unitId,
          reason,
        });
        return { data: unit };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 18. Receive Returned Unit into Quarantine
  app.post(
    '/admin/inventory/units/:unitId/receive-return',
    {
      schema: {
        body: Type.Object({
          receivingLocationId: Type.String(),
          sourceReturnReceiptId: Type.Optional(Type.String()),
          conditionResult: Type.Optional(conditionSchema),
          notes: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const { unitId } = request.params as { unitId: string };
      const body = request.body as {
        receivingLocationId: string;
        sourceReturnReceiptId?: string;
        conditionResult?: UnitCondition;
        notes?: string;
      };

      if (!canAccessLocation(active, 'inventory.units.manage', body.receivingLocationId)) {
        return reply.code(403).send(locationScopeError());
      }

      try {
        const unit = await receiveReturnedUnit(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          unitId,
          ...body,
        });
        return { data: unit };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 19. Configure Variant Tracking Mode
  app.post(
    '/admin/inventory/units/tracking-mode',
    {
      schema: {
        body: Type.Object({
          variantId: Type.String(),
          trackingMode: Type.Union([Type.Literal('STANDARD'), Type.Literal('SERIAL')]),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const body = request.body as {
        variantId: string;
        trackingMode: VariantTrackingMode;
      };

      try {
        const result = await setVariantTrackingMode(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          ...body,
        });
        return { data: result };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 19. Convert Stock to Serialized
  app.post(
    '/admin/inventory/units/convert-stock',
    {
      schema: {
        body: Type.Object({
          variantId: Type.String(),
          locationId: Type.String(),
          initialCondition: Type.Optional(conditionSchema),
          packageReference: Type.Optional(Type.String()),
          storageNotes: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const body = request.body as {
        variantId: string;
        locationId: string;
        initialCondition?: UnitCondition;
        packageReference?: string;
        storageNotes?: string;
        notes?: string;
      };

      if (!canAccessLocation(active, 'inventory.units.manage', body.locationId)) {
        return reply.code(403).send(locationScopeError());
      }

      try {
        const result = await convertStockToSerialized(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          ...body,
        });
        return { data: result };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 20. Serialized Stock Reconciliation
  app.get(
    '/admin/inventory/units/reconcile',
    {
      schema: {
        querystring: Type.Object({
          variantId: Type.String(),
          locationId: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inventory.units.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const { variantId, locationId } = request.query as {
        variantId: string;
        locationId: string;
      };

      if (!canAccessLocation(active, 'inventory.units.view', locationId)) {
        return reply.code(403).send(locationScopeError());
      }

      try {
        const reconciliation = await reconcileSerializedInventory(database.db, {
          organizationId: active.organizationId,
          variantId,
          locationId,
        });
        return { data: reconciliation };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // 21. Allocate Serialized Units to Fulfillment
  app.post(
    '/admin/fulfillments/:fulfillmentId/units',
    {
      schema: {
        body: Type.Object({
          allocations: Type.Array(
            Type.Object({
              fulfillmentLineId: Type.String(),
              unitId: Type.String(),
            }),
            { minItems: 1 },
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'fulfillment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });

      const { fulfillmentId } = request.params as { fulfillmentId: string };
      const body = request.body as {
        allocations: readonly { fulfillmentLineId: string; unitId: string }[];
      };

      try {
        const result = await allocateUnitsToFulfillment(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          fulfillmentId,
          allocations: body.allocations,
        });
        return { data: result };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
