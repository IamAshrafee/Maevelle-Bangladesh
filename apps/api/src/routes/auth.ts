import type { FastifyInstance } from 'fastify';

import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import { createObjectStorage } from '@maevelle/media';
import { findActiveAdminContext } from '@maevelle/database/platform';

import { createAuth } from '../auth/auth.js';
import { recordUserTwoFactorEvent, resolveTwoFactorAccessState } from '@maevelle/database/iam';
import { registerTwoFactorSecurityRoutes } from './two-factor-security.js';
import { registerAdminContextRoute } from './admin-context.js';
import { registerAccountRoutes } from './account.js';
import { registerCatalogRoutes } from './catalog.js';
import { registerMediaRoutes } from './media.js';
import { registerSizingRoutes } from './sizing.js';
import { registerInventoryRoutes } from './inventory.js';
import { registerWarehouseRoutes } from './warehouse.js';
import { registerCustomerRoutes } from './customers.js';
import { registerPricingRoutes } from './pricing.js';
import { registerPromotionRoutes } from './promotions.js';
import { registerCartRoutes } from './cart.js';
import { registerOrderRoutes } from './orders.js';
import { registerPaymentRoutes } from './payments.js';
import { registerFulfillmentDeliveryRoutes } from './fulfillment-delivery.js';
import { registerProcurementRoutes } from './procurement.js';
import { registerCostingRoutes } from './costing.js';
import { registerReturnRoutes } from './returns.js';
import { registerFinanceRoutes } from './finance.js';
import { registerCapitalRoutes } from './capital.js';
import { registerReviewRoutes } from './reviews.js';
import { registerNotificationRoutes } from './notifications.js';
import { registerAnalyticsRoutes } from './analytics.js';
import { registerAdminOperationsRoutes } from './admin-operations.js';
import { registerPathaoRoutes } from './pathao.js';
import { registerSteadfastRoutes } from './steadfast.js';
import { registerCourierWebhookRoutes } from './courier-webhooks.js';
import { registerTeamAccessRoutes } from './team-access.js';
import { registerAssetRoutes } from './assets.js';
import { registerSettingsRoutes } from './settings.js';

