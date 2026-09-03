import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';

export class SizingDomainError extends Error {
  public readonly code: 'NOT_FOUND' | 'IMMUTABLE_REVISION' | 'VALIDATION_FAILED';

  public constructor(code: SizingDomainError['code'], message: string) {
    super(message);
    this.name = 'SizingDomainError';
    this.code = code;
  }
}

// ─── Audit helper ─────────────────────────────────────────────────────────────

async function recordSizingAudit(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await sql`
    insert into audit.audit_events (organization_id, actor_type, actor_id, action, target_type, target_id, metadata)
    values (
      ${input.organizationId}, ${input.actorId ? 'USER' : 'SYSTEM'}, ${input.actorId ?? null},
      ${input.action}, ${input.targetType}, ${input.targetId}::uuid,
      ${input.metadata ? JSON.stringify(input.metadata) : null}
    )
  `.execute(db);
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

async function assertDraftRevision(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  revisionId: string,
): Promise<void> {
  const revision = await sql<{ status: string }>`
    select status from sizing.size_guide_revisions where id = ${revisionId} and organization_id = ${organizationId}
  `.execute(db);
  if (!revision.rows[0])
    throw new SizingDomainError('NOT_FOUND', 'Size guide revision was not found.');
  if (revision.rows[0].status !== 'DRAFT')
    throw new SizingDomainError(
      'IMMUTABLE_REVISION',
      'Published guide revisions are immutable; create a new revision.',
    );
}

// ─── Create operations ─────────────────────────────────────────────────────────

export async function createSizingDomain(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    code: string;
    name: string;
    subjectType: 'BODY' | 'GARMENT' | 'PRODUCT';
    actorId?: string;
  },
): Promise<{ id: string }> {
  const result = await sql<{ id: string }>`
    insert into sizing.sizing_domains (organization_id, code, name, subject_type)
    values (${input.organizationId}, ${input.code}, ${input.name}, ${input.subjectType}) returning id
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new Error('Sizing domain creation did not return an id.');
  if (input.actorId)
    await recordSizingAudit(db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'CREATED',
      targetType: 'SIZING_DOMAIN',
      targetId: row.id,
    });
  return row;
}

export async function createSizeSystem(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    sizingDomainId: string;
    code: string;
    name: string;
    regionCode?: string;
    actorId?: string;
  },
): Promise<{ id: string }> {
  const result = await sql<{ id: string }>`
    insert into sizing.size_systems (organization_id, sizing_domain_id, code, name, region_code)
    select ${input.organizationId},domain.id,${input.code},${input.name},${input.regionCode ?? null}
    from sizing.sizing_domains domain
    where domain.id=${input.sizingDomainId} and domain.organization_id=${input.organizationId}
      and domain.status='ACTIVE'
    returning id
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new SizingDomainError('NOT_FOUND', 'Sizing domain was not found.');
  if (input.actorId)
    await recordSizingAudit(db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'CREATED',
      targetType: 'SIZE_SYSTEM',
      targetId: row.id,
    });
  return row;
}

export async function createSizeDefinition(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    sizeSystemId: string;
    code: string;
    label: string;
    sortOrder?: number;
    actorId?: string;
  },
): Promise<{ id: string }> {
  const result = await sql<{ id: string }>`
    insert into sizing.size_definitions (organization_id, size_system_id, code, label, sort_order)
    select ${input.organizationId},system.id,${input.code},${input.label},${input.sortOrder ?? 0}
    from sizing.size_systems system
    where system.id=${input.sizeSystemId} and system.organization_id=${input.organizationId}
      and system.status='ACTIVE'
    returning id
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new SizingDomainError('NOT_FOUND', 'Size system was not found.');
  if (input.actorId)
    await recordSizingAudit(db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'CREATED',
      targetType: 'SIZE_DEFINITION',
      targetId: row.id,
    });
  return row;
}

export async function createMeasurementDefinition(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    sizingDomainId: string;
    code: string;
    name: string;
    subjectType: 'BODY' | 'GARMENT' | 'PRODUCT';
    defaultUnit: 'cm' | 'inch';
    description?: string;
    instructions?: string;
    sortOrder?: number;
    actorId?: string;
  },
): Promise<{ id: string }> {
  const result = await sql<{ id: string }>`
    insert into sizing.measurement_definitions
      (organization_id, sizing_domain_id, code, name, description, instructions, sort_order, subject_type, default_unit)
    select ${input.organizationId},domain.id,${input.code},${input.name},
      ${input.description ?? null},${input.instructions ?? null},${input.sortOrder ?? 0},
      ${input.subjectType},${input.defaultUnit}
    from sizing.sizing_domains domain
    where domain.id=${input.sizingDomainId} and domain.organization_id=${input.organizationId}
      and domain.status='ACTIVE'
    returning id
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new SizingDomainError('NOT_FOUND', 'Sizing domain was not found.');
  if (input.actorId)
    await recordSizingAudit(db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'CREATED',
      targetType: 'MEASUREMENT_DEFINITION',
      targetId: row.id,
    });
  return row;
}

export async function createSizeGuide(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    name: string;
    sizingDomainId: string;
    description?: string;
    actorId: string;
  },
): Promise<{ id: string; revisionId: string }> {
  return db.transaction().execute(async (transaction) => {
    const guide = await sql<{ id: string }>`
      insert into sizing.size_guides (organization_id, name, description, sizing_domain_id)
      select ${input.organizationId},${input.name},${input.description ?? null},domain.id
      from sizing.sizing_domains domain
      where domain.id=${input.sizingDomainId} and domain.organization_id=${input.organizationId}
        and domain.status='ACTIVE'
      returning id
    `.execute(transaction);
    const id = guide.rows[0]?.id;
    if (!id) throw new SizingDomainError('NOT_FOUND', 'Sizing domain was not found.');
    const revision = await sql<{ id: string }>`
      insert into sizing.size_guide_revisions (organization_id, size_guide_id, revision_number, created_by)
      values (${input.organizationId}, ${id}, 1, ${input.actorId}) returning id
    `.execute(transaction);
    const revisionId = revision.rows[0]?.id;
    if (!revisionId) throw new Error('Size guide revision creation did not return an id.');
    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'CREATED',
      targetType: 'SIZE_GUIDE',
      targetId: id,
      metadata: { name: input.name },
    });
    return { id, revisionId };
  });
}

export async function createSizeGuideRevision(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    sizeGuideId: string;
    actorId: string;
    instructions?: string;
    fitNotes?: string;
  },
): Promise<{ id: string; revisionNumber: number }> {
  const result = await sql<{ id: string; revision_number: number }>`
    insert into sizing.size_guide_revisions (organization_id, size_guide_id, revision_number, instructions, fit_notes, created_by)
    select ${input.organizationId}, guide.id,
      coalesce(max(revision.revision_number), 0) + 1,
      ${input.instructions ?? null}, ${input.fitNotes ?? null}, ${input.actorId}
    from sizing.size_guides guide
    left join sizing.size_guide_revisions revision on revision.size_guide_id = guide.id
    where guide.id = ${input.sizeGuideId} and guide.organization_id = ${input.organizationId}
    group by guide.id
    returning id, revision_number
  `.execute(db);
  const revision = result.rows[0];
  if (!revision) throw new SizingDomainError('NOT_FOUND', 'Size guide was not found.');
  return { id: revision.id, revisionNumber: revision.revision_number };
}

