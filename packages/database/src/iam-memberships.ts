import { sql } from 'kysely';

import {
  appendIamAudit,
  appendIamOutbox,
  type AccessScope,
  type IamActor,
  type IamDatabase,
  IamError,
  enqueueMemberSecurityNotification,
  loadActorAccess,
  replaceCapabilityRows,
  replaceScopeRows,
  validateCapabilityAssignment,
} from './iam-common.js';

export interface TeamListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly status?: 'ACTIVE' | 'DISABLED' | 'REMOVED';
}

export async function listTeamMembers(
  db: IamDatabase,
  organizationId: string,
  query: TeamListQuery = {},
) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const search = query.search?.trim() ? `%${query.search.trim().replaceAll('%', '\\%').replaceAll('_', '\\_')}%` : null;
  const count = await sql<{ count: string }>`
    select count(*)::text as count
    from iam.organization_memberships membership
    join iam.users user_record on user_record.id = membership.user_id
    where membership.organization_id = ${organizationId}::uuid
      and (${query.status ?? null}::text is null or membership.status = ${query.status ?? null})
      and (${search}::text is null or user_record.name ilike ${search} escape '\\' or user_record.email ilike ${search} escape '\\')
  `.execute(db);
  const totalItems = Number(count.rows[0]?.count ?? 0);
  const result = await sql<{
    id: string;
    user_id: string;
    name: string;
    email: string;
    two_factor_enabled: boolean;
    membership_type: string;
    status: string;
    version: string;
    access_version: string;
    created_at: string;
    updated_at: string;
    capabilities: string[];
    scopes: AccessScope[];
  }>`
    select membership.id::text, membership.user_id::text, user_record.name, user_record.email,
      user_record.two_factor_enabled, membership.membership_type, membership.status,
      membership.version::text, membership.access_version::text,
      membership.created_at::text, membership.updated_at::text,
      coalesce((select array_agg(grant_record.capability_code order by grant_record.capability_code)
        from iam.membership_capability_grants grant_record where grant_record.membership_id = membership.id), '{}') capabilities,
      coalesce((select jsonb_agg(jsonb_build_object(
        'capabilityCode', scope.capability_code, 'scopeType', scope.scope_type, 'scopeId', scope.scope_id::text
      ) order by scope.capability_code, scope.scope_type, scope.scope_id)
        from iam.membership_scopes scope where scope.membership_id = membership.id), '[]'::jsonb) scopes
    from iam.organization_memberships membership
    join iam.users user_record on user_record.id = membership.user_id
    where membership.organization_id = ${organizationId}::uuid
      and (${query.status ?? null}::text is null or membership.status = ${query.status ?? null})
      and (${search}::text is null or user_record.name ilike ${search} escape '\\' or user_record.email ilike ${search} escape '\\')
    order by (membership.membership_type = 'OWNER') desc, user_record.name, membership.id
    limit ${pageSize} offset ${(page - 1) * pageSize}
  `.execute(db);
  return {
    items: result.rows,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}

export async function listCapabilityCatalog(db: IamDatabase) {
  return (
    await sql<{
      capability_code: string;
      domain: string;
      description: string;
      sensitivity: string;
      supported_scope_types: string[];
      status: string;
    }>`
      select capability_code, domain, description, sensitivity, supported_scope_types, status
      from iam.capability_definitions
      order by domain, capability_code
    `.execute(db)
  ).rows;
}

export async function listPermissionPresets(db: IamDatabase, organizationId: string) {
  return (
    await sql<{
      id: string;
      name: string;
      description: string | null;
      is_system_default: boolean;
      version: string;
      capability_codes: string[];
      member_count: number;
    }>`
      select preset.id::text, preset.name, preset.description, preset.is_system_default,
        preset.version::text,
        coalesce(array_agg(capability.capability_code order by capability.capability_code)
          filter (where capability.capability_code is not null), '{}') capability_codes,
        (
          select count(distinct m.id)::int
          from iam.organization_memberships m
          where m.organization_id = preset.organization_id
            and m.status = 'ACTIVE'
            and not exists (
              select 1 from iam.permission_preset_capabilities pc
              where pc.preset_id = preset.id
                and not exists (
                  select 1 from iam.membership_capability_grants g
                  where g.membership_id = m.id and g.capability_code = pc.capability_code
                )
            )
            and exists (select 1 from iam.permission_preset_capabilities pc2 where pc2.preset_id = preset.id)
        ) as member_count
      from iam.permission_presets preset
      left join iam.permission_preset_capabilities capability on capability.preset_id = preset.id
      where preset.organization_id = ${organizationId}::uuid
      group by preset.id order by preset.is_system_default desc, preset.name
    `.execute(db)
  ).rows;
}

