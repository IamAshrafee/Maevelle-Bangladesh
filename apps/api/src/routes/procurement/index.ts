import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@maevelle/database';
import type { Auth } from './common.js';
import { registerSupplierRoutes } from './suppliers.routes.js';
import { registerPurchaseRoutes } from './purchases.routes.js';
import { registerShipmentRoutes } from './shipments.routes.js';
import { registerReceivingRoutes } from './receiving.routes.js';

export function registerProcurementRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  registerSupplierRoutes(app, database, auth);
  registerPurchaseRoutes(app, database, auth);
  registerShipmentRoutes(app, database, auth);
  registerReceivingRoutes(app, database, auth);
}
