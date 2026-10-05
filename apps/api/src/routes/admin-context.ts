import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import { findActiveAdminContext } from '@maevelle/database/platform';
import { resolveTwoFactorAccessState } from '@maevelle/database/iam';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

function requestHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string') result.set(name, value);
  }
  return result;
}

export function registerAdminContextRoute(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get(
    '/admin/context',
    {
      schema: {
        response: {
          200: Type.Object({
            actorId: Type.String(),
            organizationId: Type.String(),
            membershipId: Type.String(),
            membershipType: Type.Union([Type.Literal('OWNER'), Type.Literal('STANDARD')]),
            capabilities: Type.Array(Type.String()),
            scopes: Type.Array(
              Type.Object({
                capabilityCode: Type.String(),
                scopeType: Type.Literal('LOCATION'),
                scopeId: Type.String(),
              }),
            ),
            twoFactor: Type.Object({
              isEnabled: Type.Boolean(),
              isRequired: Type.Boolean(),
              enrollmentRequired: Type.Boolean(),
              accessRestricted: Type.Boolean(),
              enrollmentDeadline: Type.Union([Type.String(), Type.Null()]),
            }),
          }),
          401: Type.Object({ error: Type.Literal('UNAUTHENTICATED') }),
          403: Type.Object({ error: Type.Literal('FORBIDDEN') }),
        },
        querystring: Type.Object({
          organizationId: Type.Optional(
            Type.String({
              pattern:
                '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
            }),
          ),
          requiredCapability: Type.Optional(Type.String({ minLength: 1 })),
        }),
      },
    },
    async (request, reply) => {
      const session = await auth.api.getSession({ headers: requestHeaders(request.headers) });
      if (!session?.user?.id) return reply.code(401).send({ error: 'UNAUTHENTICATED' });

      const contextRequest = request.query as {
        organizationId?: string;
        requiredCapability?: string;
      };
      const active = await findActiveAdminContext(database.db, session.user.id, contextRequest);
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const twoFactor = await resolveTwoFactorAccessState(
        database.db,
        session.user.id,
        active.organizationId,
      );
      if (!twoFactor) return reply.code(403).send({ error: 'FORBIDDEN' });

      return {
        actorId: session.user.id,
        organizationId: active.organizationId,
        membershipId: active.membershipId,
        membershipType: active.membershipType,
        capabilities: [...active.capabilities],
        scopes: [...active.scopes],
        twoFactor: {
          isEnabled: twoFactor.isEnabled,
          isRequired: twoFactor.isRequired,
          enrollmentRequired: twoFactor.enrollmentRequired,
          accessRestricted: twoFactor.accessRestricted,
          enrollmentDeadline: twoFactor.policy.enrollmentDeadline,
        },
      };
    },
  );
}
