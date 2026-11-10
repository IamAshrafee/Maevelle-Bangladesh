import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@maevelle/database';
import { findActiveAdminContext } from '@maevelle/database/platform';
import { resolveTwoFactorAccessState } from '@maevelle/database/iam';
import type { MaevelleAuth } from './auth.js';

/** Authentication and organization security policy are mandatory before route-specific RBAC. */
export function registerAdminAccessGuard(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: MaevelleAuth,
) {
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?', 1)[0] ?? '';
    if (path.startsWith('/admin/') || path.startsWith('/auth/')) {
      reply.header('Cache-Control', 'private, no-store, max-age=0');
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?', 1)[0] ?? '';
    // Context is itself the authoritative access lookup and handles its own errors.
    if (!path.startsWith('/admin/') || path === '/admin/context') return;
    try {
      const session = await auth.api.getSession({
        headers: new Headers(
          Object.entries(request.headers).flatMap(([name, value]) =>
            typeof value === 'string' ? [[name, value]] : [],
          ),
        ),
      });
      if (!session?.user?.id || !session.session?.id) {
        return reply
          .code(401)
          .send({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } });
      }
      const selected = request.headers['x-organization-id'];
      const active = await findActiveAdminContext(database.db, session.user.id, {
        ...(typeof selected === 'string' ? { organizationId: selected } : {}),
      });
      if (!active)
        return reply
          .code(403)
          .send({ error: { code: 'ACCESS_DENIED', message: 'Access denied.' } });
      const state = await resolveTwoFactorAccessState(
        database.db,
        session.user.id,
        active.organizationId,
      );
      if (!state)
        return reply
          .code(403)
          .send({ error: { code: 'ACCESS_DENIED', message: 'Access denied.' } });
      const securityWorkflow =
        path === '/admin/account' ||
        path.startsWith('/admin/account/') ||
        [
          '/admin/security/two-factor/status',
          '/admin/security/two-factor/enrollment',
          '/admin/security/two-factor/enrollment/verify',
        ].includes(path);
      if (state.accessRestricted && !securityWorkflow) {
        return reply.code(403).send({
          error: {
            code: 'TWO_FACTOR_ENROLLMENT_REQUIRED',
            message: 'Set up an authenticator app before accessing protected Maevelle operations.',
            details: { enrollmentDeadline: state.policy.enrollmentDeadline },
          },
        });
      }
    } catch {
      request.log.warn(
        { securityEvent: 'admin_access_unavailable' },
        'Admin access verification unavailable',
      );
      return reply.code(503).send({
        error: {
          code: 'AUTH_UNAVAILABLE',
          message: 'Access verification is temporarily unavailable.',
        },
      });
    }
  });
}
