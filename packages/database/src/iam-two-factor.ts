import { sql } from 'kysely';

import {
  appendIamAudit,
  appendIamOutbox,
  enqueueMemberSecurityNotification,
  type IamActor,
  type IamDatabase,
  IamError,
  loadActorAccess,
} from './iam-common.js';

export type TwoFactorEnforcementMode = 'OPTIONAL' | 'CRITICAL_CAPABILITIES' | 'ALL_MEMBERS';

export interface TwoFactorAccessState {
  readonly organizationId: string;
  readonly membershipId: string;
  readonly membershipType: 'OWNER' | 'STANDARD';
  readonly isEnabled: boolean;
  readonly enrollmentPending: boolean;
  readonly hasRecoveryCodes: boolean;
  readonly policy: {
    readonly mode: TwoFactorEnforcementMode;
    readonly gracePeriodHours: number;
    readonly enforcementStartedAt: string | null;
    readonly enrollmentDeadline: string | null;
    readonly version: number;
  };
  readonly isRequired: boolean;
  readonly enrollmentRequired: boolean;
  readonly accessRestricted: boolean;
}

export async function resolveTwoFactorAccessState(
  db: IamDatabase,
  userId: string,
  organizationId?: string,
): Promise<TwoFactorAccessState | undefined> {
  const result = await sql<{
    organization_id: string;
    membership_id: string;
    membership_type: 'OWNER' | 'STANDARD';
    two_factor_enabled: boolean;
    enrollment_pending: boolean;
    has_recovery_codes: boolean;
    enforcement_mode: TwoFactorEnforcementMode;
    grace_period_hours: number;
    enforcement_started_at: string | null;
    policy_version: string;
    has_critical_capability: boolean;
  }>`
    select membership.organization_id::text, membership.id::text membership_id,
      membership.membership_type, user_record.two_factor_enabled,
      coalesce(two_factor.verified = false, false) enrollment_pending,
      coalesce(length(two_factor.backup_codes) > 0, false) has_recovery_codes,
      coalesce(policy.enforcement_mode, 'OPTIONAL') enforcement_mode,
      coalesce(policy.grace_period_hours, 168) grace_period_hours,
      policy.enforcement_started_at::text,
      coalesce(policy.version, 0)::text policy_version,
      exists (
        select 1
        from iam.membership_capability_grants grant_record
        join iam.capability_definitions capability
          on capability.capability_code = grant_record.capability_code
        where grant_record.membership_id = membership.id
          and capability.status = 'ACTIVE'
          and capability.sensitivity in ('CRITICAL', 'RESTRICTED')
      ) has_critical_capability
    from iam.organization_memberships membership
    join iam.users user_record on user_record.id = membership.user_id
    left join iam.auth_two_factor two_factor on two_factor.user_id = user_record.id
    left join iam.organization_two_factor_policies policy
      on policy.organization_id = membership.organization_id
    where membership.user_id = ${userId}::uuid
      and membership.status = 'ACTIVE'
      and (${organizationId ?? null}::uuid is null or membership.organization_id = ${organizationId ?? null}::uuid)
    order by membership.created_at
    limit 2
  `.execute(db);
  if (!organizationId && result.rows.length > 1) return undefined;
  const row = result.rows[0];
  if (!row) return undefined;

  const isRequired =
    row.enforcement_mode === 'ALL_MEMBERS' ||
    (row.enforcement_mode === 'CRITICAL_CAPABILITIES' &&
      (row.membership_type === 'OWNER' || row.has_critical_capability));
  const enrollmentDeadline = row.enforcement_started_at
    ? new Date(
        new Date(row.enforcement_started_at).getTime() + row.grace_period_hours * 60 * 60 * 1000,
      ).toISOString()
    : null;
  const enrollmentRequired = isRequired && !row.two_factor_enabled;

  return {
    organizationId: row.organization_id,
    membershipId: row.membership_id,
    membershipType: row.membership_type,
    isEnabled: row.two_factor_enabled,
    enrollmentPending: row.enrollment_pending,
    hasRecoveryCodes: row.has_recovery_codes,
    policy: {
      mode: row.enforcement_mode,
      gracePeriodHours: row.grace_period_hours,
      enforcementStartedAt: row.enforcement_started_at,
      enrollmentDeadline,
      version: Number(row.policy_version),
    },
    isRequired,
    enrollmentRequired,
    accessRestricted:
      enrollmentRequired &&
      enrollmentDeadline !== null &&
      Date.now() >= Date.parse(enrollmentDeadline),
  };
}

