import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import {
  IamError,
  recordUserTwoFactorEvent,
  resetMemberTwoFactor,
  resolveTwoFactorAccessState,
  updateOrganizationTwoFactorPolicy,
  type TwoFactorEnforcementMode,
} from '@maevelle/database/iam';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { MaevelleAuth } from '../auth/auth.js';
import { revokeAuthSessionsForUser } from '../auth/secondary-storage.js';

type RequestHeaders = Record<string, string | string[] | undefined>;

function webHeaders(source: RequestHeaders): Headers {
  return new Headers(
    Object.entries(source).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

function authStorage(config: RuntimeConfig, database: DatabaseClient) {
  return {
    database,
    hmacSecret: config.betterAuthSecret,
    encryptionKey: Buffer.from(config.authEncryptionKey, 'base64'),
  };
}

async function sessionContext(
  database: DatabaseClient,
  auth: MaevelleAuth,
  headers: RequestHeaders,
  requiredCapability?: string,
) {
  const session = await auth.api.getSession({ headers: webHeaders(headers) });
  if (!session?.user?.id) return { error: 'UNAUTHENTICATED' as const };
  const selectedOrganization = headers['x-organization-id'];
  const active = await findActiveAdminContext(database.db, session.user.id, {
    ...(requiredCapability ? { requiredCapability } : {}),
    ...(typeof selectedOrganization === 'string' ? { organizationId: selectedOrganization } : {}),
  });
  if (!active) return { error: 'FORBIDDEN' as const };
  return {
    session,
    active,
    actor: {
      userId: session.user.id,
      organizationId: active.organizationId,
      membershipId: active.membershipId,
    },
  };
}

function authorizationError(reply: FastifyReply, code: 'UNAUTHENTICATED' | 'FORBIDDEN') {
  return reply.code(code === 'UNAUTHENTICATED' ? 401 : 403).send({
    error: {
      code,
      message:
        code === 'UNAUTHENTICATED'
          ? 'Authentication is required.'
          : 'The active organization membership does not allow this operation.',
    },
  });
}

function iamError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof IamError)) throw error;
  const status =
    error.code === 'NOT_FOUND'
      ? 404
      : error.code === 'FORBIDDEN' ||
          error.code === 'OWNER_PROTECTED' ||
          error.code === 'SELF_CHANGE_FORBIDDEN'
        ? 403
        : error.code === 'CONFLICT' || error.code === 'VERSION_CONFLICT'
          ? 409
          : 422;
  return reply.code(status).send({ error: { code: error.code, message: error.message } });
}

