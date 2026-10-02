import type { FastifyInstance, FastifyReply } from 'fastify';
import { Type } from 'typebox';
import { hashPassword } from 'better-auth/crypto';

import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import {
  acceptMembershipInvitation,
  changeMemberLifecycle,
  createMembershipInvitation,
  createPermissionPreset,
  deletePermissionPreset,
  findMembershipUserId,
  findTeamMemberDetail,
  IamError,
  listCapabilityCatalog,
  listIamAuditEvents,
  listMembershipInvitations,
  listPermissionPresets,
  listTeamLocations,
  listTeamMembers,
  replaceMemberPermissions,
  requestMemberSessionRevocation,
  resendMembershipInvitation,
  revokeMembershipInvitation,
  transferOwnership,
  updatePermissionPreset,
} from '@maevelle/database/iam';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';
import {
  listAuthSessionsForUser,
  revokeAuthSessionsForUser,
} from '../auth/secondary-storage.js';

type Auth = ReturnType<typeof createAuth>;
type RequestHeaders = Record<string, string | string[] | undefined>;

const scopeSchema = Type.Object({
  capabilityCode: Type.String({ minLength: 3, maxLength: 160 }),
  scopeType: Type.Literal('LOCATION'),
  scopeId: Type.String({ format: 'uuid' }),
});

function webHeaders(source: RequestHeaders) {
  return new Headers(
    Object.entries(source).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

function encryptionKey(config: RuntimeConfig) {
  return { id: 'runtime-auth-key', value: Buffer.from(config.authEncryptionKey, 'base64') };
}

function authStorage(config: RuntimeConfig, database: DatabaseClient) {
  return {
    database,
    hmacSecret: config.betterAuthSecret,
    encryptionKey: Buffer.from(config.authEncryptionKey, 'base64'),
  };
}

async function requireContext(
  database: DatabaseClient,
  auth: Auth,
  source: RequestHeaders,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: webHeaders(source) });
  if (!session?.user?.id) return { error: 'UNAUTHENTICATED' as const };
  const selectedOrganization = source['x-organization-id'];
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
    ...(typeof selectedOrganization === 'string' ? { organizationId: selectedOrganization } : {}),
  });
  if (!active) return { error: 'FORBIDDEN' as const };
  return {
    active,
    session,
    actor: {
      organizationId: active.organizationId,
      membershipId: active.membershipId,
      userId: session.user.id,
    },
  };
}

function sendAuthorizationError(
  reply: FastifyReply,
  error: 'UNAUTHENTICATED' | 'FORBIDDEN',
) {
  return reply.code(error === 'UNAUTHENTICATED' ? 401 : 403).send({
    error: {
      code: error,
      message:
        error === 'UNAUTHENTICATED'
          ? 'Authentication is required.'
          : 'The active organization membership does not allow this operation.',
    },
  });
}

function sendIamError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof IamError)) throw error;
  const status =
    error.code === 'NOT_FOUND' || error.code === 'INVITATION_INVALID'
      ? 404
      : error.code === 'FORBIDDEN' ||
          error.code === 'OWNER_PROTECTED' ||
          error.code === 'SELF_CHANGE_FORBIDDEN'
        ? 403
        : error.code === 'CONFLICT' || error.code === 'VERSION_CONFLICT'
          ? 409
          : error.code === 'INVITATION_EXPIRED' || error.code === 'INVITATION_REVOKED'
            ? 410
            : 422;
  return reply.code(status).send({ error: { code: error.code, message: error.message } });
}

