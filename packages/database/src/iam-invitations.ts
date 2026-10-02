import { sql } from 'kysely';

import {
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  hashToken,
  type EncryptionKey,
} from '@maevelle/security';

import {
  appendIamAudit,
  appendIamOutbox,
  type AccessScope,
  type IamActor,
  type IamDatabase,
  IamError,
  loadActorAccess,
  replaceCapabilityRows,
  replaceScopeRows,
  validateCapabilityAssignment,
} from './iam-common.js';

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function invitationFingerprint(input: {
  readonly email: string;
  readonly displayName: string;
  readonly capabilityCodes: readonly string[];
  readonly scopes: readonly AccessScope[];
}): string {
  return hashToken(
    JSON.stringify({
      email: normalizedEmail(input.email),
      displayName: input.displayName.trim(),
      capabilityCodes: [...input.capabilityCodes].sort(),
      scopes: [...input.scopes].sort((left, right) =>
        `${left.capabilityCode}:${left.scopeType}:${left.scopeId}`.localeCompare(
          `${right.capabilityCode}:${right.scopeType}:${right.scopeId}`,
        ),
      ),
    }),
  );
}

export async function createMembershipInvitation(
  db: IamDatabase,
  input: {
    readonly actor: IamActor;
    readonly email: string;
    readonly displayName: string;
    readonly capabilityCodes: readonly string[];
    readonly scopes: readonly AccessScope[];
    readonly expiresInHours?: number;
    readonly idempotencyKey?: string;
    readonly encryptionKey: EncryptionKey;
  },
) {
  const email = normalizedEmail(input.email);
  const displayName = input.displayName.trim();
  if (!email || !email.includes('@') || email.length > 320)
    throw new IamError('VALIDATION_FAILED', 'A valid invitation email is required.');
  if (!displayName || displayName.length > 160)
    throw new IamError(
      'VALIDATION_FAILED',
      'A display name between 1 and 160 characters is required.',
    );
  const expiresInHours = input.expiresInHours ?? 72;
  if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 168)
    throw new IamError('VALIDATION_FAILED', 'Invitation expiry must be between 1 and 168 hours.');
  if (input.idempotencyKey && input.idempotencyKey.length > 200)
    throw new IamError('VALIDATION_FAILED', 'The idempotency key is too long.');

  const token = generateOpaqueToken();
  const fingerprint = invitationFingerprint({
    email,
    displayName,
    capabilityCodes: input.capabilityCodes,
    scopes: input.scopes,
  });
  try {
    return await db.transaction().execute(async (tx) => {
      const access = await loadActorAccess(tx, input.actor, 'admin.team.invite');
      await validateCapabilityAssignment(
        tx,
        access,
        input.capabilityCodes,
        input.scopes,
        input.actor.organizationId,
      );

      if (input.idempotencyKey) {
        const repeated = await sql<{
          id: string;
          request_fingerprint: string;
          version: string;
          expires_at: string;
        }>`
        select id::text, request_fingerprint, version::text, expires_at::text
        from iam.membership_invitations
        where organization_id = ${input.actor.organizationId}::uuid
          and invited_by_membership_id = ${input.actor.membershipId}::uuid
          and idempotency_key = ${input.idempotencyKey}
      `.execute(tx);
        if (repeated.rows[0]) {
          if (repeated.rows[0].request_fingerprint !== fingerprint)
            throw new IamError(
              'CONFLICT',
              'The idempotency key was already used for a different invitation.',
            );
          return {
            invitationId: repeated.rows[0].id,
            version: Number(repeated.rows[0].version),
            expiresAt: repeated.rows[0].expires_at,
            repeated: true,
          };
        }
      }

      const existing = await sql<{
        membership_status: string | null;
        invitation_id: string | null;
      }>`
      select
        (select membership.status from iam.organization_memberships membership
          join iam.users user_record on user_record.id = membership.user_id
          where membership.organization_id = ${input.actor.organizationId}::uuid
            and user_record.email_normalized = ${email} limit 1) membership_status,
        (select invitation.id::text from iam.membership_invitations invitation
          where invitation.organization_id = ${input.actor.organizationId}::uuid
            and invitation.email_normalized = ${email} and invitation.status = 'PENDING' limit 1) invitation_id
    `.execute(tx);
      if (existing.rows[0]?.membership_status && existing.rows[0].membership_status !== 'REMOVED')
        throw new IamError('CONFLICT', 'This person already has an active membership in the organization.');
      if (existing.rows[0]?.invitation_id)
        throw new IamError('CONFLICT', 'A pending invitation already exists for this email.');

      const inserted = await sql<{ id: string; version: string; expires_at: string }>`
      insert into iam.membership_invitations (
        organization_id, email, email_normalized, display_name, token_hash, token_prefix,
        encrypted_delivery_token, invited_by_membership_id, expires_at, idempotency_key, request_fingerprint
      ) values (
        ${input.actor.organizationId}::uuid, ${input.email.trim()}, ${email}, ${displayName}, ${hashToken(token)},
        ${token.slice(0, 8)}, ${encryptSecret(token, input.encryptionKey)}, ${input.actor.membershipId}::uuid,
        now() + (${expiresInHours} * interval '1 hour'), ${input.idempotencyKey ?? null}, ${fingerprint}
      ) returning id::text, version::text, expires_at::text
    `.execute(tx);
      const invitation = inserted.rows[0]!;
      if (input.capabilityCodes.length)
        await sql`
        insert into iam.membership_invitation_capabilities (invitation_id, capability_code)
        select ${invitation.id}::uuid, capability_code from iam.capability_definitions
        where capability_code in (${sql.join(input.capabilityCodes.map((code) => sql`${code}`))})
      `.execute(tx);
      for (const scope of input.scopes)
        await sql`
        insert into iam.membership_invitation_scopes (
          invitation_id, capability_code, scope_type, scope_id
        ) values (${invitation.id}::uuid, ${scope.capabilityCode}, ${scope.scopeType}, ${scope.scopeId}::uuid)
      `.execute(tx);
      await appendIamAudit(tx, {
        actor: input.actor,
        action: 'iam.invitation.created',
        targetType: 'iam.membership_invitation',
        targetId: invitation.id,
        after: {
          email,
          expiresAt: invitation.expires_at,
          capabilityCodes: input.capabilityCodes,
          scopes: input.scopes,
        },
      });
      await appendIamOutbox(tx, {
        organizationId: input.actor.organizationId,
        eventType: 'iam.invitation.created',
        aggregateType: 'iam.membership_invitation',
        aggregateId: invitation.id,
        aggregateVersion: Number(invitation.version),
        payload: { invitationId: invitation.id, email, expiresAt: invitation.expires_at },
      });
      return {
        invitationId: invitation.id,
        version: Number(invitation.version),
        expiresAt: invitation.expires_at,
        repeated: false,
      };
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505' &&
      input.idempotencyKey
    ) {
      const repeated = await sql<{
        id: string;
        request_fingerprint: string;
        version: string;
        expires_at: string;
      }>`
        select id::text, request_fingerprint, version::text, expires_at::text
        from iam.membership_invitations
        where organization_id = ${input.actor.organizationId}::uuid
          and invited_by_membership_id = ${input.actor.membershipId}::uuid
          and idempotency_key = ${input.idempotencyKey}
      `.execute(db);
      if (repeated.rows[0]?.request_fingerprint === fingerprint)
        return {
          invitationId: repeated.rows[0].id,
          version: Number(repeated.rows[0].version),
          expiresAt: repeated.rows[0].expires_at,
          repeated: true,
        };
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
      throw new IamError(
        'CONFLICT',
        'A matching pending invitation or idempotency key already exists.',
      );
    throw error;
  }
}

export async function listMembershipInvitations(
  db: IamDatabase,
  organizationId: string,
  status?: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED',
) {
  await expireMembershipInvitations(db, organizationId);
  return (
    await sql<{
      id: string;
      email: string;
      display_name: string;
      status: string;
      expires_at: string;
      last_sent_at: string | null;
      delivery_attempt_count: number;
      version: string;
      created_at: string;
      capability_codes: string[];
      scopes: AccessScope[];
    }>`
      select invitation.id::text, invitation.email, invitation.display_name, invitation.status,
        invitation.expires_at::text, invitation.last_sent_at::text, invitation.delivery_attempt_count,
        invitation.version::text, invitation.created_at::text,
        coalesce((select array_agg(capability_code order by capability_code)
          from iam.membership_invitation_capabilities where invitation_id = invitation.id), '{}') capability_codes,
        coalesce((select jsonb_agg(jsonb_build_object(
          'capabilityCode', capability_code, 'scopeType', scope_type, 'scopeId', scope_id::text
        ) order by capability_code, scope_type, scope_id)
          from iam.membership_invitation_scopes where invitation_id = invitation.id), '[]'::jsonb) scopes
      from iam.membership_invitations invitation
      where invitation.organization_id = ${organizationId}::uuid
        and (${status ?? null}::text is null or invitation.status = ${status ?? null})
      order by invitation.created_at desc, invitation.id
      limit 200
    `.execute(db)
  ).rows;
}

export async function resendMembershipInvitation(
  db: IamDatabase,
  input: {
    readonly actor: IamActor;
    readonly invitationId: string;
    readonly expectedVersion: number;
    readonly expiresInHours?: number;
    readonly encryptionKey: EncryptionKey;
  },
) {
  const token = generateOpaqueToken();
  const expiresInHours = input.expiresInHours ?? 72;
  return db.transaction().execute(async (tx) => {
    await loadActorAccess(tx, input.actor, 'admin.team.invite');
    const current = await sql<{ status: string; version: string; expires_at: string }>`
      select status, version::text, expires_at::text from iam.membership_invitations
      where id = ${input.invitationId}::uuid and organization_id = ${input.actor.organizationId}::uuid
      for update
    `.execute(tx);
    const invitation = current.rows[0];
    if (!invitation) throw new IamError('NOT_FOUND', 'The invitation was not found.');
    if (Number(invitation.version) !== input.expectedVersion)
      throw new IamError('VERSION_CONFLICT', 'The invitation changed; reload before resending.');
    if (invitation.status !== 'PENDING')
      throw new IamError('CONFLICT', 'Only a pending invitation can be resent.');
    const updated = await sql<{ version: string; expires_at: string }>`
      update iam.membership_invitations
      set token_hash = ${hashToken(token)}, token_prefix = ${token.slice(0, 8)},
        encrypted_delivery_token = ${encryptSecret(token, input.encryptionKey)},
        expires_at = now() + (${expiresInHours} * interval '1 hour'), delivery_lease_until = null,
        last_delivery_error_code = null, version = version + 1, updated_at = now()
      where id = ${input.invitationId}::uuid returning version::text, expires_at::text
    `.execute(tx);
    const version = Number(updated.rows[0]!.version);
    await appendIamAudit(tx, {
      actor: input.actor,
      action: 'iam.invitation.resent',
      targetType: 'iam.membership_invitation',
      targetId: input.invitationId,
      before: { expiresAt: invitation.expires_at },
      after: { expiresAt: updated.rows[0]!.expires_at, tokenRotated: true },
    });
    await appendIamOutbox(tx, {
      organizationId: input.actor.organizationId,
      eventType: 'iam.invitation.resent',
      aggregateType: 'iam.membership_invitation',
      aggregateId: input.invitationId,
      aggregateVersion: version,
      payload: { invitationId: input.invitationId, expiresAt: updated.rows[0]!.expires_at },
    });
    return { invitationId: input.invitationId, version, expiresAt: updated.rows[0]!.expires_at };
  });
}

export async function revokeMembershipInvitation(
  db: IamDatabase,
  input: {
    readonly actor: IamActor;
    readonly invitationId: string;
    readonly expectedVersion: number;
    readonly reason: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    await loadActorAccess(tx, input.actor, 'admin.team.invite');
    const current = await sql<{ status: string; version: string }>`
      select status, version::text from iam.membership_invitations
      where id = ${input.invitationId}::uuid and organization_id = ${input.actor.organizationId}::uuid
      for update
    `.execute(tx);
    const invitation = current.rows[0];
    if (!invitation) throw new IamError('NOT_FOUND', 'The invitation was not found.');
    if (Number(invitation.version) !== input.expectedVersion)
      throw new IamError('VERSION_CONFLICT', 'The invitation changed; reload before revoking.');
    if (invitation.status !== 'PENDING')
      throw new IamError('CONFLICT', 'Only a pending invitation can be revoked.');
    const updated = await sql<{ version: string }>`
      update iam.membership_invitations
      set status = 'REVOKED', revoked_at = now(), revoked_by_membership_id = ${input.actor.membershipId}::uuid,
        revoke_reason = ${input.reason}, encrypted_delivery_token = null, delivery_lease_until = null,
        version = version + 1, updated_at = now()
      where id = ${input.invitationId}::uuid returning version::text
    `.execute(tx);
    const version = Number(updated.rows[0]!.version);
    await appendIamAudit(tx, {
      actor: input.actor,
      action: 'iam.invitation.revoked',
      targetType: 'iam.membership_invitation',
      targetId: input.invitationId,
      reason: input.reason,
      before: { status: invitation.status },
      after: { status: 'REVOKED' },
    });
    await appendIamOutbox(tx, {
      organizationId: input.actor.organizationId,
      eventType: 'iam.invitation.revoked',
      aggregateType: 'iam.membership_invitation',
      aggregateId: input.invitationId,
      aggregateVersion: version,
      payload: { invitationId: input.invitationId },
    });
    return { invitationId: input.invitationId, status: 'REVOKED' as const, version };
  });
}