export async function createPermissionPreset(
  db: IamDatabase,
  input: {
    readonly actor: IamActor;
    readonly name: string;
    readonly description?: string;
    readonly capabilityCodes: readonly string[];
  },
) {
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new IamError('VALIDATION_FAILED', 'A preset name between 1 and 120 characters is required.');
  }
  return db.transaction().execute(async (tx) => {
    const access = await loadActorAccess(tx, input.actor, 'admin.team.permissions.manage');
    await validateCapabilityAssignment(tx, access, input.capabilityCodes, [], input.actor.organizationId);

    const inserted = await sql<{ id: string; version: string }>`
      insert into iam.permission_presets (
        organization_id, name, description, is_system_default
      ) values (
        ${input.actor.organizationId}::uuid, ${name}, ${input.description?.trim() || null}, false
      ) returning id::text, version::text
    `.execute(tx);
    const preset = inserted.rows[0]!;

    if (input.capabilityCodes.length) {
      await sql`
        insert into iam.permission_preset_capabilities (preset_id, capability_code)
        select ${preset.id}::uuid, capability_code
        from iam.capability_definitions
        where capability_code in (${sql.join(input.capabilityCodes.map((code) => sql`${code}`))})
      `.execute(tx);
    }

    await appendIamAudit(tx, {
      actor: input.actor,
      action: 'iam.preset.created',
      targetType: 'iam.permission_preset',
      targetId: preset.id,
      after: { name, description: input.description, capabilityCodes: input.capabilityCodes },
    });

    return { id: preset.id, name, version: Number(preset.version) };
  });
}

export async function updatePermissionPreset(
  db: IamDatabase,
  input: {
    readonly actor: IamActor;
    readonly presetId: string;
    readonly expectedVersion: number;
    readonly name: string;
    readonly description?: string;
    readonly capabilityCodes: readonly string[];
  },
) {
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new IamError('VALIDATION_FAILED', 'A preset name between 1 and 120 characters is required.');
  }
  return db.transaction().execute(async (tx) => {
    const access = await loadActorAccess(tx, input.actor, 'admin.team.permissions.manage');
    const existing = await sql<{ is_system_default: boolean; version: string; name: string }>`
      select is_system_default, version::text, name
      from iam.permission_presets
      where id = ${input.presetId}::uuid and organization_id = ${input.actor.organizationId}::uuid
      for update
    `.execute(tx);
    const preset = existing.rows[0];
    if (!preset) throw new IamError('NOT_FOUND', 'The permission preset was not found.');
    if (preset.is_system_default) {
      throw new IamError('FORBIDDEN', 'System default presets are protected and cannot be edited.');
    }
    if (Number(preset.version) !== input.expectedVersion) {
      throw new IamError('VERSION_CONFLICT', 'The preset changed; reload before saving.');
    }

    await validateCapabilityAssignment(tx, access, input.capabilityCodes, [], input.actor.organizationId);

    const updated = await sql<{ version: string }>`
      update iam.permission_presets
      set name = ${name}, description = ${input.description?.trim() || null},
        version = version + 1, updated_at = now()
      where id = ${input.presetId}::uuid
      returning version::text
    `.execute(tx);

    await sql`delete from iam.permission_preset_capabilities where preset_id = ${input.presetId}::uuid`.execute(tx);
    if (input.capabilityCodes.length) {
      await sql`
        insert into iam.permission_preset_capabilities (preset_id, capability_code)
        select ${input.presetId}::uuid, capability_code
        from iam.capability_definitions
        where capability_code in (${sql.join(input.capabilityCodes.map((code) => sql`${code}`))})
      `.execute(tx);
    }

    await appendIamAudit(tx, {
      actor: input.actor,
      action: 'iam.preset.updated',
      targetType: 'iam.permission_preset',
      targetId: input.presetId,
      after: { name, description: input.description, capabilityCodes: input.capabilityCodes },
    });

    return { id: input.presetId, name, version: Number(updated.rows[0]!.version) };
  });
}