export function registerAuthRoutes(
  app: FastifyInstance,
  config: RuntimeConfig,
  database: DatabaseClient,
): void {
  const auth = createAuth(config, database);

  app.all('/auth/*', async (request, reply) => {
    const authPath = request.raw.url?.split('?', 1)[0] ?? request.url.split('?', 1)[0] ?? '';
    if (
      request.method === 'POST' &&
      [
        '/auth/two-factor/enable',
        '/auth/two-factor/disable',
        '/auth/two-factor/generate-backup-codes',
      ].includes(authPath)
    )
      return reply.code(404).send({
        error: {
          code: 'USE_MAEVELLE_SECURITY_API',
          message: 'Use the Maevelle Account Security workflow for this operation.',
        },
      });
    const host = request.headers.host ?? 'localhost';
    const requestBody =
      request.body === undefined
        ? undefined
        : typeof request.body === 'string'
          ? JSON.parse(request.body)
          : Buffer.isBuffer(request.body)
            ? JSON.parse(request.body.toString('utf8'))
            : request.body;
    const hardenedBody =
      request.method === 'POST' &&
      ['/auth/two-factor/verify-totp', '/auth/two-factor/verify-backup-code'].includes(authPath) &&
      requestBody &&
      typeof requestBody === 'object'
        ? { ...(requestBody as Record<string, unknown>), trustDevice: false }
        : requestBody;
    const body = hardenedBody === undefined ? undefined : JSON.stringify(hardenedBody);
    const response = await auth.handler(
      new Request(`${request.protocol}://${host}${request.raw.url}`, {
        method: request.method,
        headers: new Headers(
          Object.entries(request.headers).flatMap(([name, value]) =>
            typeof value === 'string' ? [[name, value]] : [],
          ),
        ),
        ...(body ? { body } : {}),
      }),
    );
    for (const [name, value] of response.headers) reply.header(name, value);
    reply.header('cache-control', 'no-store, private');
    const responseText = await response.text();
    if (
      response.ok &&
      request.method === 'POST' &&
      authPath === '/auth/two-factor/verify-backup-code'
    ) {
      const payload = JSON.parse(responseText) as { user?: { id?: string } };
      if (payload.user?.id) {
        try {
          await recordUserTwoFactorEvent(database.db, {
            userId: payload.user.id,
            event: 'recovery_code_used',
            requestId: request.id,
            ipAddress: request.ip,
            ...(request.headers['user-agent']
              ? { userAgent: request.headers['user-agent'] }
              : {}),
          });
        } catch (error) {
          request.log.error(
            { err: error, securityEvent: 'recovery_code_used' },
            'Failed to persist two-factor audit and notification side effects',
          );
        }
      }
    }
    return reply.code(response.status).send(responseText);
  });

  // Each registered Admin route still authorizes through findActiveAdminContext;
  // this hook is an additional organization-policy gate, not an RBAC substitute.
  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?', 1)[0] ?? '';
    if (!path.startsWith('/admin/')) return;
    if (
      path === '/admin/context' ||
      path.startsWith('/admin/account') ||
      path === '/admin/security/two-factor/status' ||
      path === '/admin/security/two-factor/enrollment' ||
      path === '/admin/security/two-factor/enrollment/verify'
    )
      return;
    const session = await auth.api.getSession({
      headers: new Headers(
        Object.entries(request.headers).flatMap(([name, value]) =>
          typeof value === 'string' ? [[name, value]] : [],
        ),
      ),
    });
    if (!session?.user?.id) return;
    const selectedOrganization = request.headers['x-organization-id'];
    const active = await findActiveAdminContext(database.db, session.user.id, {
      ...(typeof selectedOrganization === 'string'
        ? { organizationId: selectedOrganization }
        : {}),
    });
    if (!active) return;
    const state = await resolveTwoFactorAccessState(
      database.db,
      session.user.id,
      active.organizationId,
    );
    if (state?.accessRestricted)
      return reply.code(403).send({
        error: {
          code: 'TWO_FACTOR_ENROLLMENT_REQUIRED',
          message: 'Set up an authenticator app before accessing protected Maevelle operations.',
          details: { enrollmentDeadline: state.policy.enrollmentDeadline },
        },
      });
  });

  const objectStorage = createObjectStorage(
    config.mediaStorageProvider === 'local'
      ? { provider: 'local', rootDirectory: config.mediaStoragePath }
      : {
          provider: 's3',
          endpoint: config.mediaStorageEndpoint!,
          region: config.mediaStorageRegion,
          accessKeyId: config.mediaStorageAccessKeyId!,
          secretAccessKey: config.mediaStorageSecretAccessKey!,
          privateBucket: config.mediaPrivateBucket,
          publicBucket: config.mediaPublicBucket,
          forcePathStyle: config.mediaStorageForcePathStyle,
        },
  );

  registerTwoFactorSecurityRoutes(app, database, auth, config);
  registerAdminContextRoute(app, database, auth);
  registerAccountRoutes(app, database, auth, config, objectStorage);
  registerCatalogRoutes(app, database, auth, config.storefrontOrganizationCode);
  registerMediaRoutes(app, database, auth, objectStorage, {
    maxUploadBytes: config.mediaMaxUploadBytes,
    uploadExpirySeconds: config.mediaUploadExpirySeconds,
  });
  registerSizingRoutes(app, database, auth);
  registerInventoryRoutes(app, database, auth);
  registerWarehouseRoutes(app, database, auth);
  registerCustomerRoutes(app, database, auth);
  registerPricingRoutes(app, database, auth);
  registerPromotionRoutes(app, database, auth);
  registerCartRoutes(app, database);
  registerOrderRoutes(app, database, auth, config);
  registerPaymentRoutes(app, database, auth);
  registerFulfillmentDeliveryRoutes(app, database, auth, config);
  registerProcurementRoutes(app, database, auth);
  registerCostingRoutes(app, database, auth);
  registerReturnRoutes(app, database, auth);
  registerFinanceRoutes(app, database, auth);
  registerCapitalRoutes(app, database, auth);
  registerReviewRoutes(app, database, auth);
  registerNotificationRoutes(app, database, auth, config);
  registerPathaoRoutes(app, database, auth, config);
  registerSteadfastRoutes(app, database, auth, config);
  registerCourierWebhookRoutes(app, database);
  registerAnalyticsRoutes(app, database, auth, config.storefrontOrganizationCode);
  registerAdminOperationsRoutes(app, database, auth);
  registerTeamAccessRoutes(app, database, auth, config);
  registerAssetRoutes(app, database, auth);
  registerSettingsRoutes(app, database, auth, config);
}