export async function updateOrganizationTwoFactorPolicy(
  db: IamDatabase,
  input: {
    readonly actor: IamActor;
    readonly expectedVersion: number;
    readonly mode: TwoFactorEnforcementMode;
    readonly gracePeriodHours: number;
    readonly reason: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    await loadActorAccess(tx, input.actor, 'admin.security.two_factor_policy.manage');
    const current = await sql<{
      enforcement_mode: TwoFactorEnforcementMode;
      grace_period_hours: number;
      enforcement_started_at: string | null;
      version: string;
    }>`
      select enforcement_mode, grace_period_hours, enforcement_started_at::text, version::text
      from iam.organization_two_factor_policies
      where organization_id = ${input.actor.organizationId}::uuid
      for update
    `.execute(tx);
    const previous = current.rows[0];
    const currentVersion = Number(previous?.version ?? 0);
    if (currentVersion !== input.expectedVersion)
      throw new IamError(
        'VERSION_CONFLICT',
        'The two-factor policy changed; reload before saving.',
      );

    const enforcementStartedAt =
      input.mode === 'OPTIONAL'
        ? null
        : previous?.enforcement_mode === input.mode && previous.enforcement_started_at
          ? previous.enforcement_started_at
          : new Date().toISOString();
    const nextVersion = currentVersion + 1;
    await sql`
      insert into iam.organization_two_factor_policies (
        organization_id, enforcement_mode, grace_period_hours, enforcement_started_at,
        updated_by_actor_id, version
      ) values (
        ${input.actor.organizationId}::uuid, ${input.mode}, ${input.gracePeriodHours},
        ${enforcementStartedAt}::timestamptz, ${input.actor.userId}::uuid, ${nextVersion}
      )
      on conflict (organization_id) do update set
        enforcement_mode = excluded.enforcement_mode,
        grace_period_hours = excluded.grace_period_hours,
        enforcement_started_at = excluded.enforcement_started_at,
        updated_by_actor_id = excluded.updated_by_actor_id,
        updated_at = now(),
        version = excluded.version
    `.execute(tx);
    await appendIamAudit(tx, {
      actor: input.actor,
      action: 'iam.two_factor.policy_changed',
      targetType: 'platform.organization',
      targetId: input.actor.organizationId,
      reason: input.reason,
      before: previous
        ? {
            mode: previous.enforcement_mode,
            gracePeriodHours: previous.grace_period_hours,
            enforcementStartedAt: previous.enforcement_started_at,
          }
        : { mode: 'OPTIONAL', gracePeriodHours: 168, enforcementStartedAt: null },
      after: { mode: input.mode, gracePeriodHours: input.gracePeriodHours, enforcementStartedAt },
    });
    await appendIamOutbox(tx, {
      organizationId: input.actor.organizationId,
      eventType: 'iam.two_factor.policy_changed',
      aggregateType: 'platform.organization',
      aggregateId: input.actor.organizationId,
      aggregateVersion: nextVersion,
      payload: { mode: input.mode, gracePeriodHours: input.gracePeriodHours, enforcementStartedAt },
    });
    const members = await sql<{ id: string }>`
      select id::text from iam.organization_memberships
      where organization_id = ${input.actor.organizationId}::uuid and status = 'ACTIVE'
    `.execute(tx);
    for (const member of members.rows)
      await enqueueMemberSecurityNotification(tx, {
        organizationId: input.actor.organizationId,
        membershipId: member.id,
        notificationType: 'IAM_TWO_FACTOR_POLICY_CHANGED',
        subject: 'Maevelle authenticator policy changed',
        body:
          input.mode === 'OPTIONAL'
            ? 'Authenticator app protection is now optional for your Maevelle administrator account.'
            : `Authenticator app protection is now required for eligible administrators. Complete setup within ${input.gracePeriodHours} hours.`,
        sourceId: input.actor.organizationId,
      });
    return {
      mode: input.mode,
      gracePeriodHours: input.gracePeriodHours,
      enforcementStartedAt,
      version: nextVersion,
    };
  });
}