export async function addSizeGuideRow(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    displayLabel: string;
    position: number;
    sizeDefinitionId?: string;
  },
): Promise<{ id: string }> {
  await assertDraftRevision(db, input.organizationId, input.revisionId);
  if (input.sizeDefinitionId) {
    const definition = await sql<{ id: string }>`
      select definition.id
      from sizing.size_definitions definition
      join sizing.size_guide_revisions revision on revision.id=${input.revisionId}
      join sizing.size_guides guide on guide.id=revision.size_guide_id
      join sizing.size_systems system on system.id=definition.size_system_id
      where definition.id=${input.sizeDefinitionId}
        and definition.organization_id=${input.organizationId}
        and system.sizing_domain_id=guide.sizing_domain_id
    `.execute(db);
    if (!definition.rows[0])
      throw new SizingDomainError(
        'VALIDATION_FAILED',
        'Size definition is not available for this guide.',
      );
  }
  const row = await sql<{ id: string }>`
    insert into sizing.size_guide_rows (organization_id, revision_id, size_definition_id, display_label, position)
    values (${input.organizationId}, ${input.revisionId}, ${input.sizeDefinitionId ?? null}, ${input.displayLabel}, ${input.position}) returning id
  `.execute(db);
  const id = row.rows[0]?.id;
  if (!id) throw new Error('Size guide row creation did not return an id.');
  return { id };
}

export async function setSizeGuideMeasurement(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    rowId: string;
    measurementDefinitionId: string;
    unitCode: 'cm' | 'inch';
    exact?: string;
    min?: string;
    max?: string;
    isApproximate?: boolean;
  },
): Promise<void> {
  await assertDraftRevision(db, input.organizationId, input.revisionId);
  const row = await sql<{ id: string }>`
    select id from sizing.size_guide_rows where id = ${input.rowId} and revision_id = ${input.revisionId} and organization_id = ${input.organizationId}
  `.execute(db);
  if (!row.rows[0]) {
    throw new SizingDomainError(
      'VALIDATION_FAILED',
      'Size guide row does not belong to this revision.',
    );
  }
  const definition = await sql<{ id: string }>`
    select definition.id
    from sizing.measurement_definitions definition
    join sizing.size_guide_rows size_row on size_row.id=${input.rowId}
    join sizing.size_guide_revisions revision on revision.id=size_row.revision_id
    join sizing.size_guides guide on guide.id=revision.size_guide_id
    where definition.id=${input.measurementDefinitionId}
      and definition.organization_id=${input.organizationId}
      and definition.sizing_domain_id=guide.sizing_domain_id
  `.execute(db);
  if (!definition.rows[0])
    throw new SizingDomainError(
      'VALIDATION_FAILED',
      'Measurement definition is not available for this guide.',
    );
  const isRange = input.min !== undefined || input.max !== undefined;
  if (isRange ? input.min === undefined || input.max === undefined : input.exact === undefined) {
    throw new SizingDomainError(
      'VALIDATION_FAILED',
      'A measurement needs one exact value or a complete range.',
    );
  }
  await sql`
    insert into sizing.size_guide_measurements (
      organization_id, row_id, measurement_definition_id, value_type, value_exact, value_min, value_max, unit_code, is_approximate
    ) values (
      ${input.organizationId}, ${input.rowId}, ${input.measurementDefinitionId}, ${isRange ? 'RANGE' : 'EXACT'},
      ${input.exact ?? null}, ${input.min ?? null}, ${input.max ?? null}, ${input.unitCode}, ${input.isApproximate ?? false}
    ) on conflict (row_id, measurement_definition_id) do update
      set value_type = excluded.value_type, value_exact = excluded.value_exact, value_min = excluded.value_min,
          value_max = excluded.value_max, unit_code = excluded.unit_code, is_approximate = excluded.is_approximate
  `.execute(db);
}

export async function removeSizeGuideRow(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; revisionId: string; rowId: string },
): Promise<void> {
  await assertDraftRevision(db, input.organizationId, input.revisionId);
  const deleted = await sql`
    delete from sizing.size_guide_rows
    where id = ${input.rowId}
      and revision_id = ${input.revisionId}
      and organization_id = ${input.organizationId}
  `.execute(db);
  if (Number(deleted.numAffectedRows) !== 1)
    throw new SizingDomainError('NOT_FOUND', 'Size guide row was not found in this revision.');
}

// ─── Publish ───────────────────────────────────────────────────────────────────

export async function publishSizeGuideRevision(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; sizeGuideId: string; revisionId: string; actorId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    await assertDraftRevision(transaction, input.organizationId, input.revisionId);

    // Validate: must have at least one row with at least one measurement
    const rowCheck = await sql<{ row_count: string; measured_count: string }>`
      select
        count(distinct r.id)::text as row_count,
        count(m.id)::text as measured_count
      from sizing.size_guide_rows r
      left join sizing.size_guide_measurements m on m.row_id = r.id
      where r.revision_id = ${input.revisionId} and r.organization_id = ${input.organizationId}
    `.execute(transaction);
    const check = rowCheck.rows[0];
    if (!check || Number(check.row_count) === 0)
      throw new SizingDomainError(
        'VALIDATION_FAILED',
        'A size guide must have at least one size row before it can be published.',
      );
    if (Number(check.measured_count) === 0)
      throw new SizingDomainError(
        'VALIDATION_FAILED',
        'Each size row must have at least one measurement value before the guide can be published.',
      );

    const changed = await sql`
      update sizing.size_guide_revisions set status = 'PUBLISHED', published_at = now()
      where id = ${input.revisionId} and size_guide_id = ${input.sizeGuideId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    if (Number(changed.numAffectedRows) !== 1)
      throw new SizingDomainError('NOT_FOUND', 'Size guide was not found.');
    await sql`
      update sizing.size_guides set current_published_revision_id = ${input.revisionId}, version = version + 1, updated_at = now()
      where id = ${input.sizeGuideId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'PUBLISHED',
      targetType: 'SIZE_GUIDE_REVISION',
      targetId: input.revisionId,
      metadata: { sizeGuideId: input.sizeGuideId },
    });
  });
}

// ─── Update operations ─────────────────────────────────────────────────────────

export async function updateSizeGuide(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    id: string;
    name?: string;
    description?: string | null;
    actorId: string;
  },
): Promise<void> {
  const changed = await sql`
    update sizing.size_guides
    set
      name = coalesce(${input.name ?? null}, name),
      description = case when ${input.description !== undefined} then ${input.description ?? null} else description end,
      updated_at = now(),
      version = version + 1
    where id = ${input.id} and organization_id = ${input.organizationId} and status = 'ACTIVE'
  `.execute(db);
  if (Number(changed.numAffectedRows) !== 1)
    throw new SizingDomainError('NOT_FOUND', 'Size guide was not found.');
}