async function invokeAuth(
  auth: MaevelleAuth,
  request: FastifyRequest,
  path: string,
  body: unknown,
): Promise<Response> {
  const host = request.headers.host ?? 'localhost';
  const headers = webHeaders(request.headers);
  headers.set('content-type', 'application/json');
  return auth.handler(
    new Request(`${request.protocol}://${host}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

async function authFailure(reply: FastifyReply, response: Response) {
  const payload = (await response.json().catch(() => undefined)) as
    { code?: string; message?: string } | undefined;
  return reply.code(response.status).send({
    error: {
      code: payload?.code ?? 'TWO_FACTOR_OPERATION_FAILED',
      message: payload?.message ?? 'The authenticator operation could not be completed.',
    },
  });
}

function copyAuthHeaders(reply: FastifyReply, response: Response): void {
  for (const [name, value] of response.headers) reply.header(name, value);
  reply.header('cache-control', 'no-store, private');
  reply.header('pragma', 'no-cache');
}

async function verifyCurrentTotp(
  auth: MaevelleAuth,
  request: FastifyRequest,
  reply: FastifyReply,
  code: string,
): Promise<boolean> {
  const verification = await invokeAuth(auth, request, '/auth/two-factor/verify-totp', {
    code,
    trustDevice: false,
  });
  if (!verification.ok) {
    await authFailure(reply, verification);
    return false;
  }
  return true;
}

function requireFreshMfa(
  reply: FastifyReply,
  session: {
    user?: { twoFactorEnabled: boolean | null | undefined };
    session?: { createdAt?: Date | string };
  },
): boolean {
  const createdAt = session.session?.createdAt
    ? new Date(session.session.createdAt).getTime()
    : Number.NaN;
  if (
    !session.user?.twoFactorEnabled ||
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt > 10 * 60 * 1000
  ) {
    reply.code(403).send({
      error: {
        code: 'STEP_UP_REQUIRED',
        message: 'Sign in again with your authenticator before performing this sensitive action.',
      },
    });
    return false;
  }
  return true;
}

async function recordSecurityEventSafely(
  request: FastifyRequest,
  database: DatabaseClient,
  input: Parameters<typeof recordUserTwoFactorEvent>[1],
): Promise<void> {
  try {
    await recordUserTwoFactorEvent(database.db, input);
  } catch (error) {
    request.log.error(
      { err: error, securityEvent: input.event },
      'Failed to persist two-factor audit and notification side effects',
    );
  }
}

const totpCodeSchema = Type.String({ pattern: '^\\d{6}$' });

export function registerTwoFactorSecurityRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: MaevelleAuth,
  config: RuntimeConfig,
): void {
  app.get('/admin/security/two-factor/status', async (request, reply) => {
    const context = await sessionContext(database, auth, request.headers);
    if ('error' in context) return authorizationError(reply, context.error);
    const status = await resolveTwoFactorAccessState(
      database.db,
      context.session.user!.id!,
      context.active.organizationId,
    );
    if (!status) return authorizationError(reply, 'FORBIDDEN');
    reply.header('cache-control', 'no-store, private');
    return { data: { ...status, issuer: config.authTotpIssuer, trustedDevicesEnabled: false } };
  });

  app.post(
    '/admin/security/two-factor/enrollment',
    { schema: { body: Type.Object({ password: Type.String({ minLength: 1, maxLength: 128 }) }) } },
    async (request, reply) => {
      const context = await sessionContext(database, auth, request.headers);
      if ('error' in context) return authorizationError(reply, context.error);
      const currentState = await resolveTwoFactorAccessState(
        database.db,
        context.session.user!.id!,
        context.active.organizationId,
      );
      if (currentState?.isEnabled) {
        return reply.code(409).send({
          error: {
            code: 'TWO_FACTOR_ALREADY_ENABLED',
            message: 'Two-factor authentication is already enabled for this account.',
          },
        });
      }
      const response = await invokeAuth(auth, request, '/auth/two-factor/enable', {
        password: (request.body as { password: string }).password,
        issuer: config.authTotpIssuer,
      });
      if (!response.ok) return authFailure(reply, response);
      const enrollment = (await response.json()) as { totpURI: string };
      const uri = new URL(enrollment.totpURI);
      const setupKey = uri.searchParams.get('secret');
      if (!setupKey) throw new Error('Better Auth did not return a TOTP setup key.');
      await recordSecurityEventSafely(request, database, {
        userId: context.session.user!.id!,
        event: 'enrollment_started',
        requestId: request.id,
        ipAddress: request.ip,
        ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
      });
      reply.header('cache-control', 'no-store, private');
      reply.header('pragma', 'no-cache');
      return { data: { totpUri: enrollment.totpURI, setupKey, issuer: config.authTotpIssuer } };
    },
  );

  app.post(
    '/admin/security/two-factor/enrollment/verify',
    { schema: { body: Type.Object({ code: totpCodeSchema }) } },
    async (request, reply) => {
      const context = await sessionContext(database, auth, request.headers);
      if ('error' in context) return authorizationError(reply, context.error);
      const response = await invokeAuth(auth, request, '/auth/two-factor/verify-totp', {
        code: (request.body as { code: string }).code,
        trustDevice: false,
      });
      if (!response.ok) return authFailure(reply, response);
      copyAuthHeaders(reply, response);
      const userId = context.session.user!.id!;
      const recovery = await auth.api.viewBackupCodes({ body: { userId } });
      await recordSecurityEventSafely(request, database, {
        userId,
        event: 'enabled',
        requestId: request.id,
        ipAddress: request.ip,
        ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
      });
      return { data: { enabled: true, backupCodes: recovery.backupCodes } };
    },
  );

  app.post(
    '/admin/security/two-factor/backup-codes',
    {
      schema: {
        body: Type.Object({
          password: Type.String({ minLength: 1, maxLength: 128 }),
          code: totpCodeSchema,
        }),
      },
    },
    async (request, reply) => {
      const context = await sessionContext(database, auth, request.headers);
      if ('error' in context) return authorizationError(reply, context.error);
      if (!requireFreshMfa(reply, context.session)) return;
      const body = request.body as { password: string; code: string };
      if (!(await verifyCurrentTotp(auth, request, reply, body.code))) return;
      const response = await invokeAuth(auth, request, '/auth/two-factor/generate-backup-codes', {
        password: body.password,
      });
      if (!response.ok) return authFailure(reply, response);
      const payload = (await response.json()) as { backupCodes: string[] };
      await recordSecurityEventSafely(request, database, {
        userId: context.session.user!.id!,
        event: 'backup_codes_regenerated',
        requestId: request.id,
        ipAddress: request.ip,
        ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
      });
      reply.header('cache-control', 'no-store, private');
      return { data: { backupCodes: payload.backupCodes } };
    },
  );

  app.post(
    '/admin/security/two-factor/disable',
    {
      schema: {
        body: Type.Object({
          password: Type.String({ minLength: 1, maxLength: 128 }),
          code: totpCodeSchema,
        }),
      },
    },
    async (request, reply) => {
      const context = await sessionContext(database, auth, request.headers);
      if ('error' in context) return authorizationError(reply, context.error);
      const userId = context.session.user!.id!;
      const state = await resolveTwoFactorAccessState(
        database.db,
        userId,
        context.active.organizationId,
      );
      if (state?.isRequired)
        return reply.code(409).send({
          error: {
            code: 'TWO_FACTOR_REQUIRED_BY_POLICY',
            message: 'Organization policy requires authenticator protection for this account.',
          },
        });
      if (!requireFreshMfa(reply, context.session)) return;
      const body = request.body as { password: string; code: string };
      if (!(await verifyCurrentTotp(auth, request, reply, body.code))) return;
      const response = await invokeAuth(auth, request, '/auth/two-factor/disable', {
        password: body.password,
      });
      if (!response.ok) return authFailure(reply, response);
      copyAuthHeaders(reply, response);
      await revokeAuthSessionsForUser(authStorage(config, database), userId);
      await recordSecurityEventSafely(request, database, {
        userId,
        event: 'disabled',
        requestId: request.id,
        ipAddress: request.ip,
        ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
      });
      return { data: { disabled: true, signedOut: true } };
    },
  );

  app.get('/admin/security/two-factor/policy', async (request, reply) => {
    const context = await sessionContext(database, auth, request.headers);
    if ('error' in context) return authorizationError(reply, context.error);
    const state = await resolveTwoFactorAccessState(
      database.db,
      context.session.user!.id!,
      context.active.organizationId,
    );
    if (!state) return authorizationError(reply, 'FORBIDDEN');
    return { data: state.policy };
  });

  app.put(
    '/admin/security/two-factor/policy',
    {
      schema: {
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 0 }),
          mode: Type.Union([
            Type.Literal('OPTIONAL'),
            Type.Literal('CRITICAL_CAPABILITIES'),
            Type.Literal('ALL_MEMBERS'),
          ]),
          gracePeriodHours: Type.Integer({ minimum: 0, maximum: 720 }),
          reason: Type.String({ minLength: 3, maxLength: 500 }),
          code: totpCodeSchema,
        }),
      },
    },
    async (request, reply) => {
      const context = await sessionContext(
        database,
        auth,
        request.headers,
        'admin.security.two_factor_policy.manage',
      );
      if ('error' in context) return authorizationError(reply, context.error);
      if (!requireFreshMfa(reply, context.session)) return;
      const body = request.body as {
        expectedVersion: number;
        mode: TwoFactorEnforcementMode;
        gracePeriodHours: number;
        reason: string;
        code: string;
      };
      if (!(await verifyCurrentTotp(auth, request, reply, body.code))) return;
      try {
        return {
          data: await updateOrganizationTwoFactorPolicy(database.db, {
            actor: context.actor,
            expectedVersion: body.expectedVersion,
            mode: body.mode,
            gracePeriodHours: body.gracePeriodHours,
            reason: body.reason,
          }),
        };
      } catch (error) {
        return iamError(reply, error);
      }
    },
  );

  app.post(
    '/admin/team/:membershipId/two-factor/reset',
    {
      schema: {
        params: Type.Object({ membershipId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          code: totpCodeSchema,
          reason: Type.String({ minLength: 3, maxLength: 500 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await sessionContext(
        database,
        auth,
        request.headers,
        'admin.team.two_factor.reset',
      );
      if ('error' in context) return authorizationError(reply, context.error);
      if (!requireFreshMfa(reply, context.session)) return;
      const body = request.body as { code: string; reason: string };
      if (!(await verifyCurrentTotp(auth, request, reply, body.code))) return;
      try {
        const target = await resetMemberTwoFactor(database.db, {
          actor: context.actor,
          membershipId: (request.params as { membershipId: string }).membershipId,
          reason: body.reason,
        });
        const revokedSessions = await revokeAuthSessionsForUser(
          authStorage(config, database),
          target.userId,
        );
        return { data: { ...target, revokedSessions } };
      } catch (error) {
        return iamError(reply, error);
      }
    },
  );
}