export async function deletePermissionPreset(
  db: IamDatabase,
  input: {
    readonly actor: IamActor;
    readonly presetId: string;
    readonly expectedVersion: number;
  },
) {
  return db.transaction().execute(async (tx) => {
    await loadActorAccess(tx, input.actor, 'admin.team.permissions.manage');
    const existing = await sql<{ is_system_default: boolean; version: string; name: string }>`
      select is_system_default, version::text, name
      from iam.permission_presets
      where id = ${input.presetId}::uuid and organization_id = ${input.actor.organizationId}::uuid
      for update
    `.execute(tx);
    const preset = existing.rows[0];
    if (!preset) throw new IamError('NOT_FOUND', 'The permission preset was not found.');
    if (preset.is_system_default) {
      throw new IamError('FORBIDDEN', 'System default presets are protected and cannot be deleted.');
    }
    if (Number(preset.version) !== input.expectedVersion) {
      throw new IamError('VERSION_CONFLICT', 'The preset changed; reload before deleting.');
    }

    await sql`delete from iam.permission_preset_capabilities where preset_id = ${input.presetId}::uuid`.execute(tx);
    await sql`delete from iam.permission_presets where id = ${input.presetId}::uuid`.execute(tx);

    await appendIamAudit(tx, {
      actor: input.actor,
      action: 'iam.preset.deleted',
      targetType: 'iam.permission_preset',
      targetId: input.presetId,
      before: { name: preset.name },
    });

    return { id: input.presetId, deleted: true as const };
  });
}

export async function findTeamMemberDetail(
  db: IamDatabase,
  organizationId: string,
  membershipId: string,
) {
  const result = await sql<{
    id: string;
    user_id: string;
    name: string;
    email: string;
    two_factor_enabled: boolean;
    membership_type: string;
    status: string;
    version: string;
    access_version: string;
    created_at: string;
    updated_at: string;
    invited_at: string | null;
    activated_at: string | null;
    disabled_at: string | null;
    removed_at: string | null;
    lifecycle_reason: string | null;
    capabilities: string[];
    scopes: AccessScope[];
  }>`
    select membership.id::text, membership.user_id::text, user_record.name, user_record.email,
      user_record.two_factor_enabled, membership.membership_type, membership.status,
      membership.version::text, membership.access_version::text,
      membership.created_at::text, membership.updated_at::text,
      membership.invited_at::text, membership.activated_at::text,
      membership.disabled_at::text, membership.removed_at::text,
      membership.lifecycle_reason,
      coalesce((select array_agg(grant_record.capability_code order by grant_record.capability_code)
        from iam.membership_capability_grants grant_record where grant_record.membership_id = membership.id), '{}') capabilities,
      coalesce((select jsonb_agg(jsonb_build_object(
        'capabilityCode', scope.capability_code, 'scopeType', scope.scope_type, 'scopeId', scope.scope_id::text
      ) order by scope.capability_code, scope.scope_type, scope.scope_id)
        from iam.membership_scopes scope where scope.membership_id = membership.id), '[]'::jsonb) scopes
    from iam.organization_memberships membership
    join iam.users user_record on user_record.id = membership.user_id
    where membership.organization_id = ${organizationId}::uuid
      and membership.id = ${membershipId}::uuid
    limit 1
  `.execute(db);
  return result.rows[0];
}

export async function listTeamLocations(db: IamDatabase, organizationId: string) {
  return (
    await sql<{
      id: string;
      name: string;
      code: string;
      type: string;
    }>`
      select id::text, name, code, type
      from warehouse.locations
      where organization_id = ${organizationId}::uuid and status = 'ACTIVE'
      order by name
    `.execute(db)
  ).rows;
}