export async function updateSizeGuideRevisionMeta(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    instructions?: string | null;
    fitNotes?: string | null;
  },
): Promise<void> {
  await assertDraftRevision(db, input.organizationId, input.revisionId);
  await sql`
    update sizing.size_guide_revisions
    set
      instructions = case when ${input.instructions !== undefined} then ${input.instructions ?? null} else instructions end,
      fit_notes = case when ${input.fitNotes !== undefined} then ${input.fitNotes ?? null} else fit_notes end
    where id = ${input.revisionId} and organization_id = ${input.organizationId}
  `.execute(db);
}

export async function updateMeasurementDefinition(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    id: string;
    name?: string;
    description?: string | null;
    instructions?: string | null;
    sortOrder?: number;
    actorId: string;
  },
): Promise<void> {
  const changed = await sql`
    update sizing.measurement_definitions
    set
      name = coalesce(${input.name ?? null}, name),
      description = case when ${input.description !== undefined} then ${input.description ?? null} else description end,
      instructions = case when ${input.instructions !== undefined} then ${input.instructions ?? null} else instructions end,
      sort_order = coalesce(${input.sortOrder ?? null}, sort_order)
    where id = ${input.id} and organization_id = ${input.organizationId} and status = 'ACTIVE'
  `.execute(db);
  if (Number(changed.numAffectedRows) !== 1)
    throw new SizingDomainError('NOT_FOUND', 'Measurement definition was not found.');
}

export async function updateSizeDefinition(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    id: string;
    label?: string;
    sortOrder?: number;
    actorId: string;
  },
): Promise<void> {
  const changed = await sql`
    update sizing.size_definitions
    set
      label = coalesce(${input.label ?? null}, label),
      sort_order = coalesce(${input.sortOrder ?? null}, sort_order)
    where id = ${input.id} and organization_id = ${input.organizationId} and status = 'ACTIVE'
  `.execute(db);
  if (Number(changed.numAffectedRows) !== 1)
    throw new SizingDomainError('NOT_FOUND', 'Size definition was not found.');
}

export async function updateSizeSystem(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    id: string;
    name?: string;
    regionCode?: string | null;
    actorId: string;
  },
): Promise<void> {
  const changed = await sql`
    update sizing.size_systems
    set
      name = coalesce(${input.name ?? null}, name),
      region_code = case when ${input.regionCode !== undefined} then ${input.regionCode ?? null} else region_code end
    where id = ${input.id} and organization_id = ${input.organizationId} and status = 'ACTIVE'
  `.execute(db);
  if (Number(changed.numAffectedRows) !== 1)
    throw new SizingDomainError('NOT_FOUND', 'Size system was not found.');
}

// ─── Archive operations ────────────────────────────────────────────────────────

export async function archiveSizeGuide(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    // Null out the guide reference on product configs but keep the config (system stays)
    await sql`
      update sizing.product_size_configurations
      set size_guide_id = null
      where size_guide_id = ${input.id} and organization_id = ${input.organizationId}
    `.execute(transaction);
    const changed = await sql`
      update sizing.size_guides
      set status = 'ARCHIVED', updated_at = now(), version = version + 1
      where id = ${input.id} and organization_id = ${input.organizationId} and status = 'ACTIVE'
    `.execute(transaction);
    if (Number(changed.numAffectedRows) !== 1)
      throw new SizingDomainError('NOT_FOUND', 'Size guide was not found.');
    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'ARCHIVED',
      targetType: 'SIZE_GUIDE',
      targetId: input.id,
    });
  });
}

export async function archiveSizeDefinition(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  // Block if any active product option values reference this definition
  const usages = await sql<{ count: string }>`
    select count(*)::text as count
    from catalog.product_option_values
    where size_definition_id = ${input.id} and status = 'ACTIVE'
  `.execute(db);
  if (Number(usages.rows[0]?.count ?? 0) > 0)
    throw new SizingDomainError(
      'VALIDATION_FAILED',
      'This size definition is used by active product option values and cannot be archived.',
    );
  const changed = await sql`
    update sizing.size_definitions
    set status = 'ARCHIVED'
    where id = ${input.id} and organization_id = ${input.organizationId} and status = 'ACTIVE'
  `.execute(db);
  if (Number(changed.numAffectedRows) !== 1)
    throw new SizingDomainError('NOT_FOUND', 'Size definition was not found.');
}

export async function archiveMeasurementDefinition(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  // Block if referenced by any published revision
  const usages = await sql<{ count: string }>`
    select count(*)::text as count
    from sizing.size_guide_measurements m
    join sizing.size_guide_rows r on r.id = m.row_id
    join sizing.size_guide_revisions rev on rev.id = r.revision_id
    where m.measurement_definition_id = ${input.id}
      and rev.status = 'PUBLISHED'
  `.execute(db);
  if (Number(usages.rows[0]?.count ?? 0) > 0)
    throw new SizingDomainError(
      'VALIDATION_FAILED',
      'This measurement definition is referenced by published guide revisions and cannot be archived.',
    );
  const changed = await sql`
    update sizing.measurement_definitions
    set status = 'ARCHIVED'
    where id = ${input.id} and organization_id = ${input.organizationId} and status = 'ACTIVE'
  `.execute(db);
  if (Number(changed.numAffectedRows) !== 1)
    throw new SizingDomainError('NOT_FOUND', 'Measurement definition was not found.');
}

export async function archiveSizeSystem(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  const usages = await sql<{ count: string }>`
    select count(*)::text as count
    from sizing.product_size_configurations
    where size_system_id = ${input.id} and status = 'ACTIVE'
  `.execute(db);
  if (Number(usages.rows[0]?.count ?? 0) > 0)
    throw new SizingDomainError(
      'VALIDATION_FAILED',
      'This size system is used by active product configurations and cannot be archived.',
    );
  const changed = await sql`
    update sizing.size_systems
    set status = 'ARCHIVED'
    where id = ${input.id} and organization_id = ${input.organizationId} and status = 'ACTIVE'
  `.execute(db);
  if (Number(changed.numAffectedRows) !== 1)
    throw new SizingDomainError('NOT_FOUND', 'Size system was not found.');
}

export async function archiveSizingDomain(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  // Block if any active guides or systems reference this domain
  const guideCount = await sql<{ count: string }>`
    select count(*)::text as count from sizing.size_guides
    where sizing_domain_id = ${input.id} and status = 'ACTIVE'
  `.execute(db);
  const systemCount = await sql<{ count: string }>`
    select count(*)::text as count from sizing.size_systems
    where sizing_domain_id = ${input.id} and status = 'ACTIVE'
  `.execute(db);
  if (Number(guideCount.rows[0]?.count ?? 0) > 0 || Number(systemCount.rows[0]?.count ?? 0) > 0)
    throw new SizingDomainError(
      'VALIDATION_FAILED',
      'Archive all size guides and systems under this domain before archiving the domain.',
    );
  const changed = await sql`
    update sizing.sizing_domains
    set status = 'ARCHIVED'
    where id = ${input.id} and organization_id = ${input.organizationId} and status = 'ACTIVE'
  `.execute(db);
  if (Number(changed.numAffectedRows) !== 1)
    throw new SizingDomainError('NOT_FOUND', 'Sizing domain was not found.');
}

// ─── Duplicate guide ───────────────────────────────────────────────────────────

