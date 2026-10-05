import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';

export type IamDatabase = Kysely<DatabaseSchema>;
export type MembershipType = 'OWNER' | 'STANDARD';
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'DISABLED' | 'EXPIRED_INVITE' | 'REMOVED';
export type CapabilitySensitivity = 'INTERNAL' | 'HIGH' | 'CRITICAL' | 'RESTRICTED';
export type ScopeType = 'LOCATION';

export interface AccessScope {
  readonly capabilityCode: string;
  readonly scopeType: ScopeType;
  readonly scopeId: string;
}

export interface IamActor {
  readonly organizationId: string;
  readonly userId: string;
  readonly membershipId: string;
}

export interface IamAccountActor {
  readonly organizationId?: string | null | undefined;
  readonly userId: string;
  readonly membershipId?: string | null | undefined;
}

export type IamErrorCode =
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_INVALID'
  | 'INVITATION_REVOKED'
  | 'NOT_FOUND'
  | 'OWNER_PROTECTED'
  | 'SELF_CHANGE_FORBIDDEN'
  | 'UNKNOWN_CAPABILITY'
  | 'VALIDATION_FAILED'
  | 'VERSION_CONFLICT';

export class IamError extends Error {
  public constructor(
    public readonly code: IamErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'IamError';
  }
}

export interface ActorAccess {
  readonly membershipType: MembershipType;
  readonly capabilities: ReadonlySet<string>;
}

export async function loadActorAccess(
  db: IamDatabase,
  actor: IamActor,
  requiredCapability: string,
): Promise<ActorAccess> {
  const membership = await sql<{ membership_type: MembershipType }>`
    select membership_type
    from iam.organization_memberships
    where id = ${actor.membershipId}::uuid
      and organization_id = ${actor.organizationId}::uuid
      and user_id = ${actor.userId}::uuid
      and status = 'ACTIVE'
    for update
  `.execute(db);
  const row = membership.rows[0];
  if (!row) throw new IamError('FORBIDDEN', 'The acting membership is not active.');

  const grants = await sql<{ capability_code: string }>`
    select capability_code
    from iam.membership_capability_grants
    where membership_id = ${actor.membershipId}::uuid
  `.execute(db);
  const capabilities = new Set(grants.rows.map((grant) => grant.capability_code));
  if (row.membership_type !== 'OWNER' && !capabilities.has(requiredCapability))
    throw new IamError('FORBIDDEN', 'The acting membership cannot perform this operation.');
  return { membershipType: row.membership_type, capabilities };
}

export async function validateCapabilityAssignment(
  db: IamDatabase,
  access: ActorAccess,
  capabilityCodes: readonly string[],
  scopes: readonly AccessScope[],
  organizationId: string,
): Promise<void> {
  const uniqueCodes = [...new Set(capabilityCodes)];
  if (uniqueCodes.length !== capabilityCodes.length)
    throw new IamError('VALIDATION_FAILED', 'Capabilities must not contain duplicates.');
  if (uniqueCodes.length > 250)
    throw new IamError('VALIDATION_FAILED', 'Too many capabilities were requested.');

  const definitions = uniqueCodes.length
    ? (
        await sql<{
          capability_code: string;
          sensitivity: CapabilitySensitivity;
          supported_scope_types: string[];
        }>`
          select capability_code, sensitivity, supported_scope_types
          from iam.capability_definitions
          where capability_code in (${sql.join(uniqueCodes.map((code) => sql`${code}`))})
            and status = 'ACTIVE'
        `.execute(db)
      ).rows
    : [];
  if (definitions.length !== uniqueCodes.length)
    throw new IamError('UNKNOWN_CAPABILITY', 'One or more capabilities are unknown or unavailable.');

  if (access.membershipType !== 'OWNER') {
    if (uniqueCodes.some((code) => !access.capabilities.has(code)))
      throw new IamError('FORBIDDEN', 'A member cannot delegate access they do not hold.');
    if (
      definitions.some(
        (definition) =>
          definition.sensitivity === 'CRITICAL' || definition.sensitivity === 'RESTRICTED',
      )
    )
      throw new IamError('FORBIDDEN', 'Only the Owner may delegate critical capabilities.');
  }

  const definitionMap = new Map(definitions.map((definition) => [definition.capability_code, definition]));
  const scopeKeys = new Set<string>();
  for (const scope of scopes) {
    if (!uniqueCodes.includes(scope.capabilityCode))
      throw new IamError('VALIDATION_FAILED', 'Every scope must belong to an assigned capability.');
    const definition = definitionMap.get(scope.capabilityCode);
    if (!definition?.supported_scope_types.includes(scope.scopeType))
      throw new IamError('VALIDATION_FAILED', `${scope.capabilityCode} does not support ${scope.scopeType} scope.`);
    const key = `${scope.capabilityCode}:${scope.scopeType}:${scope.scopeId}`;
    if (scopeKeys.has(key)) throw new IamError('VALIDATION_FAILED', 'Scopes must not contain duplicates.');
    scopeKeys.add(key);
  }

  const locationIds = [...new Set(scopes.filter((scope) => scope.scopeType === 'LOCATION').map((scope) => scope.scopeId))];
  if (locationIds.length) {
    const locations = await sql<{ id: string }>`
      select id::text
      from warehouse.locations
      where organization_id = ${organizationId}::uuid
        and id in (${sql.join(locationIds.map((id) => sql`${id}::uuid`))})
    `.execute(db);
    if (locations.rows.length !== locationIds.length)
      throw new IamError('VALIDATION_FAILED', 'A location scope is outside this organization or does not exist.');
  }
}