export async function listIamAuditEvents(
  db: IamDatabase,
  organizationId: string,
  input: {
    readonly page?: number;
    readonly pageSize?: number;
    readonly search?: string;
    readonly action?: string;
  } = {},
) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(250, Math.max(1, input.pageSize ?? 50));
  const search = input.search?.trim() ? `%${input.search.trim().replaceAll('%', '\\%').replaceAll('_', '\\_')}%` : null;
  const where = sql`
    event.organization_id = ${organizationId}::uuid
    and event.action like 'iam.%'
    and (${input.action ?? null}::text is null or event.action = ${input.action ?? null})
    and (${search}::text is null
      or actor.email ilike ${search} escape '\\'
      or actor.name ilike ${search} escape '\\'
      or target_user.email ilike ${search} escape '\\'
      or target_user.name ilike ${search} escape '\\'
      or invitation.email ilike ${search} escape '\\'
      or event.action ilike ${search} escape '\\')
  `;
  const count = await sql<{ count: string }>`
    select count(*)::text count
    from audit.audit_events event
    left join iam.users actor on actor.id = event.actor_id
    left join iam.organization_memberships target_membership
      on event.target_type = 'iam.organization_membership' and target_membership.id = event.target_id
    left join iam.users target_user on target_user.id = target_membership.user_id
    left join iam.membership_invitations invitation
      on event.target_type = 'iam.membership_invitation' and invitation.id = event.target_id
    where ${where}
  `.execute(db);
  const totalItems = Number(count.rows[0]?.count ?? 0);
  const events = await sql<{
    id: string;
    event_id: string;
    action: string;
    actor_id: string | null;
    actor_name: string | null;
    actor_email: string | null;
    target_type: string | null;
    target_id: string | null;
    target_name: string | null;
    target_email: string | null;
    reason: string | null;
    before_diff: unknown;
    after_diff: unknown;
    metadata: unknown;
    created_at: string;
  }>`
    select event.id::text, event.event_id::text, event.action, event.actor_id::text,
      actor.name actor_name, actor.email actor_email, event.target_type, event.target_id::text,
      target_user.name target_name, coalesce(target_user.email, invitation.email) target_email,
      event.reason, event.before_diff, event.after_diff, event.metadata, event.created_at::text
    from audit.audit_events event
    left join iam.users actor on actor.id = event.actor_id
    left join iam.organization_memberships target_membership
      on event.target_type = 'iam.organization_membership' and target_membership.id = event.target_id
    left join iam.users target_user on target_user.id = target_membership.user_id
    left join iam.membership_invitations invitation
      on event.target_type = 'iam.membership_invitation' and invitation.id = event.target_id
    where ${where}
    order by event.created_at desc, event.id desc
    limit ${pageSize} offset ${(page - 1) * pageSize}
  `.execute(db);
  return {
    items: events.rows,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}

