import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import { findActiveAdminContext } from '@maevelle/database/platform';

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
            capabilities: Type.Array(Type.String()),
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

      return {
        actorId: session.user.id,
        organizationId: active.organizationId,
        membershipId: active.membershipId,
        capabilities: [...active.capabilities],
      };
    },
  );
}
