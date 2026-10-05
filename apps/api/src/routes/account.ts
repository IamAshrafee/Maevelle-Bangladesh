import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import {
  cancelUserEmailChange,
  confirmUserEmailChange,
  confirmUserEmailVerification,
  findUserAccountOverview,
  findUserCredentialHash,
  IamError,
  listUserSecurityActivity,
  removeUserAccountAvatar,
  requestUserEmailChange,
  requestUserEmailVerification,
  updateUserAccountAvatar,
  updateUserAccountProfile,
  updateUserPasswordHash,
} from '@maevelle/database/iam';
import {
  InvalidImageError,
  processAvatarImage,
  validateMediaSignature,
  type ObjectStoragePort,
} from '@maevelle/media';
import { hashPassword, verifyPassword } from 'better-auth/crypto';

import type { createAuth } from '../auth/auth.js';
import {
  listAuthSessionsForUser,
  revokeAuthSessionById,
  revokeAuthSessionsForUser,
  revokeOtherAuthSessions,
} from '../auth/secondary-storage.js';
import { parseUserAgent } from '../auth/user-agent.js';

type Auth = ReturnType<typeof createAuth>;

interface AuthenticatedSession {
  readonly user: {
    readonly id: string;
    readonly name?: string;
    readonly email?: string;
    readonly image?: string | null;
    readonly twoFactorEnabled?: boolean | null;
  };
  readonly session?: {
    readonly id?: string;
    readonly createdAt?: Date | string;
    readonly updatedAt?: Date | string;
    readonly expiresAt?: Date | string;
    readonly ipAddress?: string | null;
    readonly userAgent?: string | null;
  };
}