export async function replaceMemberPermissions(
  db: IamDatabase,
  input: {
    readonly actor: IamActor;
    readonly membershipId: string;
    readonly expectedVersion: number;
    readonly capabilityCodes: readonly string[];
    readonly scopes: readonly AccessScope[];
    readonly reason?: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const access = await loadActorAccess(tx, input.actor, 'admin.team.permissions.manage');
    const target = await sql<{
      membership_type: string;
      status: string;
      version: string;
      capabilities: string[];
      scopes: AccessScope[];
    }>`
      select membership.membership_type, membership.status, membership.version::text,
        coalesce((select array_agg(capability_code order by capability_code)
          from iam.membership_capability_grants where membership_id = membership.id), '{}') capabilities,
        coalesce((select jsonb_agg(jsonb_build_object(
          'capabilityCode', capability_code, 'scopeType', scope_type, 'scopeId', scope_id::text
        ) order by capability_code, scope_type, scope_id)
          from iam.membership_scopes where membership_id = membership.id), '[]'::jsonb) scopes
      from iam.organization_memberships membership
      where membership.id = ${input.membershipId}::uuid
        and membership.organization_id = ${input.actor.organizationId}::uuid
      for update
    `.execute(tx);
    const member = target.rows[0];
    if (!member) throw new IamError('NOT_FOUND', 'The membership was not found.');
    if (member.membership_type === 'OWNER')
      throw new IamError('OWNER_PROTECTED', 'Owner access is structural and cannot be edited here.');
    if (input.membershipId === input.actor.membershipId)
      throw new IamError('SELF_CHANGE_FORBIDDEN', 'Self privilege changes are not allowed.');
    if (Number(member.version) !== input.expectedVersion)
      throw new IamError('VERSION_CONFLICT', 'The membership changed; reload before saving.');
    if (member.status === 'REMOVED')
      throw new IamError('CONFLICT', 'A removed membership cannot receive access.');

    await validateCapabilityAssignment(
      tx,
      access,
      input.capabilityCodes,
      input.scopes,
      input.actor.organizationId,
    );
    await replaceCapabilityRows(tx, input.membershipId, input.actor.userId, input.capabilityCodes);
    await replaceScopeRows(tx, input.actor.organizationId, input.membershipId, input.scopes);
    const updated = await sql<{ version: string; access_version: string }>`
      update iam.organization_memberships
      set version = version + 1, access_version = access_version + 1, updated_at = now()
      where id = ${input.membershipId}::uuid
      returning version::text, access_version::text
    `.execute(tx);
    const version = Number(updated.rows[0]!.version);
    await appendIamAudit(tx, {
      actor: input.actor,
      action: 'iam.membership.permissions_replaced',
      targetType: 'iam.organization_membership',
      targetId: input.membershipId,
      ...(input.reason ? { reason: input.reason } : {}),
      before: { capabilities: member.capabilities, scopes: member.scopes },
      after: { capabilities: input.capabilityCodes, scopes: input.scopes },
    });
    await appendIamOutbox(tx, {
      organizationId: input.actor.organizationId,
      eventType: 'iam.membership.permissions_replaced',
      aggregateType: 'iam.organization_membership',
      aggregateId: input.membershipId,
      aggregateVersion: version,
      payload: { membershipId: input.membershipId, accessVersion: updated.rows[0]!.access_version },
    });
    await enqueueMemberSecurityNotification(tx, {
      organizationId: input.actor.organizationId,
      membershipId: input.membershipId,
      notificationType: 'IAM_ACCESS_CHANGED',
      subject: 'Your Maevelle access changed',
      body: 'An administrator changed your organization capabilities or location access.',
      sourceId: input.membershipId,
    });
    return { membershipId: input.membershipId, version, accessVersion: Number(updated.rows[0]!.access_version) };
  });
}

export type MembershipLifecycleAction = 'SUSPEND' | 'RESTORE' | 'REMOVE';

export async function changeMemberLifecycle(
  db: IamDatabase,
  input: {
    readonly actor: IamActor;
    readonly membershipId: string;
    readonly action: MembershipLifecycleAction;
    readonly expectedVersion: number;
    readonly reason: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    await loadActorAccess(tx, input.actor, 'admin.team.lifecycle.manage');
    const target = await sql<{
      user_id: string;
      membership_type: string;
      status: string;
      version: string;
    }>`
      select user_id::text, membership_type, status, version::text
      from iam.organization_memberships
      where id = ${input.membershipId}::uuid and organization_id = ${input.actor.organizationId}::uuid
      for update
    `.execute(tx);
    const member = target.rows[0];
    if (!member) throw new IamError('NOT_FOUND', 'The membership was not found.');
    if (member.membership_type === 'OWNER')
      throw new IamError('OWNER_PROTECTED', 'Transfer ownership before changing the Owner.');
    if (input.membershipId === input.actor.membershipId)
      throw new IamError('SELF_CHANGE_FORBIDDEN', 'Self lifecycle changes are not allowed.');
    if (Number(member.version) !== input.expectedVersion)
      throw new IamError('VERSION_CONFLICT', 'The membership changed; reload before continuing.');

    if (input.action === 'RESTORE') {
      if (member.status !== 'DISABLED')
        throw new IamError('CONFLICT', `The membership cannot be restored from ${member.status}.`);
    } else if (input.action === 'SUSPEND') {
      if (member.status !== 'ACTIVE')
        throw new IamError('CONFLICT', `The membership cannot be suspended from ${member.status}.`);
    } else if (input.action === 'REMOVE') {
      if (member.status !== 'ACTIVE' && member.status !== 'DISABLED')
        throw new IamError('CONFLICT', `The membership cannot be removed from ${member.status}.`);
    }
    const nextStatus = input.action === 'RESTORE' ? 'ACTIVE' : input.action === 'SUSPEND' ? 'DISABLED' : 'REMOVED';
    const timestampColumn = input.action === 'RESTORE' ? 'activated_at' : input.action === 'SUSPEND' ? 'disabled_at' : 'removed_at';
    const updated = await sql<{ version: string; access_version: string }>`
      update iam.organization_memberships
      set status = ${nextStatus}, version = version + 1, access_version = access_version + 1,
        updated_at = now(), lifecycle_reason = ${input.reason}, lifecycle_changed_by = ${input.actor.userId}::uuid,
        ${sql.ref(timestampColumn)} = now()
      where id = ${input.membershipId}::uuid
      returning version::text, access_version::text
    `.execute(tx);
    const version = Number(updated.rows[0]!.version);
    await appendIamAudit(tx, {
      actor: input.actor,
      action: `iam.membership.${input.action.toLowerCase()}`,
      targetType: 'iam.organization_membership',
      targetId: input.membershipId,
      reason: input.reason,
      before: { status: member.status },
      after: { status: nextStatus },
    });
    const eventType =
      input.action === 'SUSPEND'
        ? 'iam.membership.suspended'
        : input.action === 'RESTORE'
          ? 'iam.membership.restored'
          : 'iam.membership.removed';
    await appendIamOutbox(tx, {
      organizationId: input.actor.organizationId,
      eventType,
      aggregateType: 'iam.organization_membership',
      aggregateId: input.membershipId,
      aggregateVersion: version,
      payload: { membershipId: input.membershipId, userId: member.user_id, status: nextStatus },
    });
    await enqueueMemberSecurityNotification(tx, {
      organizationId: input.actor.organizationId,
      membershipId: input.membershipId,
      notificationType: `IAM_MEMBERSHIP_${nextStatus}`,
      subject: `Your Maevelle membership is ${nextStatus.toLowerCase()}`,
      body: `An administrator changed your organization membership status to ${nextStatus}.`,
      sourceId: input.membershipId,
    });
    return { membershipId: input.membershipId, userId: member.user_id, status: nextStatus, version };
  });
}

