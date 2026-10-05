import { sql } from 'kysely';

import {
  generateOpaqueToken,
  hashToken,
} from '@maevelle/security';

import {
  appendIamAudit,
  appendIamOutbox,
  enqueueMemberSecurityNotification,
  type IamAccountActor,
  type IamActor,
  type IamDatabase,
  IamError,
} from './iam-common.js';
import { resolveTwoFactorAccessState } from './iam-two-factor.js';

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function resolveActor(
  userId: string,
  membershipId?: string | null,
  organizationId?: string | null,
): IamAccountActor {
  return {
    userId,
    membershipId: membershipId ?? null,
    organizationId: organizationId ?? null,
  };
}

async function resolveActorContext(
  db: IamDatabase,
  userId: string,
  preferredOrgId?: string | null,
): Promise<IamAccountActor> {
  if (preferredOrgId) {
    const mem = await sql<{ id: string; organization_id: string }>`
      select id::text, organization_id::text
      from iam.organization_memberships
      where user_id = ${userId}::uuid
        and organization_id = ${preferredOrgId}::uuid
        and status = 'ACTIVE'
      limit 1
    `.execute(db);
    if (mem.rows[0]) {
      return {
        userId,
        organizationId: mem.rows[0].organization_id,
        membershipId: mem.rows[0].id,
      };
    }
  }

  const anyMem = await sql<{ id: string; organization_id: string }>`
    select id::text, organization_id::text
    from iam.organization_memberships
    where user_id = ${userId}::uuid
      and status = 'ACTIVE'
    order by created_at asc
    limit 1
  `.execute(db);

  return {
    userId,
    organizationId: anyMem.rows[0]?.organization_id ?? preferredOrgId ?? null,
    membershipId: anyMem.rows[0]?.id ?? null,
  };
}