/**
 * Clone a size guide (head) as a new guide with the same domain, with a fresh DRAFT
 * revision populated from the current published revision's rows and measurements.
 * The clone name defaults to "Copy of <original>" but can be overridden.
 */
export async function duplicateSizeGuide(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; name?: string; actorId: string },
): Promise<{ id: string; revisionId: string }> {
  return db.transaction().execute(async (transaction) => {
    const source = await sql<{
      guide_id: string;
      name: string;
      description: string | null;
      sizing_domain_id: string;
      revision_id: string | null;
    }>`
      select g.id as guide_id, g.name, g.description, g.sizing_domain_id::text,
        coalesce(
          g.current_published_revision_id::text,
          (select r.id::text from sizing.size_guide_revisions r where r.size_guide_id = g.id and r.organization_id = ${input.organizationId} order by r.revision_number desc limit 1)
        ) as revision_id
      from sizing.size_guides g
      where g.id = ${input.id} and g.organization_id = ${input.organizationId} and g.status = 'ACTIVE'
    `.execute(transaction);
    const guide = source.rows[0];
    if (!guide) throw new SizingDomainError('NOT_FOUND', 'Size guide was not found.');

    const newName = input.name ?? `Copy of ${guide.name}`;
    const newGuide = await sql<{ id: string }>`
      insert into sizing.size_guides (organization_id, name, description, sizing_domain_id)
      values (${input.organizationId}, ${newName}, ${guide.description ?? null}, ${guide.sizing_domain_id})
      returning id
    `.execute(transaction);
    const newGuideId = newGuide.rows[0]?.id;
    if (!newGuideId) throw new Error('Duplicate guide creation did not return an id.');

    const newRevision = await sql<{ id: string }>`
      insert into sizing.size_guide_revisions (organization_id, size_guide_id, revision_number, created_by)
      values (${input.organizationId}, ${newGuideId}, 1, ${input.actorId})
      returning id
    `.execute(transaction);
    const newRevisionId = newRevision.rows[0]?.id;
    if (!newRevisionId) throw new Error('Duplicate revision creation did not return an id.');

    // Copy rows and measurements from the source published revision if one exists
    if (guide.revision_id) {
      const sourceRows = await sql<{
        id: string;
        display_label: string;
        position: number;
        size_definition_id: string | null;
      }>`
        select id::text, display_label, position, size_definition_id::text
        from sizing.size_guide_rows
        where revision_id = ${guide.revision_id} and organization_id = ${input.organizationId}
        order by position, id
      `.execute(transaction);

      for (const sourceRow of sourceRows.rows) {
        const newRow = await sql<{ id: string }>`
          insert into sizing.size_guide_rows (organization_id, revision_id, size_definition_id, display_label, position)
          values (${input.organizationId}, ${newRevisionId}, ${sourceRow.size_definition_id ?? null}, ${sourceRow.display_label}, ${sourceRow.position})
          returning id
        `.execute(transaction);
        const newRowId = newRow.rows[0]?.id;
        if (!newRowId) continue;

        await sql`
          insert into sizing.size_guide_measurements
            (organization_id, row_id, measurement_definition_id, value_type, value_exact, value_min, value_max, unit_code, is_approximate)
          select ${input.organizationId}, ${newRowId}, measurement_definition_id, value_type, value_exact, value_min, value_max, unit_code, is_approximate
          from sizing.size_guide_measurements
          where row_id = ${sourceRow.id} and organization_id = ${input.organizationId}
        `.execute(transaction);
      }
    }

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'DUPLICATED',
      targetType: 'SIZE_GUIDE',
      targetId: newGuideId,
      metadata: { sourceGuideId: input.id, name: newName },
    });
    return { id: newGuideId, revisionId: newRevisionId };
  });
}

// ─── Product + category sizing ────────────────────────────────────────────────

export async function attachSizeGuideToProduct(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    sizeSystemId: string;
    sizeGuideId?: string;
    actorId: string;
  },
): Promise<void> {
  const targets = await sql<{
    product_id: string;
    system_id: string;
    sizing_domain_id: string;
  }>`
    select product.id as product_id,system.id as system_id,system.sizing_domain_id
    from catalog.products product
    join sizing.size_systems system on system.id=${input.sizeSystemId}
      and system.organization_id=product.organization_id and system.status='ACTIVE'
    where product.id=${input.productId} and product.organization_id=${input.organizationId}
  `.execute(db);
  if (!targets.rows[0])
    throw new SizingDomainError('NOT_FOUND', 'Product or size system was not found.');
  const guide = input.sizeGuideId
    ? await sql<{
        id: string;
      }>`select id from sizing.size_guides where id = ${input.sizeGuideId}
        and organization_id = ${input.organizationId}
        and sizing_domain_id=${targets.rows[0]!.sizing_domain_id}
        and current_published_revision_id is not null`.execute(db)
    : undefined;
  if (input.sizeGuideId && !guide?.rows[0])
    throw new SizingDomainError(
      'VALIDATION_FAILED',
      'Size guide must be published and belong to this organization.',
    );
  await sql`
    insert into sizing.product_size_configurations (organization_id, product_id, size_system_id, size_guide_id)
    values (${input.organizationId}, ${input.productId}, ${input.sizeSystemId}, ${input.sizeGuideId ?? null})
    on conflict (product_id) do update set size_system_id = excluded.size_system_id, size_guide_id = excluded.size_guide_id, status = 'ACTIVE'
  `.execute(db);
  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'PRODUCT_SIZING_SET',
    targetType: 'PRODUCT',
    targetId: input.productId,
    metadata: { sizeSystemId: input.sizeSystemId, sizeGuideId: input.sizeGuideId ?? null },
  });
}

export async function removeProductSizingConfiguration(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; productId: string; actorId: string },
): Promise<void> {
  await sql`
    update sizing.product_size_configurations
    set status = 'ARCHIVED'
    where product_id = ${input.productId} and organization_id = ${input.organizationId} and status = 'ACTIVE'
  `.execute(db);
  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'PRODUCT_SIZING_REMOVED',
    targetType: 'PRODUCT',
    targetId: input.productId,
  });
}

export async function getProductSizingConfiguration(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
): Promise<{
  configured: boolean;
  sizeSystemId: string | null;
  sizeSystemName: string | null;
  sizeGuideId: string | null;
  sizeGuideName: string | null;
  sizeGuideStatus: 'ACTIVE' | 'ARCHIVED' | null;
  hasPublishedGuide: boolean;
  configStatus: 'ACTIVE' | 'ARCHIVED' | null;
}> {
  const result = await sql<{
    size_system_id: string;
    system_name: string;
    size_guide_id: string | null;
    guide_name: string | null;
    guide_status: 'ACTIVE' | 'ARCHIVED' | null;
    has_published_guide: boolean;
    config_status: 'ACTIVE' | 'ARCHIVED';
  }>`
    select
      config.size_system_id::text,
      system.name as system_name,
      config.size_guide_id::text,
      guide.name as guide_name,
      guide.status as guide_status,
      (guide.current_published_revision_id is not null) as has_published_guide,
      config.status as config_status
    from sizing.product_size_configurations config
    join sizing.size_systems system on system.id = config.size_system_id
    left join sizing.size_guides guide on guide.id = config.size_guide_id
    where config.product_id = ${productId} and config.organization_id = ${organizationId}
      and config.status = 'ACTIVE'
  `.execute(db);
  const row = result.rows[0];
  if (!row) return { configured: false, sizeSystemId: null, sizeSystemName: null, sizeGuideId: null, sizeGuideName: null, sizeGuideStatus: null, hasPublishedGuide: false, configStatus: null };
  return {
    configured: true,
    sizeSystemId: row.size_system_id,
    sizeSystemName: row.system_name,
    sizeGuideId: row.size_guide_id,
    sizeGuideName: row.guide_name,
    sizeGuideStatus: row.guide_status,
    hasPublishedGuide: row.has_published_guide,
    configStatus: row.config_status,
  };
}