export async function acceptMembershipInvitation(
  db: IamDatabase,
  input: {
    readonly token: string;
    readonly passwordHash?: string;
  },
) {
  const tokenHash = hashToken(input.token);
  await expireMembershipInvitations(db);
  const result = await db.transaction().execute(async (tx) => {
    const current = await sql<{
      id: string;
      organization_id: string;
      email: string;
      email_normalized: string;
      display_name: string;
      status: string;
      expires_at: Date;
      version: string;
      accepted_membership_id: string | null;
      capability_codes: string[];
      scopes: AccessScope[];
    }>`
      select invitation.id::text, invitation.organization_id::text, invitation.email,
        invitation.email_normalized, invitation.display_name, invitation.status, invitation.expires_at,
        invitation.version::text, invitation.accepted_membership_id::text,
        coalesce((select array_agg(capability_code order by capability_code)
          from iam.membership_invitation_capabilities where invitation_id = invitation.id), '{}') capability_codes,
        coalesce((select jsonb_agg(jsonb_build_object(
          'capabilityCode', capability_code, 'scopeType', scope_type, 'scopeId', scope_id::text
        ) order by capability_code, scope_type, scope_id)
          from iam.membership_invitation_scopes where invitation_id = invitation.id), '[]'::jsonb) scopes
      from iam.membership_invitations invitation
      where invitation.token_hash = ${tokenHash}
      for update
    `.execute(tx);
    const invitation = current.rows[0];
    if (!invitation) throw new IamError('INVITATION_INVALID', 'The invitation token is invalid.');
    if (invitation.status === 'ACCEPTED' && invitation.accepted_membership_id)
      return {
        membershipId: invitation.accepted_membership_id,
        organizationId: invitation.organization_id,
        alreadyAccepted: true,
      };
    if (invitation.status === 'REVOKED')
      throw new IamError('INVITATION_REVOKED', 'The invitation was revoked.');
    if (invitation.status !== 'PENDING')
      throw new IamError('INVITATION_EXPIRED', 'The invitation is no longer active.');
    if (invitation.expires_at.getTime() <= Date.now()) {
      await sql`
        update iam.membership_invitations set status = 'EXPIRED', encrypted_delivery_token = null,
          delivery_lease_until = null, version = version + 1, updated_at = now()
        where id = ${invitation.id}::uuid
      `.execute(tx);
      return { expired: true as const };
    }

    let user = (
      await sql<{ id: string }>`
        select id::text from iam.users where email_normalized = ${invitation.email_normalized} for update
      `.execute(tx)
    ).rows[0];
    if (!user) {
      if (!input.passwordHash)
        throw new IamError(
          'VALIDATION_FAILED',
          'A password is required for a new administrator account.',
        );
      user = (
        await sql<{ id: string }>`
          insert into iam.users (name, email, email_normalized, email_verified)
          values (${invitation.display_name}, ${invitation.email}, ${invitation.email_normalized}, true)
          returning id::text
        `.execute(tx)
      ).rows[0]!;
      await sql`
        insert into iam.auth_accounts (account_id, provider_id, user_id, password)
        values (${user.id}, 'credential', ${user.id}::uuid, ${input.passwordHash})
      `.execute(tx);
    }

    const existingMembership = await sql<{ id: string; status: string }>`
      select id::text, status from iam.organization_memberships
      where organization_id = ${invitation.organization_id}::uuid and user_id = ${user.id}::uuid
      for update
    `.execute(tx);
    let membershipId: string;
    if (existingMembership.rows[0]) {
      if (existingMembership.rows[0].status !== 'REMOVED')
        throw new IamError('CONFLICT', 'This identity already has an active organization membership.');
      membershipId = existingMembership.rows[0].id;
      await sql`
        update iam.organization_memberships
        set status = 'ACTIVE', display_name = ${invitation.display_name},
          activated_at = now(), version = version + 1, access_version = access_version + 1,
          updated_at = now(), lifecycle_reason = 'Re-activated via accepted invitation'
        where id = ${membershipId}::uuid
      `.execute(tx);
    } else {
      const membership = await sql<{ id: string }>`
        insert into iam.organization_memberships (
          organization_id, user_id, membership_type, status, display_name, invited_at, activated_at
        ) values (
          ${invitation.organization_id}::uuid, ${user.id}::uuid, 'STANDARD', 'ACTIVE',
          ${invitation.display_name}, now(), now()
        ) returning id::text
      `.execute(tx);
      membershipId = membership.rows[0]!.id;
    }
    await replaceCapabilityRows(tx, membershipId, user.id, invitation.capability_codes);
    await replaceScopeRows(tx, invitation.organization_id, membershipId, invitation.scopes);
    const version = Number(invitation.version) + 1;
    await sql`
      update iam.membership_invitations
      set status = 'ACCEPTED', accepted_by_user_id = ${user.id}::uuid,
        accepted_membership_id = ${membershipId}::uuid, accepted_at = now(),
        encrypted_delivery_token = null, delivery_lease_until = null, version = version + 1, updated_at = now()
      where id = ${invitation.id}::uuid
    `.execute(tx);
    const systemActor: IamActor = {
      organizationId: invitation.organization_id,
      userId: user.id,
      membershipId,
    };
    await appendIamAudit(tx, {
      actor: systemActor,
      action: 'iam.invitation.accepted',
      targetType: 'iam.membership_invitation',
      targetId: invitation.id,
      after: { membershipId, email: invitation.email_normalized },
    });
    await appendIamOutbox(tx, {
      organizationId: invitation.organization_id,
      eventType: 'iam.invitation.accepted',
      aggregateType: 'iam.membership_invitation',
      aggregateId: invitation.id,
      aggregateVersion: version,
      payload: { invitationId: invitation.id, membershipId, userId: user.id },
    });
    return {
      expired: false as const,
      membershipId,
      organizationId: invitation.organization_id,
      alreadyAccepted: false,
    };
  });
  if ('expired' in result && result.expired)
    throw new IamError('INVITATION_EXPIRED', 'The invitation has expired.');
  return result;
}