export interface UserAccountProfileResult {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly image: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserAccountMembershipResult {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly membershipId: string;
  readonly membershipType: 'OWNER' | 'STANDARD';
  readonly status: 'INVITED' | 'ACTIVE' | 'DISABLED' | 'EXPIRED_INVITE' | 'REMOVED';
  readonly joinedAt: string;
  readonly displayName?: string | null;
}

export interface UserAccountSecurityResult {
  readonly hasPassword: boolean;
  readonly twoFactorEnabled: boolean;
  readonly twoFactorRequired: boolean;
  readonly enrollmentRequired: boolean;
  readonly accessRestricted: boolean;
  readonly enrollmentDeadline: string | null;
  readonly activeSessionsCount: number;
}

export interface UserAccountPendingEmailChangeResult {
  readonly pendingEmail: string;
  readonly requestedAt: string;
  readonly expiresAt: string;
}

export interface UserAccountOverviewResult {
  readonly profile: UserAccountProfileResult;
  readonly membership: UserAccountMembershipResult | null;
  readonly security: UserAccountSecurityResult;
  readonly pendingEmailChange?: UserAccountPendingEmailChangeResult | null;
}

export interface UserSecurityActivityResult {
  readonly id: string;
  readonly action: string;
  readonly title: string;
  readonly description: string;
  readonly occurredAt: string;
  readonly ipAddress?: string | null;
}

export async function findUserAccountOverview(
  db: IamDatabase,
  userId: string,
  organizationId?: string,
): Promise<UserAccountOverviewResult> {
  const userResult = await sql<{
    id: string;
    name: string;
    email: string;
    email_verified: boolean;
    image: string | null;
    created_at: string;
    updated_at: string;
    two_factor_enabled: boolean;
  }>`
    select id::text, name, email, email_verified, image,
      created_at::text, updated_at::text, two_factor_enabled
    from iam.users
    where id = ${userId}::uuid
  `.execute(db);

  const user = userResult.rows[0];
  if (!user) throw new IamError('NOT_FOUND', 'User account was not found.');

  const accountResult = await sql<{ has_password: boolean }>`
    select exists (
      select 1 from iam.auth_accounts
      where user_id = ${userId}::uuid
        and provider_id = 'credential'
        and password is not null
    ) as has_password
  `.execute(db);
  const hasPassword = Boolean(accountResult.rows[0]?.has_password);

  const membershipResult = await sql<{
    id: string;
    organization_id: string;
    organization_name: string;
    membership_type: 'OWNER' | 'STANDARD';
    status: 'INVITED' | 'ACTIVE' | 'DISABLED' | 'EXPIRED_INVITE' | 'REMOVED';
    display_name: string | null;
    created_at: string;
  }>`
    select membership.id::text, membership.organization_id::text,
      org.display_name as organization_name,
      membership.membership_type, membership.status,
      membership.display_name, membership.created_at::text
    from iam.organization_memberships membership
    join platform.organizations org on org.id = membership.organization_id
    where membership.user_id = ${userId}::uuid
      and (${organizationId ?? null}::uuid is null or membership.organization_id = ${organizationId ?? null}::uuid)
      and membership.status != 'REMOVED'
    order by (membership.status = 'ACTIVE') desc, membership.created_at asc
    limit 1
  `.execute(db);

  const membershipRow = membershipResult.rows[0];
  const membership: UserAccountMembershipResult | null = membershipRow
    ? {
        organizationId: membershipRow.organization_id,
        organizationName: membershipRow.organization_name,
        membershipId: membershipRow.id,
        membershipType: membershipRow.membership_type,
        status: membershipRow.status,
        joinedAt: membershipRow.created_at,
        displayName: membershipRow.display_name,
      }
    : null;

  const twoFactorState = await resolveTwoFactorAccessState(
    db,
    userId,
    membershipRow?.organization_id,
  );

  const sessionsCountResult = await sql<{ count: string }>`
    select count(*)::text as count
    from iam.sessions
    where user_id = ${userId}::uuid
      and revoked_at is null
      and expires_at > now()
  `.execute(db);
  const activeSessionsCount = Math.max(1, Number(sessionsCountResult.rows[0]?.count ?? 1));

  const pendingVerificationResult = await sql<{
    value: string;
    expires_at: string;
    created_at: string;
  }>`
    select value, expires_at::text, created_at::text
    from iam.auth_verifications
    where identifier = ${`email-change:${userId}`}
      and expires_at > now()
    order by created_at desc
    limit 1
  `.execute(db);

  let pendingEmailChange: UserAccountOverviewResult['pendingEmailChange'] = null;
  const pendingRow = pendingVerificationResult.rows[0];
  if (pendingRow) {
    try {
      const parsed = JSON.parse(pendingRow.value) as { newEmail?: string };
      if (parsed.newEmail) {
        pendingEmailChange = {
          pendingEmail: parsed.newEmail,
          requestedAt: pendingRow.created_at,
          expiresAt: pendingRow.expires_at,
        };
      }
    } catch {
      // Ignore corrupted or unparseable pending record
    }
  }

  const profile: UserAccountProfileResult = {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.email_verified,
    image: user.image,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };

  const security: UserAccountSecurityResult = {
    hasPassword,
    twoFactorEnabled: twoFactorState?.isEnabled ?? user.two_factor_enabled,
    twoFactorRequired: twoFactorState?.isRequired ?? false,
    enrollmentRequired: twoFactorState?.enrollmentRequired ?? false,
    accessRestricted: twoFactorState?.accessRestricted ?? false,
    enrollmentDeadline: twoFactorState?.policy.enrollmentDeadline ?? null,
    activeSessionsCount,
  };

  return {
    profile,
    membership,
    security,
    ...(pendingEmailChange ? { pendingEmailChange } : {}),
  };
}

export async function findUserCredentialHash(
  db: IamDatabase,
  userId: string,
): Promise<string | null> {
  const result = await sql<{ password: string | null }>`
    select password
    from iam.auth_accounts
    where user_id = ${userId}::uuid
      and provider_id = 'credential'
    limit 1
  `.execute(db);

  return result.rows[0]?.password ?? null;
}

export async function updateUserAccountProfile(
  db: IamDatabase,
  input: {
    readonly userId: string;
    readonly organizationId?: string;
    readonly name: string;
  },
): Promise<UserAccountProfileResult> {
  const normalizedName = input.name.trim().replace(/\s+/g, ' ');
  if (!normalizedName || normalizedName.length > 160) {
    throw new IamError('VALIDATION_FAILED', 'Name must be between 1 and 160 characters.');
  }

  return db.transaction().execute(async (tx) => {
    const existingResult = await sql<{
      id: string;
      name: string;
      email: string;
      email_verified: boolean;
      image: string | null;
      created_at: string;
      version: string;
    }>`
      select id::text, name, email, email_verified, image, created_at::text, version::text
      from iam.users
      where id = ${input.userId}::uuid
      for update
    `.execute(tx);

    const existing = existingResult.rows[0];
    if (!existing) throw new IamError('NOT_FOUND', 'User was not found.');

    const updatedResult = await sql<{
      id: string;
      name: string;
      email: string;
      email_verified: boolean;
      image: string | null;
      created_at: string;
      updated_at: string;
      version: string;
    }>`
      update iam.users
      set name = ${normalizedName},
          updated_at = now(),
          version = version + 1
      where id = ${input.userId}::uuid
      returning id::text, name, email, email_verified, image,
        created_at::text, updated_at::text, version::text
    `.execute(tx);

    const updated = updatedResult.rows[0]!;
    const actor = await resolveActorContext(tx, input.userId, input.organizationId);

    await appendIamAudit(tx, {
      actor,
      action: 'iam.account.name_updated',
      targetType: 'iam.user',
      targetId: input.userId,
      before: { name: existing.name },
      after: { name: updated.name },
    });

    await appendIamOutbox(tx, {
      organizationId: actor.organizationId,
      eventType: 'iam.account.name_updated',
      aggregateType: 'iam.user',
      aggregateId: input.userId,
      aggregateVersion: Number(updated.version),
      payload: { userId: input.userId, oldName: existing.name, newName: updated.name },
    });

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      emailVerified: updated.email_verified,
      image: updated.image,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  });
}

export async function updateUserAccountAvatar(
  db: IamDatabase,
  input: {
    readonly userId: string;
    readonly organizationId?: string;
    readonly imageUrl: string;
  },
): Promise<{ profile: UserAccountProfileResult; previousImage: string | null }> {
  return db.transaction().execute(async (tx) => {
    const existingResult = await sql<{
      id: string;
      name: string;
      email: string;
      email_verified: boolean;
      image: string | null;
      created_at: string;
      version: string;
    }>`
      select id::text, name, email, email_verified, image, created_at::text, version::text
      from iam.users
      where id = ${input.userId}::uuid
      for update
    `.execute(tx);

    const existing = existingResult.rows[0];
    if (!existing) throw new IamError('NOT_FOUND', 'User was not found.');

    const updatedResult = await sql<{
      id: string;
      name: string;
      email: string;
      email_verified: boolean;
      image: string | null;
      created_at: string;
      updated_at: string;
      version: string;
    }>`
      update iam.users
      set image = ${input.imageUrl},
          updated_at = now(),
          version = version + 1
      where id = ${input.userId}::uuid
      returning id::text, name, email, email_verified, image,
        created_at::text, updated_at::text, version::text
    `.execute(tx);

    const updated = updatedResult.rows[0]!;
    const actor = await resolveActorContext(tx, input.userId, input.organizationId);

    await appendIamAudit(tx, {
      actor,
      action: 'iam.account.avatar_updated',
      targetType: 'iam.user',
      targetId: input.userId,
      metadata: { previousImagePresent: Boolean(existing.image) },
    });

    await appendIamOutbox(tx, {
      organizationId: actor.organizationId,
      eventType: 'iam.account.avatar_updated',
      aggregateType: 'iam.user',
      aggregateId: input.userId,
      aggregateVersion: Number(updated.version),
      payload: { userId: input.userId },
    });

    return {
      profile: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        emailVerified: updated.email_verified,
        image: updated.image,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
      previousImage: existing.image,
    };
  });
}

export async function removeUserAccountAvatar(
  db: IamDatabase,
  input: {
    readonly userId: string;
    readonly organizationId?: string;
  },
): Promise<{ profile: UserAccountProfileResult; removedImage: string | null }> {
  return db.transaction().execute(async (tx) => {
    const existingResult = await sql<{
      id: string;
      name: string;
      email: string;
      email_verified: boolean;
      image: string | null;
      created_at: string;
      version: string;
    }>`
      select id::text, name, email, email_verified, image, created_at::text, version::text
      from iam.users
      where id = ${input.userId}::uuid
      for update
    `.execute(tx);

    const existing = existingResult.rows[0];
    if (!existing) throw new IamError('NOT_FOUND', 'User was not found.');

    const updatedResult = await sql<{
      id: string;
      name: string;
      email: string;
      email_verified: boolean;
      image: string | null;
      created_at: string;
      updated_at: string;
      version: string;
    }>`
      update iam.users
      set image = null,
          updated_at = now(),
          version = version + 1
      where id = ${input.userId}::uuid
      returning id::text, name, email, email_verified, image,
        created_at::text, updated_at::text, version::text
    `.execute(tx);

    const updated = updatedResult.rows[0]!;
    const actor = await resolveActorContext(tx, input.userId, input.organizationId);

    await appendIamAudit(tx, {
      actor,
      action: 'iam.account.avatar_removed',
      targetType: 'iam.user',
      targetId: input.userId,
    });

    await appendIamOutbox(tx, {
      organizationId: actor.organizationId,
      eventType: 'iam.account.avatar_removed',
      aggregateType: 'iam.user',
      aggregateId: input.userId,
      aggregateVersion: Number(updated.version),
      payload: { userId: input.userId },
    });

    return {
      profile: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        emailVerified: updated.email_verified,
        image: updated.image,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
      removedImage: existing.image,
    };
  });
}

export async function requestUserEmailVerification(
  db: IamDatabase,
  input: {
    readonly userId: string;
    readonly organizationId?: string;
  },
): Promise<{ token: string; expiresAt: string }> {
  const userResult = await sql<{
    id: string;
    email: string;
    email_verified: boolean;
  }>`
    select id::text, email, email_verified
    from iam.users
    where id = ${input.userId}::uuid
  `.execute(db);

  const user = userResult.rows[0];
  if (!user) throw new IamError('NOT_FOUND', 'User was not found.');
  if (user.email_verified) {
    throw new IamError('CONFLICT', 'Email address is already verified.');
  }

  const cooldownResult = await sql<{ id: string }>`
    select id::text from iam.auth_verifications
    where identifier = ${`email-verification:${input.userId}`}
      and created_at > (now() - interval '60 seconds')
    limit 1
  `.execute(db);
  if (cooldownResult.rows[0]) {
    throw new IamError(
      'CONFLICT',
      'Please wait at least 60 seconds before requesting another verification email.',
    );
  }

  const token = generateOpaqueToken();
  const identifier = `email-verification:${input.userId}`;

  return db.transaction().execute(async (tx) => {
    await sql`delete from iam.auth_verifications where identifier = ${identifier}`.execute(tx);

    const inserted = await sql<{ expires_at: string }>`
      insert into iam.auth_verifications (identifier, value, expires_at)
      values (${identifier}, ${token}, now() + interval '24 hours')
      returning expires_at::text
    `.execute(tx);

    const expiresAt = inserted.rows[0]!.expires_at;
    const actor = await resolveActorContext(tx, input.userId, input.organizationId);

    await appendIamAudit(tx, {
      actor,
      action: 'iam.account.email_verification_sent',
      targetType: 'iam.user',
      targetId: input.userId,
      metadata: { email: user.email },
    });

    await appendIamOutbox(tx, {
      organizationId: actor.organizationId,
      eventType: 'iam.account.email_verification_requested',
      aggregateType: 'iam.user',
      aggregateId: input.userId,
      aggregateVersion: Date.now(),
      payload: { userId: input.userId, email: user.email, expiresAt },
    });

    return { token, expiresAt };
  });
}

export async function confirmUserEmailVerification(
  db: IamDatabase,
  input: {
    readonly userId: string;
    readonly token: string;
    readonly organizationId?: string;
  },
): Promise<{ verified: true }> {
  const token = input.token.trim();
  if (!token) throw new IamError('VALIDATION_FAILED', 'Verification token is required.');

  const identifier = `email-verification:${input.userId}`;
  const verificationResult = await sql<{ id: string; value: string }>`
    select id::text, value
    from iam.auth_verifications
    where identifier = ${identifier}
      and expires_at > now()
    order by created_at desc
    limit 1
  `.execute(db);

  const verification = verificationResult.rows[0];
  if (!verification || verification.value !== token) {
    throw new IamError('VALIDATION_FAILED', 'Invalid or expired verification token.');
  }

  return db.transaction().execute(async (tx) => {
    const updated = await sql<{ version: string }>`
      update iam.users
      set email_verified = true,
          updated_at = now(),
          version = version + 1
      where id = ${input.userId}::uuid
      returning version::text
    `.execute(tx);

    await sql`delete from iam.auth_verifications where id = ${verification.id}::uuid`.execute(tx);

    const actor = await resolveActorContext(tx, input.userId, input.organizationId);

    await appendIamAudit(tx, {
      actor,
      action: 'iam.account.email_verified',
      targetType: 'iam.user',
      targetId: input.userId,
    });

    await appendIamOutbox(tx, {
      organizationId: actor.organizationId,
      eventType: 'iam.account.email_verified',
      aggregateType: 'iam.user',
      aggregateId: input.userId,
      aggregateVersion: Number(updated.rows[0]?.version ?? Date.now()),
      payload: { userId: input.userId },
    });

    return { verified: true };
  });
}

export async function requestUserEmailChange(
  db: IamDatabase,
  input: {
    readonly userId: string;
    readonly organizationId?: string;
    readonly newEmail: string;
  },
): Promise<{ token: string; pendingEmail: string; expiresAt: string }> {
  const newEmail = normalizedEmail(input.newEmail);
  if (!newEmail || !newEmail.includes('@') || newEmail.length > 320) {
    throw new IamError('VALIDATION_FAILED', 'A valid email address is required.');
  }

  const userResult = await sql<{
    id: string;
    email: string;
    email_normalized: string;
  }>`
    select id::text, email, email_normalized
    from iam.users
    where id = ${input.userId}::uuid
  `.execute(db);

  const user = userResult.rows[0];
  if (!user) throw new IamError('NOT_FOUND', 'User was not found.');
  if (user.email_normalized === newEmail) {
    throw new IamError('VALIDATION_FAILED', 'The new email must be different from your current email.');
  }

  const collisionResult = await sql<{ id: string }>`
    select id::text from iam.users
    where email_normalized = ${newEmail}
      and id != ${input.userId}::uuid
    limit 1
  `.execute(db);
  if (collisionResult.rows[0]) {
    throw new IamError('CONFLICT', 'This email address is not available.');
  }

  const token = generateOpaqueToken();
  const identifier = `email-change:${input.userId}`;
  const payloadJson = JSON.stringify({
    token,
    newEmail,
    currentEmail: user.email,
  });

  return db.transaction().execute(async (tx) => {
    await sql`delete from iam.auth_verifications where identifier = ${identifier}`.execute(tx);

    const inserted = await sql<{ expires_at: string }>`
      insert into iam.auth_verifications (identifier, value, expires_at)
      values (${identifier}, ${payloadJson}, now() + interval '1 hour')
      returning expires_at::text
    `.execute(tx);

    const expiresAt = inserted.rows[0]!.expires_at;
    const actor = await resolveActorContext(tx, input.userId, input.organizationId);

    await appendIamAudit(tx, {
      actor,
      action: 'iam.account.email_change_requested',
      targetType: 'iam.user',
      targetId: input.userId,
      metadata: { targetEmail: newEmail },
    });

    await appendIamOutbox(tx, {
      organizationId: actor.organizationId,
      eventType: 'iam.account.email_change_requested',
      aggregateType: 'iam.user',
      aggregateId: input.userId,
      aggregateVersion: Date.now(),
      payload: { userId: input.userId, currentEmail: user.email, newEmail, expiresAt },
    });

    const memberships = await sql<{ id: string; organization_id: string }>`
      select id::text, organization_id::text
      from iam.organization_memberships
      where user_id = ${input.userId}::uuid and status = 'ACTIVE'
    `.execute(tx);
    for (const membership of memberships.rows) {
      await enqueueMemberSecurityNotification(tx, {
        organizationId: membership.organization_id,
        membershipId: membership.id,
        notificationType: 'IAM_EMAIL_CHANGE_REQUESTED',
        subject: 'Security Alert: Email change requested',
        body: `A request was made to change your Maevelle account email to ${newEmail}. If you did not initiate this change, sign in immediately and update your password.`,
        sourceId: membership.id,
      });
    }

    return { token, pendingEmail: newEmail, expiresAt };
  });
}

export async function confirmUserEmailChange(
  db: IamDatabase,
  input: {
    readonly userId: string;
    readonly token: string;
    readonly organizationId?: string;
  },
): Promise<{ oldEmail: string; newEmail: string; changed: true }> {
  const token = input.token.trim();
  if (!token) throw new IamError('VALIDATION_FAILED', 'Confirmation token is required.');

  const identifier = `email-change:${input.userId}`;
  const verificationResult = await sql<{ id: string; value: string }>`
    select id::text, value
    from iam.auth_verifications
    where identifier = ${identifier}
      and expires_at > now()
    order by created_at desc
    limit 1
  `.execute(db);

  const verification = verificationResult.rows[0];
  if (!verification) {
    throw new IamError('VALIDATION_FAILED', 'No active email change request was found or the request has expired.');
  }

  let parsed: { token?: string; newEmail?: string; currentEmail?: string } = {};
  try {
    parsed = JSON.parse(verification.value) as typeof parsed;
  } catch {
    throw new IamError('VALIDATION_FAILED', 'Corrupt email change record.');
  }

  if (!parsed.token || !parsed.newEmail || parsed.token !== token) {
    throw new IamError('VALIDATION_FAILED', 'Invalid or expired confirmation token.');
  }

  const targetEmail = parsed.newEmail;

  return db.transaction().execute(async (tx) => {
    const collision = await sql<{ id: string }>`
      select id::text from iam.users
      where email_normalized = ${targetEmail}
        and id != ${input.userId}::uuid
      limit 1
    `.execute(tx);
    if (collision.rows[0]) {
      throw new IamError('CONFLICT', 'This email address is no longer available.');
    }

    const previousUser = (
      await sql<{ email: string; version: string }>`
        select email, version::text from iam.users
        where id = ${input.userId}::uuid
        for update
      `.execute(tx)
    ).rows[0];
    if (!previousUser) throw new IamError('NOT_FOUND', 'User was not found.');

    const updated = await sql<{ version: string }>`
      update iam.users
      set email = ${targetEmail},
          email_normalized = ${targetEmail},
          email_verified = true,
          updated_at = now(),
          version = version + 1
      where id = ${input.userId}::uuid
      returning version::text
    `.execute(tx);

    await sql`
      update iam.auth_accounts
      set account_id = ${targetEmail},
          updated_at = now()
      where user_id = ${input.userId}::uuid
        and provider_id = 'credential'
        and account_id = ${previousUser.email}
    `.execute(tx);

    await sql`delete from iam.auth_verifications where id = ${verification.id}::uuid`.execute(tx);

    const actor = await resolveActorContext(tx, input.userId, input.organizationId);

    await appendIamAudit(tx, {
      actor,
      action: 'iam.account.email_changed',
      targetType: 'iam.user',
      targetId: input.userId,
      before: { email: previousUser.email },
      after: { email: targetEmail },
    });

    await appendIamOutbox(tx, {
      organizationId: actor.organizationId,
      eventType: 'iam.account.email_changed',
      aggregateType: 'iam.user',
      aggregateId: input.userId,
      aggregateVersion: Number(updated.rows[0]?.version ?? Date.now()),
      payload: {
        userId: input.userId,
        oldEmail: previousUser.email,
        newEmail: targetEmail,
      },
    });

    const memberships = await sql<{ id: string; organization_id: string }>`
      select id::text, organization_id::text
      from iam.organization_memberships
      where user_id = ${input.userId}::uuid and status = 'ACTIVE'
    `.execute(tx);
    for (const membership of memberships.rows) {
      await enqueueMemberSecurityNotification(tx, {
        organizationId: membership.organization_id,
        membershipId: membership.id,
        notificationType: 'IAM_EMAIL_CHANGED',
        subject: 'Your Maevelle account email was updated',
        body: `Your Maevelle account login email has been updated from ${previousUser.email} to ${targetEmail}.`,
        sourceId: membership.id,
      });
    }

    return { oldEmail: previousUser.email, newEmail: targetEmail, changed: true };
  });
}

export async function cancelUserEmailChange(
  db: IamDatabase,
  input: {
    readonly userId: string;
    readonly organizationId?: string;
  },
): Promise<{ cancelled: true }> {
  const identifier = `email-change:${input.userId}`;
  return db.transaction().execute(async (tx) => {
    const deleted = await sql<{ id: string }>`
      delete from iam.auth_verifications
      where identifier = ${identifier}
      returning id::text
    `.execute(tx);

    if (!deleted.rows[0]) {
      throw new IamError('NOT_FOUND', 'No active email change request was found to cancel.');
    }

    const actor = await resolveActorContext(tx, input.userId, input.organizationId);

    await appendIamAudit(tx, {
      actor,
      action: 'iam.account.email_change_cancelled',
      targetType: 'iam.user',
      targetId: input.userId,
    });

    return { cancelled: true };
  });
}

export async function updateUserPasswordHash(
  db: IamDatabase,
  input: {
    readonly userId: string;
    readonly organizationId?: string;
    readonly newPasswordHash: string;
  },
): Promise<{ changed: true }> {
  const accountResult = await sql<{ id: string }>`
    select id::text
    from iam.auth_accounts
    where user_id = ${input.userId}::uuid
      and provider_id = 'credential'
    limit 1
  `.execute(db);

  const account = accountResult.rows[0];
  if (!account) {
    throw new IamError('VALIDATION_FAILED', 'Account does not have a credential password.');
  }

  return db.transaction().execute(async (tx) => {
    await sql`
      update iam.auth_accounts
      set password = ${input.newPasswordHash},
          updated_at = now()
      where id = ${account.id}::uuid
    `.execute(tx);

    const userUpdate = await sql<{ version: string }>`
      update iam.users
      set password_hash = ${input.newPasswordHash},
          updated_at = now(),
          version = version + 1
      where id = ${input.userId}::uuid
      returning version::text
    `.execute(tx);

    const actor = await resolveActorContext(tx, input.userId, input.organizationId);

    await appendIamAudit(tx, {
      actor,
      action: 'iam.account.password_changed',
      targetType: 'iam.user',
      targetId: input.userId,
    });

    await appendIamOutbox(tx, {
      organizationId: actor.organizationId,
      eventType: 'iam.account.password_changed',
      aggregateType: 'iam.user',
      aggregateId: input.userId,
      aggregateVersion: Number(userUpdate.rows[0]?.version ?? Date.now()),
      payload: { userId: input.userId },
    });

    const memberships = await sql<{ id: string; organization_id: string }>`
      select id::text, organization_id::text
      from iam.organization_memberships
      where user_id = ${input.userId}::uuid and status = 'ACTIVE'
    `.execute(tx);
    for (const membership of memberships.rows) {
      await enqueueMemberSecurityNotification(tx, {
        organizationId: membership.organization_id,
        membershipId: membership.id,
        notificationType: 'IAM_PASSWORD_CHANGED',
        subject: 'Security Alert: Password updated',
        body: 'Your Maevelle account password was successfully updated. Other active login sessions have been signed out for security.',
        sourceId: membership.id,
      });
    }

    return { changed: true };
  });
}

const safeEventTitles: Record<string, { title: string; description: string }> = {
  'iam.account.name_updated': {
    title: 'Personal name updated',
    description: 'You updated your personal display name.',
  },
  'iam.account.avatar_updated': {
    title: 'Profile photo updated',
    description: 'You uploaded a new profile picture.',
  },
  'iam.account.avatar_removed': {
    title: 'Profile photo removed',
    description: 'You removed your profile picture.',
  },
  'iam.account.password_changed': {
    title: 'Password changed',
    description: 'Your account password was updated.',
  },
  'iam.account.email_verification_sent': {
    title: 'Verification email requested',
    description: 'A verification link was dispatched to your email address.',
  },
  'iam.account.email_verified': {
    title: 'Email verified',
    description: 'Your email address was successfully verified.',
  },
  'iam.account.email_change_requested': {
    title: 'Email change requested',
    description: 'A request to update your account email was initiated.',
  },
  'iam.account.email_changed': {
    title: 'Email address updated',
    description: 'Your canonical account email was updated successfully.',
  },
  'iam.account.email_change_cancelled': {
    title: 'Email change cancelled',
    description: 'The pending request to change your account email was cancelled.',
  },
  'iam.account.session_revoked': {
    title: 'Session signed out',
    description: 'An individual device session was revoked.',
  },
  'iam.account.other_sessions_revoked': {
    title: 'Other sessions signed out',
    description: 'All other active sessions on other devices were revoked.',
  },
  'iam.account.all_sessions_revoked': {
    title: 'All sessions signed out',
    description: 'Signed out of all active devices.',
  },
  'iam.two_factor.enabled': {
    title: 'Authenticator 2FA enabled',
    description: 'Two-factor authenticator app protection was activated.',
  },
  'iam.two_factor.disabled': {
    title: 'Authenticator 2FA disabled',
    description: 'Two-factor authenticator app protection was deactivated.',
  },
  'iam.two_factor.backup_codes_regenerated': {
    title: 'Recovery codes regenerated',
    description: 'New emergency recovery codes were generated.',
  },
  'iam.two_factor.recovery_code_used': {
    title: 'Recovery code used',
    description: 'A backup recovery code was used to sign into your account.',
  },
  'iam.two_factor.admin_reset': {
    title: 'Authenticator reset by administrator',
    description: 'An authorized administrator reset your two-factor enrollment.',
  },
};

export async function listUserSecurityActivity(
  db: IamDatabase,
  userId: string,
  _organizationId?: string,
  limit = 25,
): Promise<UserSecurityActivityResult[]> {
  const safeActions = Object.keys(safeEventTitles);
  const rows = await sql<{
    id: string;
    action: string;
    created_at: string;
    metadata: unknown;
  }>`
    select id::text, action, created_at::text, metadata
    from audit.audit_events
    where (actor_id = ${userId}::uuid or target_id = ${userId}::uuid)
      and action in (${sql.join(safeActions.map((a) => sql`${a}`))})
    order by created_at desc
    limit ${limit}
  `.execute(db);

  return rows.rows.map((row) => {
    const meta = row.metadata as { ipAddress?: string } | null | undefined;
    const info = safeEventTitles[row.action] ?? {
      title: 'Security activity',
      description: 'Account security event recorded.',
    };
    return {
      id: row.id,
      action: row.action,
      title: info.title,
      description: info.description,
      occurredAt: row.created_at,
      ...(meta?.ipAddress ? { ipAddress: meta.ipAddress } : {}),
    };
  });
}

/** Looks up a verification value by its unique identifier (e.g. for testing token verification). */
export async function findUserAuthVerificationValue(
  db: IamDatabase,
  identifier: string,
): Promise<string | null> {
  const result = await sql<{ value: string }>`
    select value from iam.auth_verifications
    where identifier = ${identifier}
    order by created_at desc
    limit 1
  `.execute(db);
  return result.rows[0]?.value ?? null;
}