export async function setCategoryDefaultSizeGuide(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    categoryId: string;
    sizeGuideId: string | null;
    actorId: string;
  },
): Promise<void> {
  if (input.sizeGuideId) {
    const guide = await sql<{ id: string }>`
      select id from sizing.size_guides
      where id = ${input.sizeGuideId} and organization_id = ${input.organizationId} and status = 'ACTIVE'
    `.execute(db);
    if (!guide.rows[0])
      throw new SizingDomainError('NOT_FOUND', 'Size guide was not found or is archived.');
  }
  const changed = await sql`
    update catalog.categories
    set default_size_guide_id = ${input.sizeGuideId ?? null}
    where id = ${input.categoryId} and organization_id = ${input.organizationId}
  `.execute(db);
  if (Number(changed.numAffectedRows) !== 1)
    throw new SizingDomainError('NOT_FOUND', 'Category was not found.');
}

// ─── List queries ──────────────────────────────────────────────────────────────

export interface SizeGuideListItem {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sizingDomainId: string;
  readonly sizingDomainName: string;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly hasPublishedRevision: boolean;
  readonly version: number;
  readonly productCount: number;
  readonly updatedAt: string;
}

export async function listSizeGuides(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    page: number;
    pageSize: number;
    status?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
    domainId?: string;
    search?: string;
  },
): Promise<{ items: readonly SizeGuideListItem[]; totalItems: number }> {
  const offset = (input.page - 1) * input.pageSize;
  const statusFilter = input.status === 'ALL' ? null : (input.status ?? 'ACTIVE');
  const rows = await sql<{
    id: string;
    name: string;
    description: string | null;
    sizing_domain_id: string;
    domain_name: string;
    status: 'ACTIVE' | 'ARCHIVED';
    has_published: boolean;
    version: string;
    product_count: string;
    updated_at: string;
    total: string;
  }>`
    select
      g.id::text, g.name, g.description,
      g.sizing_domain_id::text,
      d.name as domain_name,
      g.status,
      (g.current_published_revision_id is not null) as has_published,
      g.version::text,
      count(distinct psc.product_id)::text as product_count,
      g.updated_at::text,
      count(*) over()::text as total
    from sizing.size_guides g
    join sizing.sizing_domains d on d.id = g.sizing_domain_id
    left join sizing.product_size_configurations psc on psc.size_guide_id = g.id and psc.status = 'ACTIVE'
    where g.organization_id = ${input.organizationId}
      and (${statusFilter}::text is null or g.status = ${statusFilter}::text)
      and (${input.domainId ?? null}::uuid is null or g.sizing_domain_id = ${input.domainId ?? null}::uuid)
      and (${input.search ?? null}::text is null or g.name ilike '%' || ${input.search ?? ''}::text || '%')
    group by g.id, d.name
    order by g.updated_at desc, g.id
    limit ${input.pageSize} offset ${offset}
  `.execute(db);
  return {
    items: rows.rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      sizingDomainId: r.sizing_domain_id,
      sizingDomainName: r.domain_name,
      status: r.status,
      hasPublishedRevision: r.has_published,
      version: Number(r.version),
      productCount: Number(r.product_count),
      updatedAt: r.updated_at,
    })),
    totalItems: Number(rows.rows[0]?.total ?? 0),
  };
}

export interface SizeGuideDetail {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sizingDomainId: string;
  readonly sizingDomainName: string;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly currentPublishedRevisionId: string | null;
  readonly version: number;
  readonly revisions: readonly {
    id: string;
    revisionNumber: number;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    instructions: string | null;
    fitNotes: string | null;
    createdAt: string;
    publishedAt: string | null;
    rows: readonly {
      id: string;
      displayLabel: string;
      position: number;
      sizeDefinitionId: string | null;
      measurements: readonly {
        measurementDefinitionId: string;
        exact: string | null;
        min: string | null;
        max: string | null;
        unit: 'cm' | 'inch';
        approximate: boolean;
      }[];
    }[];
  }[];
  readonly products: readonly { id: string; title: string; handle: string }[];
}

export async function getSizeGuideDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  guideId: string,
): Promise<SizeGuideDetail | null> {
  const [guideResult, revisionsResult, rowsResult, measurementsResult, productsResult] =
    await Promise.all([
      sql<{
        id: string;
        name: string;
        description: string | null;
        sizing_domain_id: string;
        domain_name: string;
        status: 'ACTIVE' | 'ARCHIVED';
        current_published_revision_id: string | null;
        version: string;
      }>`
        select g.id::text, g.name, g.description, g.sizing_domain_id::text,
          d.name as domain_name, g.status, g.current_published_revision_id::text, g.version::text
        from sizing.size_guides g
        join sizing.sizing_domains d on d.id = g.sizing_domain_id
        where g.id = ${guideId} and g.organization_id = ${organizationId}
      `.execute(db),
      sql<{
        id: string;
        revision_number: number;
        status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
        instructions: string | null;
        fit_notes: string | null;
        created_at: string;
        published_at: string | null;
      }>`
        select id::text, revision_number, status, instructions, fit_notes, created_at::text, published_at::text
        from sizing.size_guide_revisions
        where size_guide_id = ${guideId} and organization_id = ${organizationId}
        order by revision_number desc
      `.execute(db),
      sql<{
        id: string;
        revision_id: string;
        display_label: string;
        position: number;
        size_definition_id: string | null;
      }>`
        select r.id::text, r.revision_id::text, r.display_label, r.position, r.size_definition_id::text
        from sizing.size_guide_rows r
        join sizing.size_guide_revisions rev on rev.id = r.revision_id
        where rev.size_guide_id = ${guideId} and r.organization_id = ${organizationId}
        order by r.position, r.id
      `.execute(db),
      sql<{
        row_id: string;
        measurement_definition_id: string;
        value_exact: string | null;
        value_min: string | null;
        value_max: string | null;
        unit_code: 'cm' | 'inch';
        is_approximate: boolean;
      }>`
        select m.row_id::text, m.measurement_definition_id::text,
          m.value_exact::text, m.value_min::text, m.value_max::text, m.unit_code, m.is_approximate
        from sizing.size_guide_measurements m
        join sizing.size_guide_rows r on r.id = m.row_id
        join sizing.size_guide_revisions rev on rev.id = r.revision_id
        where rev.size_guide_id = ${guideId} and m.organization_id = ${organizationId}
      `.execute(db),
      sql<{ id: string; title: string; handle: string }>`
        select p.id::text, p.title, p.handle
        from sizing.product_size_configurations psc
        join catalog.products p on p.id = psc.product_id
        where psc.size_guide_id = ${guideId} and psc.organization_id = ${organizationId} and psc.status = 'ACTIVE'
        order by p.title, p.id
      `.execute(db),
    ]);

  const guide = guideResult.rows[0];
  if (!guide) return null;

  return {
    id: guide.id,
    name: guide.name,
    description: guide.description,
    sizingDomainId: guide.sizing_domain_id,
    sizingDomainName: guide.domain_name,
    status: guide.status,
    currentPublishedRevisionId: guide.current_published_revision_id,
    version: Number(guide.version),
    revisions: revisionsResult.rows.map((rev) => ({
      id: rev.id,
      revisionNumber: rev.revision_number,
      status: rev.status,
      instructions: rev.instructions,
      fitNotes: rev.fit_notes,
      createdAt: rev.created_at,
      publishedAt: rev.published_at,
      rows: rowsResult.rows
        .filter((r) => r.revision_id === rev.id)
        .map((r) => ({
          id: r.id,
          displayLabel: r.display_label,
          position: r.position,
          sizeDefinitionId: r.size_definition_id,
          measurements: measurementsResult.rows
            .filter((m) => m.row_id === r.id)
            .map((m) => ({
              measurementDefinitionId: m.measurement_definition_id,
              exact: m.value_exact,
              min: m.value_min,
              max: m.value_max,
              unit: m.unit_code,
              approximate: m.is_approximate,
            })),
        })),
    })),
    products: productsResult.rows,
  };
}