export async function resetMemberTwoFactor(
  db: IamDatabase,
  input: { readonly actor: IamActor; readonly membershipId: string; readonly reason: string },
) {
  return db.transaction().execute(async (tx) => {
    await loadActorAccess(tx, input.actor, 'admin.team.two_factor.reset');
    if (input.membershipId === input.actor.membershipId)
      throw new IamError(
        'SELF_CHANGE_FORBIDDEN',
        'Use Account Security to manage your own authenticator.',
      );
    const target = await sql<{
      user_id: string;
      membership_type: 'OWNER' | 'STANDARD';
      two_factor_enabled: boolean;
      version: string;
    }>`
      select membership.user_id::text, membership.membership_type,
        user_record.two_factor_enabled, membership.version::text
      from iam.organization_memberships membership
      join iam.users user_record on user_record.id = membership.user_id
      where membership.organization_id = ${input.actor.organizationId}::uuid
        and membership.id = ${input.membershipId}::uuid
        and membership.status = 'ACTIVE'
      for update of membership, user_record
    `.execute(tx);
    const member = target.rows[0];
    if (!member) throw new IamError('NOT_FOUND', 'The active membership was not found.');
    if (member.membership_type === 'OWNER')
      throw new IamError(
        'OWNER_PROTECTED',
        'The Owner authenticator cannot be reset by another member.',
      );
    if (!member.two_factor_enabled)
      throw new IamError(
        'CONFLICT',
        'This member does not have an active authenticator enrollment.',
      );

    await sql`delete from iam.auth_two_factor where user_id = ${member.user_id}::uuid`.execute(tx);
    await sql`
      update iam.users
      set two_factor_enabled = false, version = version + 1, updated_at = now()
      where id = ${member.user_id}::uuid
    `.execute(tx);
    await appendIamAudit(tx, {
      actor: input.actor,
      action: 'iam.two_factor.admin_reset',
      targetType: 'iam.organization_membership',
      targetId: input.membershipId,
      reason: input.reason,
      before: { twoFactorEnabled: true },
      after: { twoFactorEnabled: false },
    });
    await appendIamOutbox(tx, {
      organizationId: input.actor.organizationId,
      eventType: 'iam.two_factor.admin_reset',
      aggregateType: 'iam.organization_membership',
      aggregateId: input.membershipId,
      aggregateVersion: Number(member.version),
      payload: { membershipId: input.membershipId, userId: member.user_id },
    });
    await enqueueMemberSecurityNotification(tx, {
      organizationId: input.actor.organizationId,
      membershipId: input.membershipId,
      notificationType: 'IAM_TWO_FACTOR_ADMIN_RESET',
      subject: 'Your Maevelle authenticator was reset',
      body: 'An authorized administrator reset your authenticator enrollment. Old authenticator and recovery codes no longer work. Enroll again before accessing protected areas when policy requires it.',
      sourceId: input.membershipId,
    });
    return { userId: member.user_id, membershipId: input.membershipId, reset: true as const };
  });
}

const eventMessages = {
  enrollment_started: {
    action: 'iam.two_factor.enrollment_started',
    type: 'IAM_TWO_FACTOR_ENROLLMENT_STARTED',
    subject: 'Authenticator setup started',
    body: 'Authenticator app setup was started for your Maevelle administrator account. If this was not you, change your password and contact an authorized administrator.',
  },
  enabled: {
    action: 'iam.two_factor.enabled',
    type: 'IAM_TWO_FACTOR_ENABLED',
    subject: 'Authenticator protection enabled',
    body: 'Authenticator app protection was enabled for your Maevelle administrator account.',
  },
  disabled: {
    action: 'iam.two_factor.disabled',
    type: 'IAM_TWO_FACTOR_DISABLED',
    subject: 'Authenticator protection disabled',
    body: 'Authenticator app protection was disabled for your Maevelle administrator account. All existing sessions were revoked.',
  },
  backup_codes_regenerated: {
    action: 'iam.two_factor.backup_codes_regenerated',
    type: 'IAM_TWO_FACTOR_BACKUP_CODES_REGENERATED',
    subject: 'Recovery codes regenerated',
    body: 'New Maevelle recovery codes were generated. All previous recovery codes are now invalid.',
  },
  recovery_code_used: {
    action: 'iam.two_factor.recovery_code_used',
    type: 'IAM_TWO_FACTOR_RECOVERY_CODE_USED',
    subject: 'A recovery code was used',
    body: 'A single-use recovery code completed sign-in to your Maevelle administrator account.',
  },
} as const;

export async function recordUserTwoFactorEvent(
  db: IamDatabase,
  input: {
    readonly userId: string;
    readonly event: keyof typeof eventMessages;
    readonly requestId?: string;
    readonly ipAddress?: string;
    readonly userAgent?: string;
  },
): Promise<void> {
  const message = eventMessages[input.event];
  await db.transaction().execute(async (tx) => {
    const memberships = await sql<{ id: string; organization_id: string }>`
      select id::text, organization_id::text
      from iam.organization_memberships
      where user_id = ${input.userId}::uuid and status = 'ACTIVE'
      order by created_at
      for update
    `.execute(tx);
    for (const membership of memberships.rows) {
      const actor: IamActor = {
        userId: input.userId,
        membershipId: membership.id,
        organizationId: membership.organization_id,
      };
      await appendIamAudit(tx, {
        actor,
        action: message.action,
        targetType: 'iam.organization_membership',
        targetId: membership.id,
        metadata: {
          requestId: input.requestId,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });
      await appendIamOutbox(tx, {
        organizationId: membership.organization_id,
        eventType: message.action,
        aggregateType: 'iam.organization_membership',
        aggregateId: membership.id,
        aggregateVersion: Date.now(),
        payload: { membershipId: membership.id, userId: input.userId },
      });
      await enqueueMemberSecurityNotification(tx, {
        organizationId: membership.organization_id,
        membershipId: membership.id,
        notificationType: message.type,
        subject: message.subject,
        body: message.body,
        sourceId: membership.id,
      });
    }
  });
}