function webHeaders(source: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(source).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

function authStorageOptions(config: RuntimeConfig, database: DatabaseClient) {
  return {
    database,
    hmacSecret: config.betterAuthSecret,
    encryptionKey: Buffer.from(config.authEncryptionKey, 'base64'),
  };
}

async function requireUserSession(
  auth: Auth,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthenticatedSession | null> {
  const session = await auth.api.getSession({ headers: webHeaders(request.headers) });
  if (!session?.user?.id) {
    reply.code(401).send({
      error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to manage your account.' },
    });
    return null;
  }
  return session as AuthenticatedSession;
}

function handleAccountError(reply: FastifyReply, error: unknown) {
  if (error instanceof IamError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'CONFLICT'
            ? 409
            : 422;
    return reply.code(status).send({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  if (error instanceof InvalidImageError) {
    return reply.code(422).send({
      error: { code: error.code, message: error.message },
    });
  }

  throw error;
}

export function registerAccountRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  config: RuntimeConfig,
  objectStorage: ObjectStoragePort,
): void {
  const storageOpts = authStorageOptions(config, database);

  // 1. Get current account overview
  app.get('/admin/account', async (request, reply) => {
    const session = await requireUserSession(auth, request, reply);
    if (!session) return;

    try {
      const selectedOrg =
        typeof request.headers['x-organization-id'] === 'string'
          ? request.headers['x-organization-id']
          : undefined;
      const overview = await findUserAccountOverview(database.db, session.user.id, selectedOrg);

      return { data: overview };
    } catch (error) {
      return handleAccountError(reply, error);
    }
  });

  // 2. Update personal profile (strict mass-assignment protection)
  app.patch(
    '/admin/account/profile',
    {
      schema: {
        body: Type.Object(
          {
            name: Type.String({ minLength: 1, maxLength: 120 }),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const session = await requireUserSession(auth, request, reply);
      if (!session) return;

      const rawPayload = (request as unknown as { rawBody?: string }).rawBody;
      if (rawPayload) {
        try {
          const parsed = JSON.parse(rawPayload) as Record<string, unknown>;
          const extraKeys = Object.keys(parsed).filter((k) => k !== 'name');
          if (extraKeys.length > 0) {
            return reply.code(400).send({
              error: {
                code: 'INVALID_FIELDS',
                message: `Unrecognized properties: ${extraKeys.join(', ')}`,
              },
            });
          }
        } catch {
          // JSON parse handled by Fastify
        }
      }

      const body = request.body as { name: string };
      const trimmedName = body.name ? body.name.trim() : '';
      if (!trimmedName) {
        return reply.code(422).send({
          error: { code: 'INVALID_NAME', message: 'Name cannot be empty or blank whitespace.' },
        });
      }

      try {
        const selectedOrg =
          typeof request.headers['x-organization-id'] === 'string'
            ? request.headers['x-organization-id']
            : undefined;
        const updated = await updateUserAccountProfile(database.db, {
          userId: session.user.id,
          name: trimmedName,
          ...(selectedOrg ? { organizationId: selectedOrg } : {}),
        });

        return { data: updated };
      } catch (error) {
        return handleAccountError(reply, error);
      }
    },
  );

  // 3. Upload and set profile avatar
  app.post(
    '/admin/account/avatar',
    {
      bodyLimit: 3 * 1024 * 1024, // 3MB transport body limit
    },
    async (request, reply) => {
      const session = await requireUserSession(auth, request, reply);
      if (!session) return;

      let rawBuffer: Buffer | null = null;
      let declaredMime: string | undefined = request.headers['content-type'];

      if (Buffer.isBuffer(request.body)) {
        rawBuffer = request.body;
      } else if (typeof request.body === 'object' && request.body !== null) {
        const bodyObj = request.body as { imageBase64?: string; mimeType?: string };
        if (bodyObj.imageBase64 && typeof bodyObj.imageBase64 === 'string') {
          rawBuffer = Buffer.from(bodyObj.imageBase64, 'base64');
          if (bodyObj.mimeType) declaredMime = bodyObj.mimeType;
        }
      }

      if (!rawBuffer || rawBuffer.length === 0) {
        return reply.code(422).send({
          error: { code: 'MISSING_AVATAR_FILE', message: 'No avatar image was provided.' },
        });
      }

      // Max size: 2MB for avatar uploads
      if (rawBuffer.length > 2 * 1024 * 1024) {
        return reply.code(413).send({
          error: {
            code: 'AVATAR_TOO_LARGE',
            message: 'Avatar image exceeds the 2MB size limit.',
          },
        });
      }

      const mimeType = declaredMime?.split(';')[0]?.trim().toLowerCase() ?? 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        return reply.code(422).send({
          error: {
            code: 'INVALID_AVATAR_TYPE',
            message: 'Only JPEG, PNG, and WebP images are supported.',
          },
        });
      }

      if (!validateMediaSignature(rawBuffer, mimeType)) {
        return reply.code(422).send({
          error: {
            code: 'INVALID_AVATAR_TYPE',
            message: 'Image content signature does not match declared type.',
          },
        });
      }

      try {
        const processed = await processAvatarImage(rawBuffer);
        const filename = `${session.user.id}-${Date.now()}.webp`;
        const avatarKey = `avatars/${filename}`;

        await objectStorage.put(
          {
            provider: objectStorage.provider,
            bucket: objectStorage.publicBucket,
            key: avatarKey,
          },
          processed.content,
          {
            contentType: 'image/webp',
            checksumSha256: processed.checksumSha256,
          },
        );

        const avatarUrl = `/media/${avatarKey}`;
        const selectedOrg =
          typeof request.headers['x-organization-id'] === 'string'
            ? request.headers['x-organization-id']
            : undefined;
        const result = await updateUserAccountAvatar(database.db, {
          userId: session.user.id,
          imageUrl: avatarUrl,
          ...(selectedOrg ? { organizationId: selectedOrg } : {}),
        });

        // Clean up previous avatar if it was managed locally
        if (result.previousImage && result.previousImage.startsWith('/media/avatars/')) {
          const oldFilename = result.previousImage.replace('/media/avatars/', '');
          if (/^[a-zA-Z0-9_-]+\.webp$/.test(oldFilename)) {
            await objectStorage
              .delete({
                provider: objectStorage.provider,
                bucket: objectStorage.publicBucket,
                key: `avatars/${oldFilename}`,
              })
              .catch(() => {});
          }
        }

        return reply.code(201).send({
          data: {
            avatarUrl: result.profile.image,
            byteSize: processed.byteSize,
          },
        });
      } catch (error) {
        return handleAccountError(reply, error);
      }
    },
  );

  // 4. Remove profile avatar
  app.delete('/admin/account/avatar', async (request, reply) => {
    const session = await requireUserSession(auth, request, reply);
    if (!session) return;

    try {
      const selectedOrg =
        typeof request.headers['x-organization-id'] === 'string'
          ? request.headers['x-organization-id']
          : undefined;
      const result = await removeUserAccountAvatar(database.db, {
        userId: session.user.id,
        ...(selectedOrg ? { organizationId: selectedOrg } : {}),
      });

      if (result.removedImage && result.removedImage.startsWith('/media/avatars/')) {
        const oldFilename = result.removedImage.replace('/media/avatars/', '');
        if (/^[a-zA-Z0-9_-]+\.webp$/.test(oldFilename)) {
          await objectStorage
            .delete({
              provider: objectStorage.provider,
              bucket: objectStorage.publicBucket,
              key: `avatars/${oldFilename}`,
            })
            .catch(() => {});
        }
      }

      return { data: { avatarUrl: null } };
    } catch (error) {
      return handleAccountError(reply, error);
    }
  });

  // 5. Public delivery route for profile avatars
  app.get('/media/avatars/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    if (!/^[a-zA-Z0-9_-]+\.webp$/.test(filename)) {
      return reply.code(400).send({
        error: { code: 'INVALID_FILENAME', message: 'Invalid avatar filename format.' },
      });
    }

    try {
      const buffer = await objectStorage.get({
        provider: objectStorage.provider,
        bucket: objectStorage.publicBucket,
        key: `avatars/${filename}`,
      });

      if (!buffer) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Avatar image was not found.' },
        });
      }

      reply.header('content-type', 'image/webp');
      reply.header('cache-control', 'public, max-age=31536000, immutable');
      return reply.send(buffer);
    } catch {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Avatar image could not be loaded.' },
      });
    }
  });

  // 6. Request email verification resend
  app.post('/admin/account/email/verification', async (request, reply) => {
    const session = await requireUserSession(auth, request, reply);
    if (!session) return;

    try {
      const selectedOrg =
        typeof request.headers['x-organization-id'] === 'string'
          ? request.headers['x-organization-id']
          : undefined;
      const result = await requestUserEmailVerification(database.db, {
        userId: session.user.id,
        ...(selectedOrg ? { organizationId: selectedOrg } : {}),
      });

      return {
        data: {
          expiresAt: result.expiresAt,
          message: 'Verification code has been sent to your email address.',
        },
      };
    } catch (error) {
      return handleAccountError(reply, error);
    }
  });

  // 7. Confirm email verification with token
  app.post(
    '/admin/account/email/verify',
    {
      schema: {
        body: Type.Object({
          token: Type.String({ minLength: 6, maxLength: 128 }),
        }),
      },
    },
    async (request, reply) => {
      const session = await requireUserSession(auth, request, reply);
      if (!session) return;

      const body = request.body as { token: string };
      try {
        const selectedOrg =
          typeof request.headers['x-organization-id'] === 'string'
            ? request.headers['x-organization-id']
            : undefined;
        const result = await confirmUserEmailVerification(database.db, {
          userId: session.user.id,
          token: body.token.trim(),
          ...(selectedOrg ? { organizationId: selectedOrg } : {}),
        });

        return {
          data: {
            emailVerified: result.verified,
          },
        };
      } catch (error) {
        return handleAccountError(reply, error);
      }
    },
  );

  // 8. Initiate email change (requires fresh authentication / current password)
  app.post(
    '/admin/account/email/change',
    {
      schema: {
        body: Type.Object({
          newEmail: Type.String({ minLength: 5, maxLength: 255 }),
          currentPassword: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const session = await requireUserSession(auth, request, reply);
      if (!session) return;

      const body = request.body as { newEmail: string; currentPassword: string };
      const normalizedEmail = body.newEmail.trim().toLowerCase();

      // Basic email syntax validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return reply.code(422).send({
          error: { code: 'INVALID_EMAIL', message: 'Please provide a valid email address.' },
        });
      }

      // Reauthenticate: verify current password
      const storedHash = await findUserCredentialHash(database.db, session.user.id);
      if (!storedHash) {
        return reply.code(400).send({
          error: {
            code: 'NO_PASSWORD_SET',
            message: 'Account does not have a credential password configured.',
          },
        });
      }

      const passwordValid = await verifyPassword({
        hash: storedHash,
        password: body.currentPassword,
      });

      if (!passwordValid) {
        return reply.code(401).send({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Current password verification failed. Please try again.',
          },
        });
      }

      try {
        const selectedOrg =
          typeof request.headers['x-organization-id'] === 'string'
            ? request.headers['x-organization-id']
            : undefined;
        const result = await requestUserEmailChange(database.db, {
          userId: session.user.id,
          newEmail: normalizedEmail,
          ...(selectedOrg ? { organizationId: selectedOrg } : {}),
        });

        return {
          data: {
            pendingEmail: result.pendingEmail,
            expiresAt: result.expiresAt,
            message: 'Verification code sent to your new email address.',
          },
        };
      } catch (error) {
        return handleAccountError(reply, error);
      }
    },
  );

  // 9. Confirm email change with verification token
  app.post(
    '/admin/account/email/change/confirm',
    {
      schema: {
        body: Type.Object({
          token: Type.String({ minLength: 6, maxLength: 128 }),
        }),
      },
    },
    async (request, reply) => {
      const session = await requireUserSession(auth, request, reply);
      if (!session) return;

      const body = request.body as { token: string };
      try {
        const selectedOrg =
          typeof request.headers['x-organization-id'] === 'string'
            ? request.headers['x-organization-id']
            : undefined;
        const result = await confirmUserEmailChange(database.db, {
          userId: session.user.id,
          token: body.token.trim(),
          ...(selectedOrg ? { organizationId: selectedOrg } : {}),
        });

        // Revoke other active sessions for security when canonical email identity changes
        if (session.session?.id) {
          await revokeOtherAuthSessions(storageOpts, session.user.id, session.session.id).catch(
            () => {},
          );
        }

        return {
          data: {
            newEmail: result.newEmail,
            emailVerified: true,
          },
        };
      } catch (error) {
        return handleAccountError(reply, error);
      }
    },
  );

  // 10. Cancel pending email change
  app.post('/admin/account/email/change/cancel', async (request, reply) => {
    const session = await requireUserSession(auth, request, reply);
    if (!session) return;

    try {
      const selectedOrg =
        typeof request.headers['x-organization-id'] === 'string'
          ? request.headers['x-organization-id']
          : undefined;
      await cancelUserEmailChange(database.db, {
        userId: session.user.id,
        ...(selectedOrg ? { organizationId: selectedOrg } : {}),
      });

      return { data: { success: true } };
    } catch (error) {
      return handleAccountError(reply, error);
    }
  });

  // 11. Change account password
  app.post(
    '/admin/account/password',
    {
      schema: {
        body: Type.Object({
          currentPassword: Type.String({ minLength: 1 }),
          newPassword: Type.String({ minLength: 12, maxLength: 128 }),
          revokeOtherSessions: Type.Optional(Type.Boolean()),
        }),
      },
    },
    async (request, reply) => {
      const session = await requireUserSession(auth, request, reply);
      if (!session) return;

      const body = request.body as {
        currentPassword: string;
        newPassword: string;
        revokeOtherSessions?: boolean;
      };

      // Verify current password
      const storedHash = await findUserCredentialHash(database.db, session.user.id);
      if (!storedHash) {
        return reply.code(400).send({
          error: {
            code: 'NO_PASSWORD_SET',
            message: 'Account does not have a credential password configured.',
          },
        });
      }

      const passwordValid = await verifyPassword({
        hash: storedHash,
        password: body.currentPassword,
      });

      if (!passwordValid) {
        return reply.code(401).send({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Current password verification failed.',
          },
        });
      }

      if (body.currentPassword === body.newPassword) {
        return reply.code(422).send({
          error: {
            code: 'PASSWORD_UNCHANGED',
            message: 'New password must be different from your current password.',
          },
        });
      }

      try {
        const newHash = await hashPassword(body.newPassword);
        const selectedOrg =
          typeof request.headers['x-organization-id'] === 'string'
            ? request.headers['x-organization-id']
            : undefined;
        await updateUserPasswordHash(database.db, {
          userId: session.user.id,
          newPasswordHash: newHash,
          ...(selectedOrg ? { organizationId: selectedOrg } : {}),
        });

        // Revoke other active sessions by default
        let revokedCount = 0;
        if (body.revokeOtherSessions !== false && session.session?.id) {
          revokedCount = await revokeOtherAuthSessions(
            storageOpts,
            session.user.id,
            session.session.id,
          );
        }

        return {
          data: {
            success: true,
            revokedOtherSessionsCount: revokedCount,
          },
        };
      } catch (error) {
        return handleAccountError(reply, error);
      }
    },
  );

  // 12. List active login sessions
  app.get('/admin/account/sessions', async (request, reply) => {
    const session = await requireUserSession(auth, request, reply);
    if (!session) return;

    try {
      const rawSessions = await listAuthSessionsForUser(storageOpts, session.user.id);
      const currentSessionId = session.session?.id;

      const sessions = rawSessions.map((s) => {
        const parsedUa = parseUserAgent(s.userAgent);
        return {
          id: s.id ?? 'session',
          isCurrent: s.id === currentSessionId,
          createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : new Date().toISOString(),
          expiresAt: s.expiresAt ? new Date(s.expiresAt).toISOString() : new Date().toISOString(),
          ipAddress: s.ipAddress ?? null,
          userAgent: s.userAgent ?? null,
          deviceLabel: parsedUa.label,
          deviceCategory: parsedUa.device,
        };
      });

      // Sort: current session first, then by createdAt descending
      sessions.sort((a, b) => {
        if (a.isCurrent) return -1;
        if (b.isCurrent) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return { data: sessions };
    } catch (error) {
      return handleAccountError(reply, error);
    }
  });

  // 13. Revoke a single active session (cannot be current session)
  app.post(
    '/admin/account/sessions/:sessionId/revoke',
    {
      schema: {
        params: Type.Object({
          sessionId: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const session = await requireUserSession(auth, request, reply);
      if (!session) return;

      const { sessionId } = request.params as { sessionId: string };
      if (sessionId === session.session?.id) {
        return reply.code(400).send({
          error: {
            code: 'CANNOT_REVOKE_CURRENT_SESSION',
            message: 'You cannot revoke your active session with this action. Use sign out instead.',
          },
        });
      }

      const revoked = await revokeAuthSessionById(storageOpts, session.user.id, sessionId);
      if (!revoked) {
        return reply.code(404).send({
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'The session was not found or has already expired.',
          },
        });
      }

      return { data: { revoked: true } };
    },
  );

  // 14. Revoke all other active sessions except current
  app.post('/admin/account/sessions/revoke-others', async (request, reply) => {
    const session = await requireUserSession(auth, request, reply);
    if (!session) return;

    if (!session.session?.id) {
      return reply.code(400).send({
        error: {
          code: 'NO_CURRENT_SESSION',
          message: 'Unable to identify current session.',
        },
      });
    }

    const count = await revokeOtherAuthSessions(storageOpts, session.user.id, session.session.id);
    return { data: { revokedCount: count } };
  });

  // 15. Sign out everywhere (revokes all sessions including current)
  app.post('/admin/account/sessions/revoke-all', async (request, reply) => {
    const session = await requireUserSession(auth, request, reply);
    if (!session) return;

    const count = await revokeAuthSessionsForUser(storageOpts, session.user.id);
    reply.header(
      'set-cookie',
      'better-auth.session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
    );
    return { data: { revokedCount: count } };
  });

  // 16. Security activity timeline
  app.get('/admin/account/activity', async (request, reply) => {
    const session = await requireUserSession(auth, request, reply);
    if (!session) return;

    try {
      const selectedOrg =
        typeof request.headers['x-organization-id'] === 'string'
          ? request.headers['x-organization-id']
          : undefined;
      const activities = await listUserSecurityActivity(
        database.db,
        session.user.id,
        selectedOrg,
        25,
      );

      return { data: activities };
    } catch (error) {
      return handleAccountError(reply, error);
    }
  });
}