export async function transferOwnership(
  db: IamDatabase,
  input: {
    readonly actor: IamActor;
    readonly targetMembershipId: string;
    readonly expectedOwnerVersion: number;
    readonly expectedTargetVersion: number;
    readonly reason: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const access = await loadActorAccess(tx, input.actor, 'admin.team.owner.transfer');
    if (access.membershipType !== 'OWNER')
      throw new IamError('FORBIDDEN', 'Only the current Owner may transfer ownership.');
    const memberships = await sql<{
      id: string;
      user_id: string;
      membership_type: string;
      status: string;
      version: string;
    }>`
      select id::text, user_id::text, membership_type, status, version::text
      from iam.organization_memberships
      where organization_id = ${input.actor.organizationId}::uuid
        and id in (${input.actor.membershipId}::uuid, ${input.targetMembershipId}::uuid)
      order by id for update
    `.execute(tx);
    const owner = memberships.rows.find((member) => member.id === input.actor.membershipId);
    const target = memberships.rows.find((member) => member.id === input.targetMembershipId);
    if (!owner || owner.membership_type !== 'OWNER' || owner.status !== 'ACTIVE')
      throw new IamError('FORBIDDEN', 'The acting membership is not the active Owner.');
    if (!target) throw new IamError('NOT_FOUND', 'The successor membership was not found.');
    if (target.status !== 'ACTIVE' || target.membership_type !== 'STANDARD')
      throw new IamError('CONFLICT', 'The successor must be an active standard member.');
    if (Number(owner.version) !== input.expectedOwnerVersion || Number(target.version) !== input.expectedTargetVersion)
      throw new IamError('VERSION_CONFLICT', 'Ownership records changed; reload before confirming.');

    await sql`
      update iam.organization_memberships
      set membership_type = 'STANDARD', version = version + 1, access_version = access_version + 1,
        lifecycle_reason = ${input.reason}, lifecycle_changed_by = ${input.actor.userId}::uuid, updated_at = now()
      where id = ${owner.id}::uuid
    `.execute(tx);
    const promoted = await sql<{ version: string }>`
      update iam.organization_memberships
      set membership_type = 'OWNER', version = version + 1, access_version = access_version + 1,
        lifecycle_reason = ${input.reason}, lifecycle_changed_by = ${input.actor.userId}::uuid, updated_at = now()
      where id = ${target.id}::uuid
      returning version::text
    `.execute(tx);
    const version = Number(promoted.rows[0]!.version);
    await appendIamAudit(tx, {
      actor: input.actor,
      action: 'iam.organization.owner_transferred',
      targetType: 'iam.organization_membership',
      targetId: target.id,
      reason: input.reason,
      before: { ownerMembershipId: owner.id, ownerUserId: owner.user_id },
      after: { ownerMembershipId: target.id, ownerUserId: target.user_id },
    });
    await appendIamOutbox(tx, {
      organizationId: input.actor.organizationId,
      eventType: 'iam.organization.owner_transferred',
      aggregateType: 'iam.organization_membership',
      aggregateId: target.id,
      aggregateVersion: version,
      payload: { previousOwnerMembershipId: owner.id, ownerMembershipId: target.id },
    });
    for (const membershipId of [owner.id, target.id])
      await enqueueMemberSecurityNotification(tx, {
        organizationId: input.actor.organizationId,
        membershipId,
        notificationType: 'IAM_OWNER_TRANSFERRED',
        subject: 'Maevelle ownership changed',
        body: 'The protected Owner relationship for your organization was transferred.',
        sourceId: target.id,
      });
    return { previousOwnerMembershipId: owner.id, ownerMembershipId: target.id, version };
  });
}