export async function appendIamAudit(
  db: IamDatabase,
  input: {
    readonly actor: IamActor | IamAccountActor;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly reason?: string | undefined;
    readonly before?: unknown;
    readonly after?: unknown;
    readonly metadata?: unknown;
  },
): Promise<void> {
  const orgValue = input.actor.organizationId ? sql`${input.actor.organizationId}::uuid` : sql`null`;
  const memValue = input.actor.membershipId ? sql`${input.actor.membershipId}::uuid` : sql`null`;
  await sql`
    insert into audit.audit_events (
      organization_id, actor_type, actor_id, membership_id, action, target_type, target_id,
      reason, before_diff, after_diff, metadata
    ) values (
      ${orgValue}, 'USER', ${input.actor.userId}::uuid,
      ${memValue}, ${input.action}, ${input.targetType}, ${input.targetId}::uuid,
      ${input.reason ?? null}, ${JSON.stringify(input.before ?? null)}::jsonb,
      ${JSON.stringify(input.after ?? null)}::jsonb, ${JSON.stringify(input.metadata ?? null)}::jsonb
    )
  `.execute(db);
}

export async function appendIamOutbox(
  db: IamDatabase,
  input: {
    readonly organizationId?: string | null | undefined;
    readonly eventType: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly aggregateVersion: number;
    readonly payload: unknown;
  },
): Promise<void> {
  const orgValue = input.organizationId ? sql`${input.organizationId}::uuid` : sql`null`;
  await sql`
    insert into platform.outbox_events (
      organization_id, event_type, event_version, aggregate_type, aggregate_id,
      aggregate_version, payload, occurred_at
    ) values (
      ${orgValue}, ${input.eventType}, 1, ${input.aggregateType},
      ${input.aggregateId}::uuid, ${input.aggregateVersion}, ${JSON.stringify(input.payload)}::jsonb, now()
    )
  `.execute(db);
}

export async function enqueueMemberSecurityNotification(
  db: IamDatabase,
  input: {
    readonly organizationId: string;
    readonly membershipId: string;
    readonly notificationType: string;
    readonly subject: string;
    readonly body: string;
    readonly sourceId: string;
  },
): Promise<void> {
  await sql`
    insert into notifications.notifications (
      organization_id, notification_type, recipient_type, membership_id, channel,
      rendered_subject, rendered_body, intended_recipient, status, queued_at, source_domain, source_id
    )
    select ${input.organizationId}::uuid, ${input.notificationType}, 'MEMBERSHIP',
      membership.id, requested.channel, ${input.subject}, ${input.body},
      case when requested.channel = 'EMAIL' then user_record.email else null end,
      'QUEUED', now(), 'iam', ${input.sourceId}::uuid
    from (values ('IN_APP'), ('EMAIL')) requested(channel)
    join iam.organization_memberships membership
      on membership.id = ${input.membershipId}::uuid
      and membership.organization_id = ${input.organizationId}::uuid
    join iam.users user_record on user_record.id = membership.user_id
  `.execute(db);
}

export async function replaceCapabilityRows(
  db: IamDatabase,
  membershipId: string,
  actorUserId: string,
  capabilityCodes: readonly string[],
): Promise<void> {
  await sql`delete from iam.membership_capability_grants where membership_id = ${membershipId}::uuid`.execute(db);
  if (!capabilityCodes.length) return;
  await sql`
    insert into iam.membership_capability_grants (membership_id, capability_code, created_by)
    select ${membershipId}::uuid, capability_code, ${actorUserId}::uuid
    from iam.capability_definitions
    where capability_code in (${sql.join(capabilityCodes.map((code) => sql`${code}`))})
  `.execute(db);
}

export async function replaceScopeRows(
  db: IamDatabase,
  organizationId: string,
  membershipId: string,
  scopes: readonly AccessScope[],
): Promise<void> {
  await sql`delete from iam.membership_scopes where membership_id = ${membershipId}::uuid`.execute(db);
  for (const scope of scopes)
    await sql`
      insert into iam.membership_scopes (
        organization_id, membership_id, capability_code, scope_type, scope_id
      ) values (
        ${organizationId}::uuid, ${membershipId}::uuid, ${scope.capabilityCode},
        ${scope.scopeType}, ${scope.scopeId}::uuid
      )
    `.execute(db);
}