// ─── Admin workspace (keep for product editor + guide editor) ─────────────────

export interface AdminSizingWorkspace {
  readonly domains: readonly {
    id: string;
    code: string;
    name: string;
    subjectType: 'BODY' | 'GARMENT' | 'PRODUCT';
    status: 'ACTIVE' | 'ARCHIVED';
  }[];
  readonly systems: readonly {
    id: string;
    sizingDomainId: string;
    code: string;
    name: string;
    regionCode: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
  }[];
  readonly sizeDefinitions: readonly {
    id: string;
    sizeSystemId: string;
    code: string;
    label: string;
    sortOrder: number;
  }[];
  readonly measurementDefinitions: readonly {
    id: string;
    sizingDomainId: string;
    code: string;
    name: string;
    description: string | null;
    instructions: string | null;
    sortOrder: number;
    subjectType: 'BODY' | 'GARMENT' | 'PRODUCT';
    defaultUnit: 'cm' | 'inch';
  }[];
  readonly guides: readonly {
    id: string;
    name: string;
    description: string | null;
    sizingDomainId: string;
    status: 'ACTIVE' | 'ARCHIVED';
    currentPublishedRevisionId: string | null;
    version: number;
    revisions: readonly {
      id: string;
      revisionNumber: number;
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      instructions: string | null;
      fitNotes: string | null;
      createdAt: string;
      publishedAt: string | null;
      rows: readonly {
        id: string;
        displayLabel: string;
        position: number;
        sizeDefinitionId: string | null;
        measurements: readonly {
          measurementDefinitionId: string;
          exact: string | null;
          min: string | null;
          max: string | null;
          unit: 'cm' | 'inch';
          approximate: boolean;
        }[];
      }[];
    }[];
  }[];
  readonly productConfigurations: readonly {
    productId: string;
    productTitle: string;
    sizeSystemId: string;
    sizeGuideId: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
  }[];
}

/** Complete tenant-scoped Admin read model, deliberately returning labels with opaque IDs. */
export async function getAdminSizingWorkspace(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<AdminSizingWorkspace> {
  const [domains, systems, definitions, measurements, guides, revisions, rows, values, configs] =
    await Promise.all([
      sql<{
        id: string;
        code: string;
        name: string;
        subject_type: AdminSizingWorkspace['domains'][number]['subjectType'];
        status: AdminSizingWorkspace['domains'][number]['status'];
      }>`
        select id::text,code,name,subject_type,status from sizing.sizing_domains
        where organization_id=${organizationId} order by name,id
      `.execute(db),
      sql<{
        id: string;
        sizing_domain_id: string;
        code: string;
        name: string;
        region_code: string | null;
        status: AdminSizingWorkspace['systems'][number]['status'];
      }>`
        select id::text,sizing_domain_id::text,code,name,region_code,status from sizing.size_systems
        where organization_id=${organizationId} order by name,id
      `.execute(db),
      sql<{ id: string; size_system_id: string; code: string; label: string; sort_order: number }>`
        select id::text,size_system_id::text,code,label,sort_order from sizing.size_definitions
        where organization_id=${organizationId} and status='ACTIVE' order by sort_order,label,id
      `.execute(db),
      sql<{
        id: string;
        sizing_domain_id: string;
        code: string;
        name: string;
        description: string | null;
        instructions: string | null;
        sort_order: number;
        subject_type: AdminSizingWorkspace['measurementDefinitions'][number]['subjectType'];
        default_unit: 'cm' | 'inch';
      }>`
        select id::text,sizing_domain_id::text,code,name,description,instructions,sort_order,subject_type,default_unit
        from sizing.measurement_definitions where organization_id=${organizationId} and status='ACTIVE'
        order by sort_order,name,id
      `.execute(db),
      sql<{
        id: string;
        name: string;
        description: string | null;
        sizing_domain_id: string;
        status: AdminSizingWorkspace['guides'][number]['status'];
        current_published_revision_id: string | null;
        version: string;
      }>`
        select id::text,name,description,sizing_domain_id::text,status,current_published_revision_id::text,version::text
        from sizing.size_guides where organization_id=${organizationId} order by updated_at desc,id
      `.execute(db),
      sql<{
        id: string;
        size_guide_id: string;
        revision_number: number;
        status: AdminSizingWorkspace['guides'][number]['revisions'][number]['status'];
        instructions: string | null;
        fit_notes: string | null;
        created_at: string;
        published_at: string | null;
      }>`
        select id::text,size_guide_id::text,revision_number,status,instructions,fit_notes,created_at::text,published_at::text
        from sizing.size_guide_revisions where organization_id=${organizationId}
        order by revision_number desc,id
      `.execute(db),
      sql<{
        id: string;
        revision_id: string;
        display_label: string;
        position: number;
        size_definition_id: string | null;
      }>`
        select id::text,revision_id::text,display_label,position,size_definition_id::text
        from sizing.size_guide_rows where organization_id=${organizationId} order by position,id
      `.execute(db),
      sql<{
        row_id: string;
        measurement_definition_id: string;
        value_exact: string | null;
        value_min: string | null;
        value_max: string | null;
        unit_code: 'cm' | 'inch';
        is_approximate: boolean;
      }>`
        select row_id::text,measurement_definition_id::text,value_exact::text,value_min::text,value_max::text,unit_code,is_approximate
        from sizing.size_guide_measurements where organization_id=${organizationId}
      `.execute(db),
      sql<{
        product_id: string;
        product_title: string;
        size_system_id: string;
        size_guide_id: string | null;
        status: AdminSizingWorkspace['productConfigurations'][number]['status'];
      }>`
        select config.product_id::text,product.title as product_title,config.size_system_id::text,
          config.size_guide_id::text,config.status
        from sizing.product_size_configurations config
        join catalog.products product on product.id=config.product_id and product.organization_id=config.organization_id
        where config.organization_id=${organizationId} order by product.title,product.id
      `.execute(db),
    ]);

  return {
    domains: domains.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      subjectType: row.subject_type,
      status: row.status,
    })),
    systems: systems.rows.map((row) => ({
      id: row.id,
      sizingDomainId: row.sizing_domain_id,
      code: row.code,
      name: row.name,
      regionCode: row.region_code,
      status: row.status,
    })),
    sizeDefinitions: definitions.rows.map((row) => ({
      id: row.id,
      sizeSystemId: row.size_system_id,
      code: row.code,
      label: row.label,
      sortOrder: row.sort_order,
    })),
    measurementDefinitions: measurements.rows.map((row) => ({
      id: row.id,
      sizingDomainId: row.sizing_domain_id,
      code: row.code,
      name: row.name,
      description: row.description,
      instructions: row.instructions,
      sortOrder: row.sort_order,
      subjectType: row.subject_type,
      defaultUnit: row.default_unit,
    })),
    guides: guides.rows.map((guide) => ({
      id: guide.id,
      name: guide.name,
      description: guide.description,
      sizingDomainId: guide.sizing_domain_id,
      status: guide.status,
      currentPublishedRevisionId: guide.current_published_revision_id,
      version: Number(guide.version),
      revisions: revisions.rows
        .filter((revision) => revision.size_guide_id === guide.id)
        .map((revision) => ({
          id: revision.id,
          revisionNumber: revision.revision_number,
          status: revision.status,
          instructions: revision.instructions,
          fitNotes: revision.fit_notes,
          createdAt: revision.created_at,
          publishedAt: revision.published_at,
          rows: rows.rows
            .filter((row) => row.revision_id === revision.id)
            .map((row) => ({
              id: row.id,
              displayLabel: row.display_label,
              position: row.position,
              sizeDefinitionId: row.size_definition_id,
              measurements: values.rows
                .filter((value) => value.row_id === row.id)
                .map((value) => ({
                  measurementDefinitionId: value.measurement_definition_id,
                  exact: value.value_exact,
                  min: value.value_min,
                  max: value.value_max,
                  unit: value.unit_code,
                  approximate: value.is_approximate,
                })),
            })),
        })),
    })),
    productConfigurations: configs.rows.map((row) => ({
      productId: row.product_id,
      productTitle: row.product_title,
      sizeSystemId: row.size_system_id,
      sizeGuideId: row.size_guide_id,
      status: row.status,
    })),
  };
}

