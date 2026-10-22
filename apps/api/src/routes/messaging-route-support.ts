import type { FastifyReply } from 'fastify';

import type { DatabaseClient } from '@maevelle/database';
import * as messaging from '@maevelle/database/messaging';
import { findActiveAdminContext, type AdminContextRecord } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

export type MessagingAuth = ReturnType<typeof createAuth>;

export function messagingRequestHeaders(
  input: Record<string, string | string[] | undefined>,
): Headers {
  return new Headers(
    Object.entries(input).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

export async function authenticateMessagingAdmin(
  database: DatabaseClient,
  auth: MessagingAuth,
  headers: Record<string, string | string[] | undefined>,
  required?: string,
): Promise<(AdminContextRecord & { actorId: string }) | undefined> {
  const session = await auth.api.getSession({ headers: messagingRequestHeaders(headers) });
  if (!session?.user?.id) return;
  const selected = headers['x-organization-id'];
  const context = await findActiveAdminContext(database.db, session.user.id, {
    ...(typeof selected === 'string' ? { organizationId: selected } : {}),
    ...(required ? { requiredCapability: required } : {}),
  });
  return context ? { ...context, actorId: session.user.id } : undefined;
}

export function messagingAccess(context: AdminContextRecord): messaging.ConversationAccess {
  return context.capabilities.includes('messaging.inbox.view_all') ? 'ALL' : 'ASSIGNED';
}
export function hasMessagingInboxAccess(context: AdminContextRecord): boolean {
  return context.capabilities.some(
    (capability) =>
      capability === 'messaging.inbox.view_assigned' || capability === 'messaging.inbox.view_all',
  );
}

export function sendMessagingError(reply: FastifyReply, error: unknown, requestId: string) {
  if (!(error instanceof messaging.MessagingDomainError)) throw error;
  const status =
    error.code === 'CONVERSATION_NOT_FOUND'
      ? 404
      : error.code === 'EVENT_CURSOR_EXPIRED'
        ? 410
        : error.code === 'VALIDATION_FAILED'
          ? 400
          : [
                'STALE_VERSION',
                'ASSIGNMENT_CONFLICT',
                'CONVERSATION_CLOSED',
                'IDEMPOTENCY_IN_PROGRESS',
                'IDEMPOTENCY_KEY_REUSED',
              ].includes(error.code)
            ? 409
            : error.code === 'CONNECTION_UNAVAILABLE'
              ? 503
              : error.code === 'REPLY_WINDOW_CLOSED'
                ? 422
                : 422;
  return reply.code(status).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      requestId,
    },
  });
}

export function parseExpectedVersion(value: string | string[] | undefined): string {
  if (typeof value !== 'string')
    throw new messaging.MessagingDomainError('VALIDATION_FAILED', 'If-Match is required.');
  const version = value.replace(/^W\//, '').replaceAll('"', '');
  if (!/^\d+$/.test(version))
    throw new messaging.MessagingDomainError(
      'VALIDATION_FAILED',
      'If-Match must contain a quoted numeric version.',
    );
  return version;
}

export function messagingActor(
  context: AdminContextRecord & { actorId: string },
): messaging.MessagingActorContext {
  return {
    organizationId: context.organizationId,
    actorId: context.actorId,
    membershipId: context.membershipId,
    capabilities: context.capabilities,
  };
}