export async function membershipCanAccessScope(
  db: IamDatabase,
  membershipId: string,
  capabilityCode: string,
  scopeType: 'LOCATION',
  scopeId: string,
): Promise<boolean> {
  const result = await sql<{ allowed: boolean }>`
    select case
      when membership.membership_type = 'OWNER' then true
      when not exists (
        select 1 from iam.membership_scopes configured
        where configured.membership_id = membership.id
          and configured.capability_code = ${capabilityCode}
          and configured.scope_type = ${scopeType}
      ) then true
      else exists (
        select 1 from iam.membership_scopes allowed
        where allowed.membership_id = membership.id
          and allowed.capability_code = ${capabilityCode}
          and allowed.scope_type = ${scopeType}
          and allowed.scope_id = ${scopeId}::uuid
      )
    end as allowed
    from iam.organization_memberships membership
    where membership.id = ${membershipId}::uuid and membership.status = 'ACTIVE'
  `.execute(db);
  return result.rows[0]?.allowed ?? false;
}

export async function findMembershipUserId(
  db: IamDatabase,
  organizationId: string,
  membershipId: string,
): Promise<string | undefined> {
  return (
    await sql<{ user_id: string }>`
      select user_id::text from iam.organization_memberships
      where id = ${membershipId}::uuid and organization_id = ${organizationId}::uuid
    `.execute(db)
  ).rows[0]?.user_id;
}

export async function requestMemberSessionRevocation(
  db: IamDatabase,
  input: {
    readonly actor: IamActor;
    readonly membershipId: string;
    readonly reason: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    await loadActorAccess(tx, input.actor, 'admin.team.sessions.revoke');
    if (input.membershipId === input.actor.membershipId)
      throw new IamError('SELF_CHANGE_FORBIDDEN', 'Use sign out to end your own session.');
    const target = await sql<{ user_id: string; version: string }>`
      select user_id::text, version::text from iam.organization_memberships
      where id = ${input.membershipId}::uuid and organization_id = ${input.actor.organizationId}::uuid
      for update
    `.execute(tx);
    if (!target.rows[0]) throw new IamError('NOT_FOUND', 'The membership was not found.');
    await appendIamAudit(tx, {
      actor: input.actor,
      action: 'iam.membership.sessions_revocation_requested',
      targetType: 'iam.organization_membership',
      targetId: input.membershipId,
      reason: input.reason,
    });
    await appendIamOutbox(tx, {
      organizationId: input.actor.organizationId,
      eventType: 'iam.membership.sessions_revocation_requested',
      aggregateType: 'iam.organization_membership',
      aggregateId: input.membershipId,
      aggregateVersion: Number(target.rows[0].version),
      payload: { membershipId: input.membershipId, userId: target.rows[0].user_id },
    });
    await enqueueMemberSecurityNotification(tx, {
      organizationId: input.actor.organizationId,
      membershipId: input.membershipId,
      notificationType: 'IAM_SESSIONS_REVOKED',
      subject: 'Your Maevelle sessions were revoked',
      body: 'An administrator revoked your active Maevelle administrator sessions.',
      sourceId: input.membershipId,
    });
    return { userId: target.rows[0].user_id };
  });
}