// ─── Data quality checks ───────────────────────────────────────────────────────

export interface SizingQualityChecks {
  readonly productsWithSizeAxisButNoSizingConfig: number;
  readonly productsWithConfigButNoPublishedGuide: number;
  readonly productsUsingArchivedGuide: number;
  readonly publishedRevisionsWithEmptyRows: number;
  readonly optionValuesInSizeAxisWithoutSizeDefinitionLink: number;
}

export async function getSizingQualityChecks(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<SizingQualityChecks> {
  const [noConfig, noGuide, archivedGuide, emptyRevisions, unlinkedValues] = await Promise.all([
    // Products with a "size" option axis but no product_size_configuration
    sql<{ count: string }>`
      select count(distinct p.id)::text as count
      from catalog.products p
      join catalog.product_option_axes a on a.product_id = p.id and a.organization_id = p.organization_id and a.status = 'ACTIVE'
      where p.organization_id = ${organizationId}
        and lower(a.code) like '%size%'
        and not exists (
          select 1 from sizing.product_size_configurations psc
          where psc.product_id = p.id and psc.status = 'ACTIVE'
        )
    `.execute(db),
    // Products with config but guide not assigned or not published
    sql<{ count: string }>`
      select count(*)::text as count
      from sizing.product_size_configurations psc
      where psc.organization_id = ${organizationId} and psc.status = 'ACTIVE'
        and (psc.size_guide_id is null or not exists (
          select 1 from sizing.size_guides g
          where g.id = psc.size_guide_id and g.current_published_revision_id is not null
        ))
    `.execute(db),
    // Products referencing an archived guide
    sql<{ count: string }>`
      select count(*)::text as count
      from sizing.product_size_configurations psc
      join sizing.size_guides g on g.id = psc.size_guide_id
      where psc.organization_id = ${organizationId} and psc.status = 'ACTIVE' and g.status = 'ARCHIVED'
    `.execute(db),
    // Published revisions with no measurement values
    sql<{ count: string }>`
      select count(distinct rev.id)::text as count
      from sizing.size_guide_revisions rev
      where rev.organization_id = ${organizationId} and rev.status = 'PUBLISHED'
        and not exists (
          select 1 from sizing.size_guide_rows r
          join sizing.size_guide_measurements m on m.row_id = r.id
          where r.revision_id = rev.id
        )
    `.execute(db),
    // Size option values not linked to a size_definition
    sql<{ count: string }>`
      select count(distinct v.id)::text as count
      from catalog.product_option_values v
      join catalog.product_option_axes a on a.id = v.option_axis_id
      where v.organization_id = ${organizationId}
        and v.status = 'ACTIVE'
        and lower(a.code) like '%size%'
        and v.size_definition_id is null
    `.execute(db),
  ]);

  return {
    productsWithSizeAxisButNoSizingConfig: Number(noConfig.rows[0]?.count ?? 0),
    productsWithConfigButNoPublishedGuide: Number(noGuide.rows[0]?.count ?? 0),
    productsUsingArchivedGuide: Number(archivedGuide.rows[0]?.count ?? 0),
    publishedRevisionsWithEmptyRows: Number(emptyRevisions.rows[0]?.count ?? 0),
    optionValuesInSizeAxisWithoutSizeDefinitionLink: Number(unlinkedValues.rows[0]?.count ?? 0),
  };
}

// ─── Storefront public guide ───────────────────────────────────────────────────

export interface PublicSizeGuide {
  readonly name: string;
  readonly instructions: string | null;
  readonly fitNotes: string | null;
  readonly rows: readonly {
    label: string;
    measurements: readonly {
      name: string;
      instructions: string | null;
      exact?: string;
      min?: string;
      max?: string;
      unit: string;
      approximate: boolean;
    }[];
  }[];
}

/**
 * Returns the customer-facing size guide for a product.
 * Priority: product's own guide → primary category's default guide → null.
 */
export async function getPublicSizeGuideForProduct(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
): Promise<PublicSizeGuide | null> {
  // Single query: try product's own guide first, then fall back to primary category default
  const guide = await sql<{
    guide_id: string;
    name: string;
    revision_id: string;
    instructions: string | null;
    fit_notes: string | null;
  }>`
    select guide.id as guide_id, guide.name, revision.id as revision_id,
      revision.instructions, revision.fit_notes
    from sizing.product_size_configurations configuration
    join sizing.size_guides guide on guide.id = configuration.size_guide_id
    join sizing.size_guide_revisions revision on revision.id = guide.current_published_revision_id
    where configuration.organization_id = ${organizationId}
      and configuration.product_id = ${productId}
      and configuration.status = 'ACTIVE'
      and revision.status = 'PUBLISHED'
    union all
    -- Category default fallback: used when product has no guide
    select guide.id as guide_id, guide.name, revision.id as revision_id,
      revision.instructions, revision.fit_notes
    from (
      select coalesce(p.primary_category_id, pc.category_id) as category_id
      from catalog.products p
      left join catalog.product_categories pc on pc.product_id = p.id and pc.organization_id = ${organizationId}
      where p.id = ${productId} and p.organization_id = ${organizationId}
      limit 1
    ) prod_cat
    join catalog.categories cat on cat.id = prod_cat.category_id
    join sizing.size_guides guide on guide.id = cat.default_size_guide_id
    join sizing.size_guide_revisions revision on revision.id = guide.current_published_revision_id
    where guide.organization_id = ${organizationId}
      and guide.status = 'ACTIVE'
      and revision.status = 'PUBLISHED'
      -- Exclude products that already have a product-level guide (handled above)
      and not exists (
        select 1 from sizing.product_size_configurations psc
        where psc.product_id = ${productId}
          and psc.size_guide_id is not null
          and psc.status = 'ACTIVE'
      )
    limit 1
  `.execute(db);

  const row = guide.rows[0];
  if (!row) return null;

  const records = await sql<{
    row_id: string;
    label: string;
    name: string;
    instructions: string | null;
    value_exact: string | null;
    value_min: string | null;
    value_max: string | null;
    unit_code: string;
    is_approximate: boolean;
  }>`
    select size_row.id as row_id, size_row.display_label as label,
      definition.name, definition.instructions,
      measurement.value_exact::text, measurement.value_min::text, measurement.value_max::text,
      measurement.unit_code, measurement.is_approximate
    from sizing.size_guide_rows size_row
    join sizing.size_guide_measurements measurement on measurement.row_id = size_row.id
    join sizing.measurement_definitions definition on definition.id = measurement.measurement_definition_id
    where size_row.revision_id = ${row.revision_id}
    order by size_row.position, size_row.id, definition.sort_order, definition.name
  `.execute(db);

  const sizeRows = new Map<
    string,
    {
      label: string;
      measurements: {
        name: string;
        instructions: string | null;
        exact?: string;
        min?: string;
        max?: string;
        unit: string;
        approximate: boolean;
      }[];
    }
  >();
  for (const measurement of records.rows) {
    const current = sizeRows.get(measurement.row_id) ?? { label: measurement.label, measurements: [] };
    current.measurements.push({
      name: measurement.name,
      instructions: measurement.instructions,
      ...(measurement.value_exact ? { exact: measurement.value_exact } : {}),
      ...(measurement.value_min ? { min: measurement.value_min } : {}),
      ...(measurement.value_max ? { max: measurement.value_max } : {}),
      unit: measurement.unit_code,
      approximate: measurement.is_approximate,
    });
    sizeRows.set(measurement.row_id, current);
  }

  return {
    name: row.name,
    instructions: row.instructions,
    fitNotes: row.fit_notes,
    rows: [...sizeRows.values()],
  };
}

// ─── Category defaults & Option Value Mapping ───────────────────────────────────

export interface CategorySizeGuideDefaultItem {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categoryPath: string;
  readonly sizeGuideId: string | null;
  readonly sizeGuideName: string | null;
}

export async function listCategorySizeGuideDefaults(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly CategorySizeGuideDefaultItem[]> {
  const result = await sql<{
    category_id: string;
    category_name: string;
    category_path: string;
    size_guide_id: string | null;
    size_guide_name: string | null;
  }>`
    with recursive tree as (
      select id, name, handle, parent_category_id, ('/' || handle) as path
      from catalog.categories
      where organization_id = ${organizationId} and parent_category_id is null and status != 'ARCHIVED'
      union all
      select child.id, child.name, child.handle, child.parent_category_id,
        (tree.path || '/' || child.handle) as path
      from catalog.categories child
      join tree on tree.id = child.parent_category_id
      where child.organization_id = ${organizationId} and child.status != 'ARCHIVED'
    )
    select c.id as category_id,
      c.name as category_name,
      coalesce(tree.path, '/' || c.handle) as category_path,
      c.default_size_guide_id as size_guide_id,
      g.name as size_guide_name
    from catalog.categories c
    left join tree on tree.id = c.id
    left join sizing.size_guides g on g.id = c.default_size_guide_id and g.organization_id = ${organizationId}
    where c.organization_id = ${organizationId} and c.status != 'ARCHIVED'
    order by category_path, c.name
  `.execute(db);
  return result.rows.map((row) => ({
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryPath: row.category_path,
    sizeGuideId: row.size_guide_id,
    sizeGuideName: row.size_guide_name,
  }));
}

export interface SizeOptionValueMappingItem {
  readonly optionValueId: string;
  readonly optionValueLabel: string;
  readonly optionAxisName: string;
  readonly productTitle: string;
  readonly productId: string;
  readonly sizeDefinitionId: string | null;
  readonly sizeDefinitionLabel: string | null;
}

export async function listSizeOptionValuesWithMapping(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly SizeOptionValueMappingItem[]> {
  const result = await sql<{
    option_value_id: string;
    option_value_label: string;
    option_axis_name: string;
    product_title: string;
    product_id: string;
    size_definition_id: string | null;
    size_definition_label: string | null;
  }>`
    select v.id as option_value_id, v.display_value as option_value_label,
      a.name as option_axis_name, p.title as product_title, p.id as product_id,
      v.size_definition_id, d.label as size_definition_label
    from catalog.product_option_values v
    join catalog.product_option_axes a on a.id = v.option_axis_id
    join catalog.products p on p.id = a.product_id
    left join sizing.size_definitions d on d.id = v.size_definition_id
    where v.organization_id = ${organizationId}
      and v.status = 'ACTIVE'
      and lower(a.code) like '%size%'
    order by p.title, a.name, v.position, v.display_value
  `.execute(db);
  return result.rows.map((row) => ({
    optionValueId: row.option_value_id,
    optionValueLabel: row.option_value_label,
    optionAxisName: row.option_axis_name,
    productTitle: row.product_title,
    productId: row.product_id,
    sizeDefinitionId: row.size_definition_id,
    sizeDefinitionLabel: row.size_definition_label,
  }));
}

export async function linkOptionValueToSizeDefinition(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    optionValueId: string;
    sizeDefinitionId: string | null;
    actorId: string;
  },
): Promise<void> {
  if (input.sizeDefinitionId) {
    const def = await sql<{ id: string }>`
      select id from sizing.size_definitions
      where id = ${input.sizeDefinitionId} and organization_id = ${input.organizationId} and status = 'ACTIVE'
    `.execute(db);
    if (!def.rows[0])
      throw new SizingDomainError('NOT_FOUND', 'Size definition was not found or is archived.');
  }

  const updated = await sql`
    update catalog.product_option_values
    set size_definition_id = ${input.sizeDefinitionId ?? null}
    where id = ${input.optionValueId} and organization_id = ${input.organizationId}
  `.execute(db);
  if (Number(updated.numAffectedRows) !== 1)
    throw new SizingDomainError('NOT_FOUND', 'Product option value was not found.');
}