export function registerTeamAccessRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  config: RuntimeConfig,
): void {
  app.get(
    '/admin/team',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          search: Type.Optional(Type.String({ maxLength: 160 })),
          status: Type.Optional(
            Type.Union([Type.Literal('ACTIVE'), Type.Literal('DISABLED'), Type.Literal('REMOVED')]),
          ),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireContext(database, auth, request.headers, 'admin.team.view');
      if ('error' in context) return sendAuthorizationError(reply, context.error);
      return {
        data: await listTeamMembers(
          database.db,
          context.active.organizationId,
          request.query as Parameters<typeof listTeamMembers>[2],
        ),
      };
    },
  );

  app.get('/admin/team/capabilities', async (request, reply) => {
    const context = await requireContext(database, auth, request.headers, 'admin.team.view');
    if ('error' in context) return sendAuthorizationError(reply, context.error);
    return { data: await listCapabilityCatalog(database.db) };
  });

  app.get('/admin/team/presets', async (request, reply) => {
    const context = await requireContext(database, auth, request.headers, 'admin.team.view');
    if ('error' in context) return sendAuthorizationError(reply, context.error);
    return {
      data: await listPermissionPresets(database.db, context.active.organizationId),
    };
  });

  app.post(
    '/admin/team/presets',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1, maxLength: 120 }),
          description: Type.Optional(Type.String({ maxLength: 500 })),
          capabilityCodes: Type.Array(Type.String({ minLength: 3, maxLength: 160 }), { maxItems: 250 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireContext(
        database,
        auth,
        request.headers,
        'admin.team.permissions.manage',
      );
      if ('error' in context) return sendAuthorizationError(reply, context.error);
      try {
        const body = request.body as { name: string; description?: string; capabilityCodes: string[] };
        return reply.code(201).send({
          data: await createPermissionPreset(database.db, {
            actor: context.actor,
            ...body,
          }),
        });
      } catch (error) {
        return sendIamError(reply, error);
      }
    },
  );

  app.put(
    '/admin/team/presets/:presetId',
    {
      schema: {
        params: Type.Object({ presetId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          name: Type.String({ minLength: 1, maxLength: 120 }),
          description: Type.Optional(Type.String({ maxLength: 500 })),
          capabilityCodes: Type.Array(Type.String({ minLength: 3, maxLength: 160 }), { maxItems: 250 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireContext(
        database,
        auth,
        request.headers,
        'admin.team.permissions.manage',
      );
      if ('error' in context) return sendAuthorizationError(reply, context.error);
      try {
        const body = request.body as {
          expectedVersion: number;
          name: string;
          description?: string;
          capabilityCodes: string[];
        };
        return {
          data: await updatePermissionPreset(database.db, {
            actor: context.actor,
            presetId: (request.params as { presetId: string }).presetId,
            ...body,
          }),
        };
      } catch (error) {
        return sendIamError(reply, error);
      }
    },
  );

  app.delete(
    '/admin/team/presets/:presetId',
    {
      schema: {
        params: Type.Object({ presetId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireContext(
        database,
        auth,
        request.headers,
        'admin.team.permissions.manage',
      );
      if ('error' in context) return sendAuthorizationError(reply, context.error);
      try {
        const body = request.body as { expectedVersion: number };
        return {
          data: await deletePermissionPreset(database.db, {
            actor: context.actor,
            presetId: (request.params as { presetId: string }).presetId,
            expectedVersion: body.expectedVersion,
          }),
        };
      } catch (error) {
        return sendIamError(reply, error);
      }
    },
  );

  app.get('/admin/team/locations', async (request, reply) => {
    const context = await requireContext(database, auth, request.headers, 'admin.team.view');
    if ('error' in context) return sendAuthorizationError(reply, context.error);
    return { data: await listTeamLocations(database.db, context.active.organizationId) };
  });

  app.get(
    '/admin/team/audit',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 250 })),
          search: Type.Optional(Type.String({ maxLength: 160 })),
          action: Type.Optional(Type.String({ maxLength: 160 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireContext(database, auth, request.headers, 'admin.team.view');
      if ('error' in context) return sendAuthorizationError(reply, context.error);
      return {
        data: await listIamAuditEvents(
          database.db,
          context.active.organizationId,
          request.query as Parameters<typeof listIamAuditEvents>[2],
        ),
      };
    },
  );

  app.get('/admin/team/invitations', async (request, reply) => {
    const context = await requireContext(database, auth, request.headers, 'admin.team.view');
    if ('error' in context) return sendAuthorizationError(reply, context.error);
    return { data: await listMembershipInvitations(database.db, context.active.organizationId) };
  });

  app.post(
    '/admin/team/invitations',
    {
      schema: {
        body: Type.Object({
          email: Type.String({ minLength: 3, maxLength: 320 }),
          displayName: Type.String({ minLength: 1, maxLength: 160 }),
          capabilityCodes: Type.Array(Type.String({ minLength: 3, maxLength: 160 }), { maxItems: 250 }),
          scopes: Type.Array(scopeSchema, { maxItems: 500 }),
          expiresInHours: Type.Optional(Type.Integer({ minimum: 1, maximum: 168 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireContext(database, auth, request.headers, 'admin.team.invite');
      if ('error' in context) return sendAuthorizationError(reply, context.error);
      try {
        return reply.code(201).send({
          data: await createMembershipInvitation(database.db, {
            actor: context.actor,
            ...(request.body as Omit<
              Parameters<typeof createMembershipInvitation>[1],
              'actor' | 'encryptionKey' | 'idempotencyKey'
            >),
            ...(typeof request.headers['idempotency-key'] === 'string'
              ? { idempotencyKey: request.headers['idempotency-key'] }
              : {}),
            encryptionKey: encryptionKey(config),
          }),
        });
      } catch (error) {
        return sendIamError(reply, error);
      }
    },
  );

  app.post(
    '/admin/team/invitations/:invitationId/resend',
    {
      schema: {
        params: Type.Object({ invitationId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          expiresInHours: Type.Optional(Type.Integer({ minimum: 1, maximum: 168 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireContext(database, auth, request.headers, 'admin.team.invite');
      if ('error' in context) return sendAuthorizationError(reply, context.error);
      try {
        return {
          data: await resendMembershipInvitation(database.db, {
            actor: context.actor,
            invitationId: (request.params as { invitationId: string }).invitationId,
            ...(request.body as { expectedVersion: number; expiresInHours?: number }),
            encryptionKey: encryptionKey(config),
          }),
        };
      } catch (error) {
        return sendIamError(reply, error);
      }
    },
  );

  app.post(
    '/admin/team/invitations/:invitationId/revoke',
    {
      schema: {
        params: Type.Object({ invitationId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          reason: Type.String({ minLength: 3, maxLength: 500 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireContext(database, auth, request.headers, 'admin.team.invite');
      if ('error' in context) return sendAuthorizationError(reply, context.error);
      try {
        return {
          data: await revokeMembershipInvitation(database.db, {
            actor: context.actor,
            invitationId: (request.params as { invitationId: string }).invitationId,
            ...(request.body as { expectedVersion: number; reason: string }),
          }),
        };
      } catch (error) {
        return sendIamError(reply, error);
      }
    },
  );

  app.post(
    '/invitations/accept',
    {
      schema: {
        body: Type.Object({
          token: Type.String({ minLength: 32, maxLength: 200 }),
          password: Type.Optional(Type.String({ minLength: 12, maxLength: 128 })),
        }),
      },
    },
    async (request, reply) => {
      const body = request.body as { token: string; password?: string };
      try {
        return {
          data: await acceptMembershipInvitation(database.db, {
            token: body.token,
            ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
          }),
        };
      } catch (error) {
        return sendIamError(reply, error);
      }
    },
  );

  app.put(
    '/admin/team/:membershipId/permissions',
    {
      schema: {
        params: Type.Object({ membershipId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          capabilityCodes: Type.Array(Type.String({ minLength: 3, maxLength: 160 }), { maxItems: 250 }),
          scopes: Type.Array(scopeSchema, { maxItems: 500 }),
          reason: Type.Optional(Type.String({ minLength: 3, maxLength: 500 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireContext(
        database,
        auth,
        request.headers,
        'admin.team.permissions.manage',
      );
      if ('error' in context) return sendAuthorizationError(reply, context.error);
      try {
        const body = request.body as {
          expectedVersion: number;
          capabilityCodes: string[];
          scopes: { capabilityCode: string; scopeType: 'LOCATION'; scopeId: string }[];
          reason?: string;
        };
        return {
          data: await replaceMemberPermissions(database.db, {
            actor: context.actor,
            membershipId: (request.params as { membershipId: string }).membershipId,
            ...body,
          }),
        };
      } catch (error) {
        return sendIamError(reply, error);
      }
    },
  );

  for (const action of ['suspend', 'restore', 'remove'] as const)
    app.post(
      `/admin/team/:membershipId/${action}`,
      {
        schema: {
          params: Type.Object({ membershipId: Type.String({ format: 'uuid' }) }),
          body: Type.Object({
            expectedVersion: Type.Integer({ minimum: 1 }),
            reason: Type.String({ minLength: 3, maxLength: 500 }),
          }),
        },
      },
      async (request, reply) => {
        const context = await requireContext(
          database,
          auth,
          request.headers,
          'admin.team.lifecycle.manage',
        );
        if ('error' in context) return sendAuthorizationError(reply, context.error);
        try {
          const result = await changeMemberLifecycle(database.db, {
            actor: context.actor,
            membershipId: (request.params as { membershipId: string }).membershipId,
            action: action.toUpperCase() as 'SUSPEND' | 'RESTORE' | 'REMOVE',
            ...(request.body as { expectedVersion: number; reason: string }),
          });
          if (action !== 'restore')
            await revokeAuthSessionsForUser(authStorage(config, database), result.userId);
          return { data: result };
        } catch (error) {
          return sendIamError(reply, error);
        }
      },
    );

  app.post(
    '/admin/team/owner-transfer',
    {
      schema: {
        body: Type.Object({
          targetMembershipId: Type.String({ format: 'uuid' }),
          expectedOwnerVersion: Type.Integer({ minimum: 1 }),
          expectedTargetVersion: Type.Integer({ minimum: 1 }),
          reason: Type.String({ minLength: 3, maxLength: 500 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireContext(
        database,
        auth,
        request.headers,
        'admin.team.owner.transfer',
      );
      if ('error' in context) return sendAuthorizationError(reply, context.error);
      const sessionTimestamp = context.session.session?.createdAt;
      const authenticatedAt = sessionTimestamp ? new Date(sessionTimestamp).getTime() : 0;
      if (
        !context.session.user?.twoFactorEnabled ||
        !Number.isFinite(authenticatedAt) ||
        Date.now() - authenticatedAt > 10 * 60 * 1000
      )
        return reply.code(403).send({
          error: {
            code: 'STEP_UP_REQUIRED',
            message: 'A fresh MFA-authenticated session is required to transfer ownership.',
          },
        });
      try {
        return {
          data: await transferOwnership(database.db, {
            actor: context.actor,
            ...(request.body as Omit<Parameters<typeof transferOwnership>[1], 'actor'>),
          }),
        };
      } catch (error) {
        return sendIamError(reply, error);
      }
    },
  );

  app.get(
    '/admin/team/:membershipId',
    {
      schema: {
        params: Type.Object({ membershipId: Type.String({ format: 'uuid' }) }),
      },
    },
    async (request, reply) => {
      const context = await requireContext(database, auth, request.headers, 'admin.team.view');
      if ('error' in context) return sendAuthorizationError(reply, context.error);
      const membershipId = (request.params as { membershipId: string }).membershipId;
      const member = await findTeamMemberDetail(
        database.db,
        context.active.organizationId,
        membershipId,
      );
      if (!member) {
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'The membership was not found.' } });
      }
      return { data: member };
    },
  );

  app.get('/admin/team/:membershipId/sessions', async (request, reply) => {
    const context = await requireContext(database, auth, request.headers, 'admin.team.view');
    if ('error' in context) return sendAuthorizationError(reply, context.error);
    const membershipId = (request.params as { membershipId: string }).membershipId;
    const userId = await findMembershipUserId(
      database.db,
      context.active.organizationId,
      membershipId,
    );
    if (!userId)
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'The membership was not found.' } });
    return { data: await listAuthSessionsForUser(authStorage(config, database), userId) };
  });

  app.post('/admin/team/:membershipId/sessions/revoke', async (request, reply) => {
    const context = await requireContext(
      database,
      auth,
      request.headers,
      'admin.team.sessions.revoke',
    );
    if ('error' in context) return sendAuthorizationError(reply, context.error);
    const membershipId = (request.params as { membershipId: string }).membershipId;
    try {
      const target = await requestMemberSessionRevocation(database.db, {
        actor: context.actor,
        membershipId,
        reason: 'Explicit administrator session revocation',
      });
      return {
        data: {
          revoked: await revokeAuthSessionsForUser(authStorage(config, database), target.userId),
        },
      };
    } catch (error) {
      return sendIamError(reply, error);
    }
  });
}