export async function expireMembershipInvitations(db: IamDatabase, organizationId?: string) {
  const result = await sql<{ count: string }>`
    with expired as (
      update iam.membership_invitations
      set status = 'EXPIRED', encrypted_delivery_token = null, delivery_lease_until = null,
        version = version + 1, updated_at = now()
      where status = 'PENDING' and expires_at <= now()
        and (${organizationId ?? null}::uuid is null or organization_id = ${organizationId ?? null}::uuid)
      returning id
    ) select count(*)::text as count from expired
  `.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}

export interface InvitationEmailAdapter {
  readonly name: string;
  send(request: {
    readonly notificationId: string;
    readonly recipient: string;
    readonly subject: string;
    readonly body: string;
    readonly idempotencyKey: string;
  }): Promise<
    | { readonly status: 'SENT'; readonly providerReference?: string; readonly metadata?: object }
    | {
        readonly status: 'FAILED';
        readonly retryable: boolean;
        readonly errorCode: string;
        readonly metadata?: object;
      }
  >;
}

export async function deliverPendingInvitationEmails(
  db: IamDatabase,
  adapter: InvitationEmailAdapter,
  encryptionKey: EncryptionKey,
  adminBaseUrl: string,
  limit = 20,
) {
  await expireMembershipInvitations(db);
  const claimed = await sql<{
    id: string;
    email: string;
    display_name: string;
    encrypted_delivery_token: string;
    expires_at: string;
    version: string;
    delivery_attempt_count: number;
  }>`
    update iam.membership_invitations invitation
    set delivery_lease_until = now() + interval '2 minutes',
      delivery_attempt_count = delivery_attempt_count + 1, updated_at = now()
    from (
      select id from iam.membership_invitations
      where status = 'PENDING' and encrypted_delivery_token is not null
        and (delivery_lease_until is null or delivery_lease_until < now())
      order by created_at, id for update skip locked limit ${limit}
    ) candidate
    where invitation.id = candidate.id
    returning invitation.id::text, invitation.email, invitation.display_name,
      invitation.encrypted_delivery_token, invitation.expires_at::text, invitation.version::text
      , invitation.delivery_attempt_count
  `.execute(db);
  let processed = 0;
  for (const invitation of claimed.rows) {
    let outcome: Awaited<ReturnType<InvitationEmailAdapter['send']>>;
    try {
      const token = decryptSecret(invitation.encrypted_delivery_token, encryptionKey);
      const url = new URL('/accept-invitation', adminBaseUrl);
      url.searchParams.set('token', token);
      outcome = await adapter.send({
        notificationId: invitation.id,
        recipient: invitation.email,
        subject: 'Your Maevelle team invitation',
        body: `Hello ${invitation.display_name},\n\nAccept your Maevelle team invitation: ${url.toString()}\n\nThis link expires at ${invitation.expires_at}.`,
        idempotencyKey: `iam-invitation:${invitation.id}:v${invitation.version}`,
      });
    } catch {
      outcome = { status: 'FAILED', retryable: true, errorCode: 'INVITATION_DELIVERY_FAILED' };
    }
    if (outcome.status === 'SENT')
      await sql`
        update iam.membership_invitations
        set last_sent_at = now(), encrypted_delivery_token = null, delivery_lease_until = null,
          last_delivery_error_code = null, updated_at = now()
        where id = ${invitation.id}::uuid
      `.execute(db);
    else
      await sql`
        update iam.membership_invitations
        set delivery_lease_until = null, last_delivery_error_code = ${outcome.errorCode}, updated_at = now()
        where id = ${invitation.id}::uuid
      `.execute(db);
    await sql`
      insert into iam.membership_invitation_delivery_attempts (
        invitation_id, attempt_number, provider, status, provider_reference, error_code
      ) values (
        ${invitation.id}::uuid, ${invitation.delivery_attempt_count}, ${adapter.name}, ${outcome.status},
        ${outcome.status === 'SENT' ? (outcome.providerReference ?? null) : null},
        ${outcome.status === 'FAILED' ? outcome.errorCode : null}
      )
    `.execute(db);
    processed++;
  }
  return processed;
}
