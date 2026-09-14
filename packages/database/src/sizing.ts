import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';

export type SizingDomainErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'VERSION_CONFLICT'
  | 'CONFLICT'
  | 'DEPENDENCY_EXISTS'
  | 'PUBLISHED_REVISION_IMMUTABLE'
  | 'INVALID_STATE'
  | 'DOMAIN_MISMATCH'
  | 'SYSTEM_MISMATCH'
  | 'ALREADY_PUBLISHED'
  | 'ARCHIVED'
  | 'DRAFT_ALREADY_EXISTS';

export class SizingDomainError extends Error {
  public readonly code: SizingDomainErrorCode;

  public constructor(code: SizingDomainErrorCode, message: string) {
    super(message);
    this.name = 'SizingDomainError';
    this.code = code;
  }
}

type SubjectType = 'BODY' | 'GARMENT' | 'PRODUCT';
export type MeasurementUnit = 'cm' | 'inch' | 'kg';

function withSizingTransaction<T>(
  db: Kysely<DatabaseSchema>,
  callback: (trx: Kysely<DatabaseSchema>) => Promise<T>,
): Promise<T> {
  if ('isTransaction' in db && (db as { isTransaction?: boolean }).isTransaction) {
    return callback(db);
  }
  return db.transaction().execute(callback);
}
type LifecycleStatus = 'ACTIVE' | 'ARCHIVED';
type RevisionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

type RevisionMutationContext = {
  revisionId: string;
  revisionVersion: number;
  guideId: string;
  guideDomainId: string;
  guideSizeSystemId: string | null;
};

async function resolveIamActorId(
  db: Kysely<DatabaseSchema>,
  actorId?: string | null,
): Promise<string | null> {
  if (!actorId || actorId === '00000000-0000-0000-0000-000000000000') {
    return null;
  }
  const result = await sql<{ id: string }>`
    select id::text from iam.users where id = ${actorId} limit 1
  `.execute(db);
  return result.rows[0]?.id ?? null;
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
    insert into audit.audit_events (
      organization_id,
      actor_type,
      actor_id,
      action,
      target_type,
      target_id,
      metadata
    )
    values (
      ${input.organizationId},
      ${input.actorId ? 'USER' : 'SYSTEM'},
      ${input.actorId ?? null},
      ${input.action},
      ${input.targetType},
      ${input.targetId}::uuid,
      ${input.metadata ? JSON.stringify(input.metadata) : null}
    )
  `.execute(db);
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function numberFromDatabase(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

function assertExpectedVersion(
  actualVersion: number,
  expectedVersion: number,
  resourceName: string,
): void {
  if (actualVersion !== expectedVersion) {
    throw new SizingDomainError(
      'VERSION_CONFLICT',
      `${resourceName} has changed since it was loaded. Refresh and try again.`,
    );
  }
}

function isValidMeasurementValue(value: string): boolean {
  return /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/.test(value);
}

function validateMeasurementPayload(input: {
  exact?: string | undefined;
  min?: string | undefined;
  max?: string | undefined;
}): 'EXACT' | 'RANGE' {
  const hasExact = input.exact !== undefined;
  const hasMin = input.min !== undefined;
  const hasMax = input.max !== undefined;
  const hasRange = hasMin || hasMax;

  if (hasExact && hasRange) {
    throw new SizingDomainError(
      'VALIDATION_ERROR',
      'A measurement must use either one exact value or one min/max range, not both.',
    );
  }

  if (!hasExact && !hasRange) {
    throw new SizingDomainError(
      'VALIDATION_ERROR',
      'A measurement needs one exact value or a complete min/max range.',
    );
  }

  if (hasRange && (!hasMin || !hasMax)) {
    throw new SizingDomainError(
      'VALIDATION_ERROR',
      'A range measurement requires both min and max values.',
    );
  }

  const values = [input.exact, input.min, input.max].filter(
    (value): value is string => value !== undefined,
  );

  if (values.some((value) => !isValidMeasurementValue(value))) {
    throw new SizingDomainError(
      'VALIDATION_ERROR',
      'Measurement values must be non-negative decimal numbers with at most three decimal places.',
    );
  }

  if (hasRange && Number(input.min) > Number(input.max)) {
    throw new SizingDomainError(
      'VALIDATION_ERROR',
      'Measurement min cannot be greater than measurement max.',
    );
  }

  return hasExact ? 'EXACT' : 'RANGE';
}

async function lockActiveGuide(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  guideId: string,
): Promise<{
  id: string;
  sizingDomainId: string;
  sizeSystemId: string | null;
  currentPublishedRevisionId: string | null;
  version: number;
}> {
  const result = await sql<{
    id: string;
    sizing_domain_id: string;
    size_system_id: string | null;
    current_published_revision_id: string | null;
    version: string | number;
  }>`
    select
      id::text,
      sizing_domain_id::text,
      size_system_id::text,
      current_published_revision_id::text,
      version
    from sizing.size_guides
    where id = ${guideId}
      and organization_id = ${organizationId}
      and status = 'ACTIVE'
    for update
  `.execute(db);

  const row = result.rows[0];
  if (!row) {
    throw new SizingDomainError('NOT_FOUND', 'Size guide was not found.');
  }

  return {
    id: row.id,
    sizingDomainId: row.sizing_domain_id,
    sizeSystemId: row.size_system_id,
    currentPublishedRevisionId: row.current_published_revision_id,
    version: numberFromDatabase(row.version),
  };
}

async function lockDraftRevision(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  revisionId: string,
  expectedVersion: number,
): Promise<RevisionMutationContext> {
  const result = await sql<{
    revision_id: string;
    revision_status: RevisionStatus;
    revision_version: string | number;
    guide_id: string;
    guide_status: LifecycleStatus;
    sizing_domain_id: string;
    size_system_id: string | null;
  }>`
    select
      revision.id::text as revision_id,
      revision.status as revision_status,
      revision.version as revision_version,
      guide.id::text as guide_id,
      guide.status as guide_status,
      guide.sizing_domain_id::text,
      guide.size_system_id::text
    from sizing.size_guide_revisions revision
    join sizing.size_guides guide
      on guide.id = revision.size_guide_id
     and guide.organization_id = revision.organization_id
    where revision.id = ${revisionId}
      and revision.organization_id = ${organizationId}
    for update of revision
  `.execute(db);

  const row = result.rows[0];
  if (!row) {
    throw new SizingDomainError('NOT_FOUND', 'Size guide revision was not found.');
  }

  if (row.guide_status !== 'ACTIVE') {
    throw new SizingDomainError(
      'ARCHIVED',
      'The size guide is archived and cannot be edited.',
    );
  }

  if (row.revision_status !== 'DRAFT') {
    throw new SizingDomainError(
      'PUBLISHED_REVISION_IMMUTABLE',
      'Published or archived guide revisions are immutable. Create a new draft revision.',
    );
  }

  const revisionVersion = numberFromDatabase(row.revision_version);
  assertExpectedVersion(revisionVersion, expectedVersion, 'Size guide revision');

  return {
    revisionId: row.revision_id,
    revisionVersion,
    guideId: row.guide_id,
    guideDomainId: row.sizing_domain_id,
    guideSizeSystemId: row.size_system_id,
  };
}

async function bumpRevisionVersion(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  revisionId: string,
): Promise<number> {
  const result = await sql<{ version: string | number }>`
    update sizing.size_guide_revisions
    set version = version + 1
    where id = ${revisionId}
      and organization_id = ${organizationId}
    returning version
  `.execute(db);

  const row = result.rows[0];
  if (!row) {
    throw new SizingDomainError('NOT_FOUND', 'Size guide revision was not found.');
  }

  return numberFromDatabase(row.version);
}

async function assertActiveSystemBelongsToDomain(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    sizeSystemId: string;
    sizingDomainId: string;
  },
): Promise<void> {
  const result = await sql<{ id: string }>`
    select id::text
    from sizing.size_systems
    where id = ${input.sizeSystemId}
      and organization_id = ${input.organizationId}
      and sizing_domain_id = ${input.sizingDomainId}
      and status = 'ACTIVE'
  `.execute(db);

  if (!result.rows[0]) {
    throw new SizingDomainError(
      'SYSTEM_MISMATCH',
      'The selected size system is archived, missing, or belongs to a different sizing domain.',
    );
  }
}

async function assertSizeDefinitionAvailableForGuide(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    sizeDefinitionId: string;
    guideDomainId: string;
    guideSizeSystemId: string | null;
  },
): Promise<void> {
  const definition = await sql<{
    id: string;
    size_system_id: string;
    sizing_domain_id: string;
  }>`
    select
      definition.id::text,
      definition.size_system_id::text,
      system.sizing_domain_id::text
    from sizing.size_definitions definition
    join sizing.size_systems system
      on system.id = definition.size_system_id
     and system.organization_id = definition.organization_id
    where definition.id = ${input.sizeDefinitionId}
      and definition.organization_id = ${input.organizationId}
      and definition.status = 'ACTIVE'
      and system.status = 'ACTIVE'
  `.execute(db);

  const row = definition.rows[0];
  if (!row) {
    throw new SizingDomainError(
      'NOT_FOUND',
      'Size definition was not found or is archived.',
    );
  }

  if (row.sizing_domain_id !== input.guideDomainId) {
    throw new SizingDomainError(
      'DOMAIN_MISMATCH',
      'The size definition belongs to a different sizing domain.',
    );
  }

  if (!input.guideSizeSystemId) {
    throw new SizingDomainError(
      'SYSTEM_MISMATCH',
      'This guide is not bound to a size system. Bind a size system before mapping rows to size definitions.',
    );
  }

  if (row.size_system_id !== input.guideSizeSystemId) {
    throw new SizingDomainError(
      'SYSTEM_MISMATCH',
      'The size definition belongs to a different size system than this guide.',
    );
  }
}

async function assertMeasurementDefinitionAvailableForGuide(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    measurementDefinitionId: string;
    guideDomainId: string;
  },
): Promise<void> {
  const definition = await sql<{ id: string }>`
    select id::text
    from sizing.measurement_definitions
    where id = ${input.measurementDefinitionId}
      and organization_id = ${input.organizationId}
      and sizing_domain_id = ${input.guideDomainId}
      and status = 'ACTIVE'
  `.execute(db);

  if (!definition.rows[0]) {
    throw new SizingDomainError(
      'DOMAIN_MISMATCH',
      'The measurement definition is archived, missing, or belongs to a different sizing domain.',
    );
  }
}

async function assertRowBelongsToRevision(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    rowId: string;
  },
): Promise<void> {
  const row = await sql<{ id: string }>`
    select id::text
    from sizing.size_guide_rows
    where id = ${input.rowId}
      and revision_id = ${input.revisionId}
      and organization_id = ${input.organizationId}
  `.execute(db);

  if (!row.rows[0]) {
    throw new SizingDomainError(
      'NOT_FOUND',
      'Size guide row was not found in this revision.',
    );
  }
}

async function setMeasurementInternal(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    rowId: string;
    guideDomainId: string;
    measurementDefinitionId: string;
    unitCode: MeasurementUnit;
    exact?: string | undefined;
    min?: string | undefined;
    max?: string | undefined;
    isApproximate?: boolean | undefined;
  },
): Promise<void> {
  await assertRowBelongsToRevision(db, {
    organizationId: input.organizationId,
    revisionId: input.revisionId,
    rowId: input.rowId,
  });

  await assertMeasurementDefinitionAvailableForGuide(db, {
    organizationId: input.organizationId,
    measurementDefinitionId: input.measurementDefinitionId,
    guideDomainId: input.guideDomainId,
  });

  const valueType = validateMeasurementPayload(input);

  await sql`
    insert into sizing.size_guide_measurements (
      organization_id,
      row_id,
      measurement_definition_id,
      value_type,
      value_exact,
      value_min,
      value_max,
      unit_code,
      is_approximate
    )
    values (
      ${input.organizationId},
      ${input.rowId},
      ${input.measurementDefinitionId},
      ${valueType},
      ${input.exact ?? null},
      ${input.min ?? null},
      ${input.max ?? null},
      ${input.unitCode},
      ${input.isApproximate ?? false}
    )
    on conflict (row_id, measurement_definition_id)
    do update set
      value_type = excluded.value_type,
      value_exact = excluded.value_exact,
      value_min = excluded.value_min,
      value_max = excluded.value_max,
      unit_code = excluded.unit_code,
      is_approximate = excluded.is_approximate
  `.execute(db);
}

async function removeMeasurementInternal(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    rowId: string;
    measurementDefinitionId: string;
    requireExisting?: boolean | undefined;
  },
): Promise<void> {
  await assertRowBelongsToRevision(db, {
    organizationId: input.organizationId,
    revisionId: input.revisionId,
    rowId: input.rowId,
  });

  const deleted = await sql`
    delete from sizing.size_guide_measurements
    where organization_id = ${input.organizationId}
      and row_id = ${input.rowId}
      and measurement_definition_id = ${input.measurementDefinitionId}
  `.execute(db);

  if (input.requireExisting && Number(deleted.numAffectedRows) !== 1) {
    throw new SizingDomainError('NOT_FOUND', 'Size guide measurement was not found.');
  }
}

async function lockProductForSizingMutation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    expectedProductVersion?: number | undefined;
  },
): Promise<{ version: number }> {
  const product = await sql<{ version: string | number }>`
    select version
    from catalog.products
    where id = ${input.productId}
      and organization_id = ${input.organizationId}
    for update
  `.execute(db);

  const row = product.rows[0];
  if (!row) {
    throw new SizingDomainError('NOT_FOUND', 'Product was not found.');
  }

  const version = numberFromDatabase(row.version);
  if (input.expectedProductVersion !== undefined) {
    assertExpectedVersion(version, input.expectedProductVersion, 'Product');
  }

  return { version };
}

async function bumpProductVersion(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
): Promise<void> {
  await sql`
    update catalog.products
    set version = version + 1,
        updated_at = now()
    where id = ${productId}
      and organization_id = ${organizationId}
  `.execute(db);
}

// ─── Create operations ─────────────────────────────────────────────────────────

export async function createSizingDomain(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    code: string;
    name: string;
    subjectType: SubjectType;
    actorId?: string;
  },
): Promise<{ id: string }> {
  const result = await sql<{ id: string }>`
    insert into sizing.sizing_domains (
      organization_id,
      code,
      name,
      subject_type
    )
    values (
      ${input.organizationId},
      ${input.code},
      ${input.name},
      ${input.subjectType}
    )
    returning id::text
  `.execute(db);

  const row = result.rows[0];
  if (!row) {
    throw new Error('Sizing domain creation did not return an id.');
  }

  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId ?? null,
    action: 'CREATED',
    targetType: 'SIZING_DOMAIN',
    targetId: row.id,
    metadata: {
      code: input.code,
      name: input.name,
      subjectType: input.subjectType,
    },
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
    insert into sizing.size_systems (
      organization_id,
      sizing_domain_id,
      code,
      name,
      region_code
    )
    select
      ${input.organizationId},
      domain.id,
      ${input.code},
      ${input.name},
      ${input.regionCode ?? null}
    from sizing.sizing_domains domain
    where domain.id = ${input.sizingDomainId}
      and domain.organization_id = ${input.organizationId}
      and domain.status = 'ACTIVE'
    returning id::text
  `.execute(db);

  const row = result.rows[0];
  if (!row) {
    throw new SizingDomainError('NOT_FOUND', 'Active sizing domain was not found.');
  }

  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId ?? null,
    action: 'CREATED',
    targetType: 'SIZE_SYSTEM',
    targetId: row.id,
    metadata: {
      sizingDomainId: input.sizingDomainId,
      code: input.code,
      name: input.name,
      regionCode: input.regionCode ?? null,
    },
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
    insert into sizing.size_definitions (
      organization_id,
      size_system_id,
      code,
      label,
      sort_order
    )
    select
      ${input.organizationId},
      system.id,
      ${input.code},
      ${input.label},
      ${input.sortOrder ?? 0}
    from sizing.size_systems system
    where system.id = ${input.sizeSystemId}
      and system.organization_id = ${input.organizationId}
      and system.status = 'ACTIVE'
    returning id::text
  `.execute(db);

  const row = result.rows[0];
  if (!row) {
    throw new SizingDomainError('NOT_FOUND', 'Active size system was not found.');
  }

  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId ?? null,
    action: 'CREATED',
    targetType: 'SIZE_DEFINITION',
    targetId: row.id,
    metadata: {
      sizeSystemId: input.sizeSystemId,
      code: input.code,
      label: input.label,
      sortOrder: input.sortOrder ?? 0,
    },
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
    subjectType: SubjectType;
    defaultUnit: MeasurementUnit;
    description?: string;
    instructions?: string;
    sortOrder?: number;
    actorId?: string;
  },
): Promise<{ id: string }> {
  const result = await sql<{ id: string }>`
    insert into sizing.measurement_definitions (
      organization_id,
      sizing_domain_id,
      code,
      name,
      description,
      instructions,
      sort_order,
      subject_type,
      default_unit
    )
    select
      ${input.organizationId},
      domain.id,
      ${input.code},
      ${input.name},
      ${input.description ?? null},
      ${input.instructions ?? null},
      ${input.sortOrder ?? 0},
      ${input.subjectType},
      ${input.defaultUnit}
    from sizing.sizing_domains domain
    where domain.id = ${input.sizingDomainId}
      and domain.organization_id = ${input.organizationId}
      and domain.status = 'ACTIVE'
    returning id::text
  `.execute(db);

  const row = result.rows[0];
  if (!row) {
    throw new SizingDomainError('NOT_FOUND', 'Active sizing domain was not found.');
  }

  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId ?? null,
    action: 'CREATED',
    targetType: 'MEASUREMENT_DEFINITION',
    targetId: row.id,
    metadata: {
      sizingDomainId: input.sizingDomainId,
      code: input.code,
      name: input.name,
      subjectType: input.subjectType,
      defaultUnit: input.defaultUnit,
    },
  });

  return row;
}

export async function createSizeGuide(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    name: string;
    sizingDomainId: string;
    sizeSystemId?: string;
    description?: string;
    actorId: string;
  },
): Promise<{ id: string; revisionId: string }> {
  return withSizingTransaction(db, async (transaction) => {
    const domain = await sql<{ id: string }>`
      select id::text
      from sizing.sizing_domains
      where id = ${input.sizingDomainId}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
      for share
    `.execute(transaction);

    if (!domain.rows[0]) {
      throw new SizingDomainError('NOT_FOUND', 'Active sizing domain was not found.');
    }

    if (input.sizeSystemId) {
      await assertActiveSystemBelongsToDomain(transaction, {
        organizationId: input.organizationId,
        sizeSystemId: input.sizeSystemId,
        sizingDomainId: input.sizingDomainId,
      });
    }

    const guide = await sql<{ id: string }>`
      insert into sizing.size_guides (
        organization_id,
        name,
        description,
        sizing_domain_id,
        size_system_id
      )
      values (
        ${input.organizationId},
        ${input.name},
        ${input.description ?? null},
        ${input.sizingDomainId},
        ${input.sizeSystemId ?? null}
      )
      returning id::text
    `.execute(transaction);

    const id = guide.rows[0]?.id;
    if (!id) {
      throw new Error('Size guide creation did not return an id.');
    }

    const createdBy = await resolveIamActorId(transaction, input.actorId);

    const revision = await sql<{ id: string }>`
      insert into sizing.size_guide_revisions (
        organization_id,
        size_guide_id,
        revision_number,
        version,
        created_by
      )
      values (
        ${input.organizationId},
        ${id},
        1,
        0,
        ${createdBy}
      )
      returning id::text
    `.execute(transaction);

    const revisionId = revision.rows[0]?.id;
    if (!revisionId) {
      throw new Error('Size guide revision creation did not return an id.');
    }

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'CREATED',
      targetType: 'SIZE_GUIDE',
      targetId: id,
      metadata: {
        name: input.name,
        sizingDomainId: input.sizingDomainId,
        sizeSystemId: input.sizeSystemId ?? null,
        initialRevisionId: revisionId,
      },
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
    sourceRevisionId?: string;
    instructions?: string;
    fitNotes?: string;
  },
): Promise<{ id: string; revisionNumber: number; version: number }> {
  return withSizingTransaction(db, async (transaction) => {
    const guide = await lockActiveGuide(transaction, input.organizationId, input.sizeGuideId);

    const existingDraft = await sql<{ id: string }>`
      select id::text
      from sizing.size_guide_revisions
      where organization_id = ${input.organizationId}
        and size_guide_id = ${input.sizeGuideId}
        and status = 'DRAFT'
      limit 1
      for update
    `.execute(transaction);

    if (existingDraft.rows[0]) {
      throw new SizingDomainError(
        'DRAFT_ALREADY_EXISTS',
        'This size guide already has a draft revision. Continue editing that draft before creating another one.',
      );
    }

    const requestedSourceRevisionId =
      input.sourceRevisionId ?? guide.currentPublishedRevisionId ?? null;

    let source:
      | {
          id: string;
          instructions: string | null;
          fit_notes: string | null;
        }
      | undefined;

    if (requestedSourceRevisionId) {
      const sourceResult = await sql<{
        id: string;
        instructions: string | null;
        fit_notes: string | null;
      }>`
        select id::text, instructions, fit_notes
        from sizing.size_guide_revisions
        where id = ${requestedSourceRevisionId}
          and size_guide_id = ${input.sizeGuideId}
          and organization_id = ${input.organizationId}
      `.execute(transaction);

      source = sourceResult.rows[0];
      if (!source) {
        throw new SizingDomainError(
          'NOT_FOUND',
          'Source revision was not found for this size guide.',
        );
      }
    }

    const nextRevisionNumberResult = await sql<{ next_revision_number: number }>`
      select (coalesce(max(revision_number), 0) + 1)::integer as next_revision_number
      from sizing.size_guide_revisions
      where organization_id = ${input.organizationId}
        and size_guide_id = ${input.sizeGuideId}
    `.execute(transaction);

    const revisionNumber = nextRevisionNumberResult.rows[0]?.next_revision_number ?? 1;

    const createdBy = await resolveIamActorId(transaction, input.actorId);

    const created = await sql<{ id: string }>`
      insert into sizing.size_guide_revisions (
        organization_id,
        size_guide_id,
        revision_number,
        status,
        version,
        instructions,
        fit_notes,
        created_by
      )
      values (
        ${input.organizationId},
        ${input.sizeGuideId},
        ${revisionNumber},
        'DRAFT',
        0,
        ${input.instructions !== undefined ? input.instructions : (source?.instructions ?? null)},
        ${input.fitNotes !== undefined ? input.fitNotes : (source?.fit_notes ?? null)},
        ${createdBy}
      )
      returning id::text
    `.execute(transaction);

    const revisionId = created.rows[0]?.id;
    if (!revisionId) {
      throw new Error('Size guide revision creation did not return an id.');
    }

    if (source) {
      const sourceRows = await sql<{
        id: string;
        display_label: string;
        position: number;
        size_definition_id: string | null;
      }>`
        select
          id::text,
          display_label,
          position,
          size_definition_id::text
        from sizing.size_guide_rows
        where revision_id = ${source.id}
          and organization_id = ${input.organizationId}
        order by position, id
      `.execute(transaction);

      for (const sourceRow of sourceRows.rows) {
        const insertedRow = await sql<{ id: string }>`
          insert into sizing.size_guide_rows (
            organization_id,
            revision_id,
            size_definition_id,
            display_label,
            position
          )
          values (
            ${input.organizationId},
            ${revisionId},
            ${sourceRow.size_definition_id},
            ${sourceRow.display_label},
            ${sourceRow.position}
          )
          returning id::text
        `.execute(transaction);

        const newRowId = insertedRow.rows[0]?.id;
        if (!newRowId) {
          throw new Error('Cloned size guide row creation did not return an id.');
        }

        await sql`
          insert into sizing.size_guide_measurements (
            organization_id,
            row_id,
            measurement_definition_id,
            value_type,
            value_exact,
            value_min,
            value_max,
            unit_code,
            is_approximate
          )
          select
            ${input.organizationId},
            ${newRowId},
            measurement_definition_id,
            value_type,
            value_exact,
            value_min,
            value_max,
            unit_code,
            is_approximate
          from sizing.size_guide_measurements
          where row_id = ${sourceRow.id}
            and organization_id = ${input.organizationId}
        `.execute(transaction);
      }
    }

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'REVISION_CREATED',
      targetType: 'SIZE_GUIDE_REVISION',
      targetId: revisionId,
      metadata: {
        sizeGuideId: input.sizeGuideId,
        revisionNumber,
        sourceRevisionId: source?.id ?? null,
      },
    });

    return {
      id: revisionId,
      revisionNumber,
      version: 0,
    };
  });
}

// ─── Revision rows + measurement matrix ───────────────────────────────────────

export async function addSizeGuideRow(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    expectedVersion: number;
    displayLabel: string;
    position: number;
    sizeDefinitionId?: string;
    actorId: string;
  },
): Promise<{ id: string; version: number }> {
  return withSizingTransaction(db, async (transaction) => {
    const revision = await lockDraftRevision(
      transaction,
      input.organizationId,
      input.revisionId,
      input.expectedVersion,
    );

    if (input.sizeDefinitionId) {
      await assertSizeDefinitionAvailableForGuide(transaction, {
        organizationId: input.organizationId,
        sizeDefinitionId: input.sizeDefinitionId,
        guideDomainId: revision.guideDomainId,
        guideSizeSystemId: revision.guideSizeSystemId,
      });
    }

    const duplicatePosition = await sql<{ id: string }>`
      select id::text
      from sizing.size_guide_rows
      where organization_id = ${input.organizationId}
        and revision_id = ${input.revisionId}
        and position = ${input.position}
      limit 1
    `.execute(transaction);

    if (duplicatePosition.rows[0]) {
      throw new SizingDomainError(
        'CONFLICT',
        'Another size row already uses this position. Reorder the rows and try again.',
      );
    }

    if (input.sizeDefinitionId) {
      const duplicateDefinition = await sql<{ id: string }>`
        select id::text
        from sizing.size_guide_rows
        where organization_id = ${input.organizationId}
          and revision_id = ${input.revisionId}
          and size_definition_id = ${input.sizeDefinitionId}
        limit 1
      `.execute(transaction);

      if (duplicateDefinition.rows[0]) {
        throw new SizingDomainError(
          'CONFLICT',
          'This size definition is already mapped to another row in the revision.',
        );
      }
    }

    const row = await sql<{ id: string }>`
      insert into sizing.size_guide_rows (
        organization_id,
        revision_id,
        size_definition_id,
        display_label,
        position
      )
      values (
        ${input.organizationId},
        ${input.revisionId},
        ${input.sizeDefinitionId ?? null},
        ${input.displayLabel},
        ${input.position}
      )
      returning id::text
    `.execute(transaction);

    const id = row.rows[0]?.id;
    if (!id) {
      throw new Error('Size guide row creation did not return an id.');
    }

    const version = await bumpRevisionVersion(
      transaction,
      input.organizationId,
      input.revisionId,
    );

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'ROW_CREATED',
      targetType: 'SIZE_GUIDE_REVISION',
      targetId: input.revisionId,
      metadata: {
        rowId: id,
        displayLabel: input.displayLabel,
        position: input.position,
        sizeDefinitionId: input.sizeDefinitionId ?? null,
        version,
      },
    });

    return { id, version };
  });
}

export async function updateSizeGuideRow(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    rowId: string;
    expectedVersion: number;
    displayLabel?: string;
    position?: number;
    sizeDefinitionId?: string | null;
    actorId: string;
  },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    const revision = await lockDraftRevision(
      transaction,
      input.organizationId,
      input.revisionId,
      input.expectedVersion,
    );

    await assertRowBelongsToRevision(transaction, {
      organizationId: input.organizationId,
      revisionId: input.revisionId,
      rowId: input.rowId,
    });

    if (input.sizeDefinitionId) {
      await assertSizeDefinitionAvailableForGuide(transaction, {
        organizationId: input.organizationId,
        sizeDefinitionId: input.sizeDefinitionId,
        guideDomainId: revision.guideDomainId,
        guideSizeSystemId: revision.guideSizeSystemId,
      });

      const duplicateDefinition = await sql<{ id: string }>`
        select id::text
        from sizing.size_guide_rows
        where organization_id = ${input.organizationId}
          and revision_id = ${input.revisionId}
          and size_definition_id = ${input.sizeDefinitionId}
          and id <> ${input.rowId}
        limit 1
      `.execute(transaction);

      if (duplicateDefinition.rows[0]) {
        throw new SizingDomainError(
          'CONFLICT',
          'This size definition is already mapped to another row in the revision.',
        );
      }
    }

    if (input.position !== undefined) {
      const duplicatePosition = await sql<{ id: string }>`
        select id::text
        from sizing.size_guide_rows
        where organization_id = ${input.organizationId}
          and revision_id = ${input.revisionId}
          and position = ${input.position}
          and id <> ${input.rowId}
        limit 1
      `.execute(transaction);

      if (duplicatePosition.rows[0]) {
        throw new SizingDomainError(
          'CONFLICT',
          'Another size row already uses this position. Use the reorder endpoint for multi-row moves.',
        );
      }
    }

    const changed = await sql`
      update sizing.size_guide_rows
      set
        display_label = case
          when ${input.displayLabel !== undefined}
            then ${input.displayLabel ?? null}
          else display_label
        end,
        position = case
          when ${input.position !== undefined}
            then ${input.position ?? null}
          else position
        end,
        size_definition_id = case
          when ${input.sizeDefinitionId !== undefined}
            then ${input.sizeDefinitionId ?? null}::uuid
          else size_definition_id
        end
      where id = ${input.rowId}
        and revision_id = ${input.revisionId}
        and organization_id = ${input.organizationId}
    `.execute(transaction);

    if (Number(changed.numAffectedRows) !== 1) {
      throw new SizingDomainError('NOT_FOUND', 'Size guide row was not found.');
    }

    const version = await bumpRevisionVersion(
      transaction,
      input.organizationId,
      input.revisionId,
    );

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'ROW_UPDATED',
      targetType: 'SIZE_GUIDE_REVISION',
      targetId: input.revisionId,
      metadata: {
        rowId: input.rowId,
        displayLabel: input.displayLabel,
        position: input.position,
        sizeDefinitionId: input.sizeDefinitionId,
        version,
      },
    });
  });
}

export async function reorderSizeGuideRows(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    expectedVersion: number;
    rows: Array<{ rowId: string; position: number }>;
    actorId: string;
  },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    await lockDraftRevision(
      transaction,
      input.organizationId,
      input.revisionId,
      input.expectedVersion,
    );

    const rowIds = input.rows.map((row) => row.rowId);
    const positions = input.rows.map((row) => row.position);

    if (new Set(rowIds).size !== rowIds.length) {
      throw new SizingDomainError('VALIDATION_ERROR', 'Duplicate row ids are not allowed.');
    }

    if (new Set(positions).size !== positions.length) {
      throw new SizingDomainError('VALIDATION_ERROR', 'Duplicate row positions are not allowed.');
    }

    const existing = await sql<{ id: string }>`
      select id::text
      from sizing.size_guide_rows
      where organization_id = ${input.organizationId}
        and revision_id = ${input.revisionId}
    `.execute(transaction);

    const existingIds = new Set(existing.rows.map((row) => row.id));
    if (existingIds.size !== rowIds.length || rowIds.some((id) => !existingIds.has(id))) {
      throw new SizingDomainError(
        'VALIDATION_ERROR',
        'Row reorder must include every row in the revision exactly once.',
      );
    }

    // Use temporary negative positions first so a unique(revision_id, position)
    // constraint can be added safely by the migration.
    for (let index = 0; index < input.rows.length; index += 1) {
      const row = input.rows[index]!;
      await sql`
        update sizing.size_guide_rows
        set position = ${-(index + 1)}
        where id = ${row.rowId}
          and revision_id = ${input.revisionId}
          and organization_id = ${input.organizationId}
      `.execute(transaction);
    }

    for (const row of input.rows) {
      await sql`
        update sizing.size_guide_rows
        set position = ${row.position}
        where id = ${row.rowId}
          and revision_id = ${input.revisionId}
          and organization_id = ${input.organizationId}
      `.execute(transaction);
    }

    const version = await bumpRevisionVersion(
      transaction,
      input.organizationId,
      input.revisionId,
    );

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'ROWS_REORDERED',
      targetType: 'SIZE_GUIDE_REVISION',
      targetId: input.revisionId,
      metadata: {
        rows: input.rows,
        version,
      },
    });
  });
}

export async function removeSizeGuideRow(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    rowId: string;
    expectedVersion: number;
    actorId: string;
  },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    await lockDraftRevision(
      transaction,
      input.organizationId,
      input.revisionId,
      input.expectedVersion,
    );

    const deleted = await sql`
      delete from sizing.size_guide_rows
      where id = ${input.rowId}
        and revision_id = ${input.revisionId}
        and organization_id = ${input.organizationId}
    `.execute(transaction);

    if (Number(deleted.numAffectedRows) !== 1) {
      throw new SizingDomainError(
        'NOT_FOUND',
        'Size guide row was not found in this revision.',
      );
    }

    const version = await bumpRevisionVersion(
      transaction,
      input.organizationId,
      input.revisionId,
    );

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'ROW_REMOVED',
      targetType: 'SIZE_GUIDE_REVISION',
      targetId: input.revisionId,
      metadata: {
        rowId: input.rowId,
        version,
      },
    });
  });
}

export async function setSizeGuideMeasurement(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    rowId: string;
    measurementDefinitionId: string;
    expectedVersion: number;
    unitCode: MeasurementUnit;
    exact?: string | undefined;
    min?: string | undefined;
    max?: string | undefined;
    isApproximate?: boolean | undefined;
    actorId: string;
  },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    const revision = await lockDraftRevision(
      transaction,
      input.organizationId,
      input.revisionId,
      input.expectedVersion,
    );

    await setMeasurementInternal(transaction, {
      organizationId: input.organizationId,
      revisionId: input.revisionId,
      rowId: input.rowId,
      guideDomainId: revision.guideDomainId,
      measurementDefinitionId: input.measurementDefinitionId,
      unitCode: input.unitCode,
      exact: input.exact,
      min: input.min,
      max: input.max,
      isApproximate: input.isApproximate,
    });

    const version = await bumpRevisionVersion(
      transaction,
      input.organizationId,
      input.revisionId,
    );

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'MEASUREMENT_SET',
      targetType: 'SIZE_GUIDE_REVISION',
      targetId: input.revisionId,
      metadata: {
        rowId: input.rowId,
        measurementDefinitionId: input.measurementDefinitionId,
        unitCode: input.unitCode,
        valueType: input.exact !== undefined ? 'EXACT' : 'RANGE',
        version,
      },
    });
  });
}

export async function removeSizeGuideMeasurement(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    rowId: string;
    measurementDefinitionId: string;
    expectedVersion: number;
    actorId: string;
  },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    await lockDraftRevision(
      transaction,
      input.organizationId,
      input.revisionId,
      input.expectedVersion,
    );

    await removeMeasurementInternal(transaction, {
      organizationId: input.organizationId,
      revisionId: input.revisionId,
      rowId: input.rowId,
      measurementDefinitionId: input.measurementDefinitionId,
      requireExisting: true,
    });

    const version = await bumpRevisionVersion(
      transaction,
      input.organizationId,
      input.revisionId,
    );

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'MEASUREMENT_REMOVED',
      targetType: 'SIZE_GUIDE_REVISION',
      targetId: input.revisionId,
      metadata: {
        rowId: input.rowId,
        measurementDefinitionId: input.measurementDefinitionId,
        version,
      },
    });
  });
}

export type BulkSizeGuideMeasurementChange =
  | {
      operation: 'SET';
      rowId: string;
      measurementDefinitionId: string;
      unitCode: MeasurementUnit;
      exact: string;
      isApproximate?: boolean | undefined;
    }
  | {
      operation: 'SET';
      rowId: string;
      measurementDefinitionId: string;
      unitCode: MeasurementUnit;
      min: string;
      max: string;
      isApproximate?: boolean | undefined;
    }
  | {
      operation: 'CLEAR';
      rowId: string;
      measurementDefinitionId: string;
    };

export async function setSizeGuideMeasurementsBulk(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    expectedVersion: number;
    changes: BulkSizeGuideMeasurementChange[];
    actorId: string;
  },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    const revision = await lockDraftRevision(
      transaction,
      input.organizationId,
      input.revisionId,
      input.expectedVersion,
    );

    const keys = input.changes.map(
      (change) => `${change.rowId}:${change.measurementDefinitionId}`,
    );
    if (new Set(keys).size !== keys.length) {
      throw new SizingDomainError(
        'VALIDATION_ERROR',
        'The same row/measurement cell cannot appear more than once in one bulk request.',
      );
    }

    for (const change of input.changes) {
      if (change.operation === 'CLEAR') {
        await removeMeasurementInternal(transaction, {
          organizationId: input.organizationId,
          revisionId: input.revisionId,
          rowId: change.rowId,
          measurementDefinitionId: change.measurementDefinitionId,
          requireExisting: false,
        });
        continue;
      }

      await setMeasurementInternal(transaction, {
        organizationId: input.organizationId,
        revisionId: input.revisionId,
        rowId: change.rowId,
        guideDomainId: revision.guideDomainId,
        measurementDefinitionId: change.measurementDefinitionId,
        unitCode: change.unitCode,
        ...('exact' in change
          ? { exact: change.exact }
          : { min: change.min, max: change.max }),
        isApproximate: change.isApproximate,
      });
    }

    const version = await bumpRevisionVersion(
      transaction,
      input.organizationId,
      input.revisionId,
    );

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'MATRIX_UPDATED',
      targetType: 'SIZE_GUIDE_REVISION',
      targetId: input.revisionId,
      metadata: {
        changeCount: input.changes.length,
        version,
      },
    });
  });
}

// ─── Publish ───────────────────────────────────────────────────────────────────

export async function publishSizeGuideRevision(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    sizeGuideId: string;
    revisionId: string;
    expectedVersion: number;
    actorId: string;
  },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    const revision = await lockDraftRevision(
      transaction,
      input.organizationId,
      input.revisionId,
      input.expectedVersion,
    );

    if (revision.guideId !== input.sizeGuideId) {
      throw new SizingDomainError(
        'NOT_FOUND',
        'The revision does not belong to the requested size guide.',
      );
    }

    const guide = await lockActiveGuide(
      transaction,
      input.organizationId,
      input.sizeGuideId,
    );

    const rows = await sql<{
      id: string;
      size_definition_id: string | null;
      measurement_count: string;
    }>`
      select
        row.id::text,
        row.size_definition_id::text,
        count(measurement.id)::text as measurement_count
      from sizing.size_guide_rows row
      left join sizing.size_guide_measurements measurement
        on measurement.row_id = row.id
       and measurement.organization_id = row.organization_id
      where row.revision_id = ${input.revisionId}
        and row.organization_id = ${input.organizationId}
      group by row.id
      order by row.position, row.id
    `.execute(transaction);

    if (rows.rows.length === 0) {
      throw new SizingDomainError(
        'VALIDATION_ERROR',
        'A size guide must have at least one size row before it can be published.',
      );
    }

    const emptyRow = rows.rows.find((row) => Number(row.measurement_count) === 0);
    if (emptyRow) {
      throw new SizingDomainError(
        'VALIDATION_ERROR',
        'Every size row must have at least one measurement value before the guide can be published.',
      );
    }

    if (guide.sizeSystemId) {
      const unmappedRow = rows.rows.find((row) => !row.size_definition_id);
      if (unmappedRow) {
        throw new SizingDomainError(
          'VALIDATION_ERROR',
          'Every row in a system-bound size guide must be linked to a size definition before publishing.',
        );
      }

      const mismatchedDefinitions = await sql<{ count: string }>`
        select count(*)::text as count
        from sizing.size_guide_rows row
        join sizing.size_definitions definition
          on definition.id = row.size_definition_id
        where row.revision_id = ${input.revisionId}
          and row.organization_id = ${input.organizationId}
          and (
            definition.organization_id <> ${input.organizationId}
            or definition.size_system_id <> ${guide.sizeSystemId}
            or definition.status <> 'ACTIVE'
          )
      `.execute(transaction);

      if (Number(mismatchedDefinitions.rows[0]?.count ?? 0) > 0) {
        throw new SizingDomainError(
          'SYSTEM_MISMATCH',
          'One or more size rows use definitions outside the guide size system.',
        );
      }
    } else {
      const mappedRowCount = await sql<{ count: string }>`
        select count(*)::text as count
        from sizing.size_guide_rows
        where revision_id = ${input.revisionId}
          and organization_id = ${input.organizationId}
          and size_definition_id is not null
      `.execute(transaction);

      if (Number(mappedRowCount.rows[0]?.count ?? 0) > 0) {
        throw new SizingDomainError(
          'SYSTEM_MISMATCH',
          'A guide with mapped size definitions must be bound to a size system.',
        );
      }
    }

    const measurementMismatch = await sql<{ count: string }>`
      select count(*)::text as count
      from sizing.size_guide_measurements measurement
      join sizing.size_guide_rows row on row.id = measurement.row_id
      join sizing.measurement_definitions definition
        on definition.id = measurement.measurement_definition_id
      where row.revision_id = ${input.revisionId}
        and measurement.organization_id = ${input.organizationId}
        and (
          definition.organization_id <> ${input.organizationId}
          or definition.sizing_domain_id <> ${guide.sizingDomainId}
          or definition.status <> 'ACTIVE'
        )
    `.execute(transaction);

    if (Number(measurementMismatch.rows[0]?.count ?? 0) > 0) {
      throw new SizingDomainError(
        'DOMAIN_MISMATCH',
        'One or more measurements use definitions outside the guide sizing domain.',
      );
    }

    const changed = await sql`
      update sizing.size_guide_revisions
      set
        status = 'PUBLISHED',
        published_at = now(),
        version = version + 1
      where id = ${input.revisionId}
        and size_guide_id = ${input.sizeGuideId}
        and organization_id = ${input.organizationId}
        and status = 'DRAFT'
    `.execute(transaction);

    if (Number(changed.numAffectedRows) !== 1) {
      throw new SizingDomainError(
        'ALREADY_PUBLISHED',
        'The size guide revision is no longer an editable draft.',
      );
    }

    const updatedGuide = await sql`
      update sizing.size_guides
      set
        current_published_revision_id = ${input.revisionId},
        version = version + 1,
        updated_at = now()
      where id = ${input.sizeGuideId}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
    `.execute(transaction);

    if (Number(updatedGuide.numAffectedRows) !== 1) {
      throw new SizingDomainError('NOT_FOUND', 'Size guide was not found.');
    }

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'PUBLISHED',
      targetType: 'SIZE_GUIDE_REVISION',
      targetId: input.revisionId,
      metadata: {
        sizeGuideId: input.sizeGuideId,
        previousPublishedRevisionId: guide.currentPublishedRevisionId,
      },
    });
  });
}

// ─── Update operations ─────────────────────────────────────────────────────────

export async function updateSizingDomain(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    id: string;
    name?: string;
    actorId: string;
  },
): Promise<void> {
  const changed = await sql`
    update sizing.sizing_domains
    set name = case when ${input.name !== undefined} then ${input.name ?? null} else name end
    where id = ${input.id}
      and organization_id = ${input.organizationId}
      and status = 'ACTIVE'
  `.execute(db);

  if (Number(changed.numAffectedRows) !== 1) {
    throw new SizingDomainError('NOT_FOUND', 'Active sizing domain was not found.');
  }

  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'UPDATED',
    targetType: 'SIZING_DOMAIN',
    targetId: input.id,
    metadata: { name: input.name },
  });
}

export async function updateSizeGuide(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    id: string;
    expectedVersion: number;
    name?: string;
    description?: string | null;
    sizeSystemId?: string | null;
    actorId: string;
  },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    const guide = await lockActiveGuide(transaction, input.organizationId, input.id);
    assertExpectedVersion(guide.version, input.expectedVersion, 'Size guide');

    if (input.sizeSystemId !== undefined && input.sizeSystemId !== guide.sizeSystemId) {
      if (input.sizeSystemId) {
        await assertActiveSystemBelongsToDomain(transaction, {
          organizationId: input.organizationId,
          sizeSystemId: input.sizeSystemId,
          sizingDomainId: guide.sizingDomainId,
        });
      }

      const usage = await sql<{ row_count: string; has_published: boolean }>`
        select
          count(row.id) filter (where row.size_definition_id is not null)::text as row_count,
          (${guide.currentPublishedRevisionId}::uuid is not null) as has_published
        from sizing.size_guide_revisions revision
        left join sizing.size_guide_rows row
          on row.revision_id = revision.id
         and row.organization_id = revision.organization_id
        where revision.size_guide_id = ${input.id}
          and revision.organization_id = ${input.organizationId}
      `.execute(transaction);

      const usageRow = usage.rows[0];
      if (
        Boolean(usageRow?.has_published) ||
        Number(usageRow?.row_count ?? 0) > 0
      ) {
        throw new SizingDomainError(
          'CONFLICT',
          'The guide size system cannot be changed after size-definition mappings or published revisions exist. Create or duplicate a guide instead.',
        );
      }
    }

    const changed = await sql`
      update sizing.size_guides
      set
        name = case when ${input.name !== undefined} then ${input.name ?? null} else name end,
        description = case
          when ${input.description !== undefined} then ${input.description ?? null}
          else description
        end,
        size_system_id = case
          when ${input.sizeSystemId !== undefined} then ${input.sizeSystemId ?? null}::uuid
          else size_system_id
        end,
        updated_at = now(),
        version = version + 1
      where id = ${input.id}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
    `.execute(transaction);

    if (Number(changed.numAffectedRows) !== 1) {
      throw new SizingDomainError('NOT_FOUND', 'Size guide was not found.');
    }

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'UPDATED',
      targetType: 'SIZE_GUIDE',
      targetId: input.id,
      metadata: {
        name: input.name,
        descriptionChanged: input.description !== undefined,
        sizeSystemId: input.sizeSystemId,
      },
    });
  });
}

export async function updateSizeGuideRevisionMeta(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    expectedVersion: number;
    instructions?: string | null;
    fitNotes?: string | null;
    actorId: string;
  },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    await lockDraftRevision(
      transaction,
      input.organizationId,
      input.revisionId,
      input.expectedVersion,
    );

    await sql`
      update sizing.size_guide_revisions
      set
        instructions = case
          when ${input.instructions !== undefined} then ${input.instructions ?? null}
          else instructions
        end,
        fit_notes = case
          when ${input.fitNotes !== undefined} then ${input.fitNotes ?? null}
          else fit_notes
        end
      where id = ${input.revisionId}
        and organization_id = ${input.organizationId}
    `.execute(transaction);

    const version = await bumpRevisionVersion(
      transaction,
      input.organizationId,
      input.revisionId,
    );

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'REVISION_META_UPDATED',
      targetType: 'SIZE_GUIDE_REVISION',
      targetId: input.revisionId,
      metadata: {
        instructionsChanged: input.instructions !== undefined,
        fitNotesChanged: input.fitNotes !== undefined,
        version,
      },
    });
  });
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
    defaultUnit?: MeasurementUnit;
    actorId: string;
  },
): Promise<void> {
  const changed = await sql`
    update sizing.measurement_definitions
    set
      name = case when ${input.name !== undefined} then ${input.name ?? null} else name end,
      description = case
        when ${input.description !== undefined} then ${input.description ?? null}
        else description
      end,
      instructions = case
        when ${input.instructions !== undefined} then ${input.instructions ?? null}
        else instructions
      end,
      sort_order = case
        when ${input.sortOrder !== undefined} then ${input.sortOrder ?? null}
        else sort_order
      end,
      default_unit = case
        when ${input.defaultUnit !== undefined} then ${input.defaultUnit ?? null}
        else default_unit
      end
    where id = ${input.id}
      and organization_id = ${input.organizationId}
      and status = 'ACTIVE'
  `.execute(db);

  if (Number(changed.numAffectedRows) !== 1) {
    throw new SizingDomainError('NOT_FOUND', 'Active measurement definition was not found.');
  }

  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'UPDATED',
    targetType: 'MEASUREMENT_DEFINITION',
    targetId: input.id,
    metadata: {
      name: input.name,
      descriptionChanged: input.description !== undefined,
      instructionsChanged: input.instructions !== undefined,
      sortOrder: input.sortOrder,
      defaultUnit: input.defaultUnit,
    },
  });
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
      label = case when ${input.label !== undefined} then ${input.label ?? null} else label end,
      sort_order = case
        when ${input.sortOrder !== undefined} then ${input.sortOrder ?? null}
        else sort_order
      end
    where id = ${input.id}
      and organization_id = ${input.organizationId}
      and status = 'ACTIVE'
  `.execute(db);

  if (Number(changed.numAffectedRows) !== 1) {
    throw new SizingDomainError('NOT_FOUND', 'Active size definition was not found.');
  }

  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'UPDATED',
    targetType: 'SIZE_DEFINITION',
    targetId: input.id,
    metadata: {
      label: input.label,
      sortOrder: input.sortOrder,
    },
  });
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
      name = case when ${input.name !== undefined} then ${input.name ?? null} else name end,
      region_code = case
        when ${input.regionCode !== undefined} then ${input.regionCode ?? null}
        else region_code
      end
    where id = ${input.id}
      and organization_id = ${input.organizationId}
      and status = 'ACTIVE'
  `.execute(db);

  if (Number(changed.numAffectedRows) !== 1) {
    throw new SizingDomainError('NOT_FOUND', 'Active size system was not found.');
  }

  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'UPDATED',
    targetType: 'SIZE_SYSTEM',
    targetId: input.id,
    metadata: {
      name: input.name,
      regionCode: input.regionCode,
    },
  });
}

// ─── Archive operations ────────────────────────────────────────────────────────

export async function archiveSizeGuide(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    await lockActiveGuide(transaction, input.organizationId, input.id);

    const productUsage = await sql<{ count: string }>`
      select count(*)::text as count
      from sizing.product_size_configurations
      where organization_id = ${input.organizationId}
        and size_guide_id = ${input.id}
        and status = 'ACTIVE'
    `.execute(transaction);

    const categoryUsage = await sql<{ count: string }>`
      select count(*)::text as count
      from catalog.categories
      where organization_id = ${input.organizationId}
        and default_size_guide_id = ${input.id}
        and status <> 'ARCHIVED'
    `.execute(transaction);

    const productCount = Number(productUsage.rows[0]?.count ?? 0);
    const categoryCount = Number(categoryUsage.rows[0]?.count ?? 0);

    if (productCount > 0 || categoryCount > 0) {
      throw new SizingDomainError(
        'DEPENDENCY_EXISTS',
        `This size guide is still used by ${productCount} active product configuration(s) and ${categoryCount} active category default(s). Reassign or remove those references before archiving it.`,
      );
    }

    const changed = await sql`
      update sizing.size_guides
      set
        status = 'ARCHIVED',
        updated_at = now(),
        version = version + 1
      where id = ${input.id}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
    `.execute(transaction);

    if (Number(changed.numAffectedRows) !== 1) {
      throw new SizingDomainError('NOT_FOUND', 'Size guide was not found.');
    }

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
  await withSizingTransaction(db, async (transaction) => {
    const definition = await sql<{ id: string }>`
      select id::text
      from sizing.size_definitions
      where id = ${input.id}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
      for update
    `.execute(transaction);

    if (!definition.rows[0]) {
      throw new SizingDomainError('NOT_FOUND', 'Active size definition was not found.');
    }

    const optionUsage = await sql<{ count: string }>`
      select count(*)::text as count
      from catalog.product_option_values
      where organization_id = ${input.organizationId}
        and size_definition_id = ${input.id}
        and status = 'ACTIVE'
    `.execute(transaction);

    const draftUsage = await sql<{ count: string }>`
      select count(*)::text as count
      from sizing.size_guide_rows row
      join sizing.size_guide_revisions revision on revision.id = row.revision_id
      where row.organization_id = ${input.organizationId}
        and row.size_definition_id = ${input.id}
        and revision.status = 'DRAFT'
    `.execute(transaction);

    if (
      Number(optionUsage.rows[0]?.count ?? 0) > 0 ||
      Number(draftUsage.rows[0]?.count ?? 0) > 0
    ) {
      throw new SizingDomainError(
        'DEPENDENCY_EXISTS',
        'This size definition is still used by active product option values or an editable guide revision.',
      );
    }

    await sql`
      update sizing.size_definitions
      set status = 'ARCHIVED'
      where id = ${input.id}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
    `.execute(transaction);

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'ARCHIVED',
      targetType: 'SIZE_DEFINITION',
      targetId: input.id,
    });
  });
}

export async function archiveMeasurementDefinition(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    const definition = await sql<{ id: string }>`
      select id::text
      from sizing.measurement_definitions
      where id = ${input.id}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
      for update
    `.execute(transaction);

    if (!definition.rows[0]) {
      throw new SizingDomainError(
        'NOT_FOUND',
        'Active measurement definition was not found.',
      );
    }

    const draftUsage = await sql<{ count: string }>`
      select count(*)::text as count
      from sizing.size_guide_measurements measurement
      join sizing.size_guide_rows row on row.id = measurement.row_id
      join sizing.size_guide_revisions revision on revision.id = row.revision_id
      where measurement.organization_id = ${input.organizationId}
        and measurement.measurement_definition_id = ${input.id}
        and revision.status = 'DRAFT'
    `.execute(transaction);

    if (Number(draftUsage.rows[0]?.count ?? 0) > 0) {
      throw new SizingDomainError(
        'DEPENDENCY_EXISTS',
        'This measurement definition is still used by an editable guide revision.',
      );
    }

    // Published revisions intentionally keep their historical reference. The
    // storefront does not filter archived definitions when reading a published
    // revision, so archiving here does not destroy historical guide content.
    await sql`
      update sizing.measurement_definitions
      set status = 'ARCHIVED'
      where id = ${input.id}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
    `.execute(transaction);

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'ARCHIVED',
      targetType: 'MEASUREMENT_DEFINITION',
      targetId: input.id,
    });
  });
}

export async function archiveSizeSystem(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    const system = await sql<{ id: string }>`
      select id::text
      from sizing.size_systems
      where id = ${input.id}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
      for update
    `.execute(transaction);

    if (!system.rows[0]) {
      throw new SizingDomainError('NOT_FOUND', 'Active size system was not found.');
    }

    const [configUsage, guideUsage, definitionUsage] = await Promise.all([
      sql<{ count: string }>`
        select count(*)::text as count
        from sizing.product_size_configurations
        where organization_id = ${input.organizationId}
          and size_system_id = ${input.id}
          and status = 'ACTIVE'
      `.execute(transaction),
      sql<{ count: string }>`
        select count(*)::text as count
        from sizing.size_guides
        where organization_id = ${input.organizationId}
          and size_system_id = ${input.id}
          and status = 'ACTIVE'
      `.execute(transaction),
      sql<{ count: string }>`
        select count(*)::text as count
        from sizing.size_definitions
        where organization_id = ${input.organizationId}
          and size_system_id = ${input.id}
          and status = 'ACTIVE'
      `.execute(transaction),
    ]);

    const configCount = Number(configUsage.rows[0]?.count ?? 0);
    const guideCount = Number(guideUsage.rows[0]?.count ?? 0);
    const definitionCount = Number(definitionUsage.rows[0]?.count ?? 0);

    if (configCount > 0 || guideCount > 0 || definitionCount > 0) {
      throw new SizingDomainError(
        'DEPENDENCY_EXISTS',
        `This size system still has ${configCount} active product configuration(s), ${guideCount} active guide(s), and ${definitionCount} active size definition(s). Archive or reassign them first.`,
      );
    }

    await sql`
      update sizing.size_systems
      set status = 'ARCHIVED'
      where id = ${input.id}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
    `.execute(transaction);

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'ARCHIVED',
      targetType: 'SIZE_SYSTEM',
      targetId: input.id,
    });
  });
}

export async function archiveSizingDomain(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    const domain = await sql<{ id: string }>`
      select id::text
      from sizing.sizing_domains
      where id = ${input.id}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
      for update
    `.execute(transaction);

    if (!domain.rows[0]) {
      throw new SizingDomainError('NOT_FOUND', 'Active sizing domain was not found.');
    }

    const [guideCount, systemCount, measurementCount] = await Promise.all([
      sql<{ count: string }>`
        select count(*)::text as count
        from sizing.size_guides
        where organization_id = ${input.organizationId}
          and sizing_domain_id = ${input.id}
          and status = 'ACTIVE'
      `.execute(transaction),
      sql<{ count: string }>`
        select count(*)::text as count
        from sizing.size_systems
        where organization_id = ${input.organizationId}
          and sizing_domain_id = ${input.id}
          and status = 'ACTIVE'
      `.execute(transaction),
      sql<{ count: string }>`
        select count(*)::text as count
        from sizing.measurement_definitions
        where organization_id = ${input.organizationId}
          and sizing_domain_id = ${input.id}
          and status = 'ACTIVE'
      `.execute(transaction),
    ]);

    const guides = Number(guideCount.rows[0]?.count ?? 0);
    const systems = Number(systemCount.rows[0]?.count ?? 0);
    const measurements = Number(measurementCount.rows[0]?.count ?? 0);

    if (guides > 0 || systems > 0 || measurements > 0) {
      throw new SizingDomainError(
        'DEPENDENCY_EXISTS',
        `Archive all children before archiving this domain. Remaining active resources: ${guides} guide(s), ${systems} system(s), ${measurements} measurement definition(s).`,
      );
    }

    await sql`
      update sizing.sizing_domains
      set status = 'ARCHIVED'
      where id = ${input.id}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
    `.execute(transaction);

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'ARCHIVED',
      targetType: 'SIZING_DOMAIN',
      targetId: input.id,
    });
  });
}

// ─── Restore operations ────────────────────────────────────────────────────────

export async function restoreSizingDomain(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  const changed = await sql`
    update sizing.sizing_domains
    set status = 'ACTIVE'
    where id = ${input.id}
      and organization_id = ${input.organizationId}
      and status = 'ARCHIVED'
  `.execute(db);

  if (Number(changed.numAffectedRows) !== 1) {
    throw new SizingDomainError('NOT_FOUND', 'Archived sizing domain was not found.');
  }

  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'RESTORED',
    targetType: 'SIZING_DOMAIN',
    targetId: input.id,
  });
}

export async function restoreSizeSystem(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  const changed = await sql`
    update sizing.size_systems system
    set status = 'ACTIVE'
    from sizing.sizing_domains domain
    where system.id = ${input.id}
      and system.organization_id = ${input.organizationId}
      and system.status = 'ARCHIVED'
      and domain.id = system.sizing_domain_id
      and domain.organization_id = system.organization_id
      and domain.status = 'ACTIVE'
  `.execute(db);

  if (Number(changed.numAffectedRows) !== 1) {
    throw new SizingDomainError(
      'INVALID_STATE',
      'The archived size system was not found, or its sizing domain must be restored first.',
    );
  }

  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'RESTORED',
    targetType: 'SIZE_SYSTEM',
    targetId: input.id,
  });
}

export async function restoreSizeDefinition(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  const changed = await sql`
    update sizing.size_definitions definition
    set status = 'ACTIVE'
    from sizing.size_systems system
    where definition.id = ${input.id}
      and definition.organization_id = ${input.organizationId}
      and definition.status = 'ARCHIVED'
      and system.id = definition.size_system_id
      and system.organization_id = definition.organization_id
      and system.status = 'ACTIVE'
  `.execute(db);

  if (Number(changed.numAffectedRows) !== 1) {
    throw new SizingDomainError(
      'INVALID_STATE',
      'The archived size definition was not found, or its size system must be restored first.',
    );
  }

  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'RESTORED',
    targetType: 'SIZE_DEFINITION',
    targetId: input.id,
  });
}

export async function restoreMeasurementDefinition(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  const changed = await sql`
    update sizing.measurement_definitions definition
    set status = 'ACTIVE'
    from sizing.sizing_domains domain
    where definition.id = ${input.id}
      and definition.organization_id = ${input.organizationId}
      and definition.status = 'ARCHIVED'
      and domain.id = definition.sizing_domain_id
      and domain.organization_id = definition.organization_id
      and domain.status = 'ACTIVE'
  `.execute(db);

  if (Number(changed.numAffectedRows) !== 1) {
    throw new SizingDomainError(
      'INVALID_STATE',
      'The archived measurement definition was not found, or its sizing domain must be restored first.',
    );
  }

  await recordSizingAudit(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'RESTORED',
    targetType: 'MEASUREMENT_DEFINITION',
    targetId: input.id,
  });
}

export async function restoreSizeGuide(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; id: string; actorId: string },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    const guide = await sql<{
      sizing_domain_id: string;
      size_system_id: string | null;
    }>`
      select sizing_domain_id::text, size_system_id::text
      from sizing.size_guides
      where id = ${input.id}
        and organization_id = ${input.organizationId}
        and status = 'ARCHIVED'
      for update
    `.execute(transaction);

    const row = guide.rows[0];
    if (!row) {
      throw new SizingDomainError('NOT_FOUND', 'Archived size guide was not found.');
    }

    const domain = await sql<{ id: string }>`
      select id::text
      from sizing.sizing_domains
      where id = ${row.sizing_domain_id}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
    `.execute(transaction);

    if (!domain.rows[0]) {
      throw new SizingDomainError(
        'INVALID_STATE',
        'Restore the guide sizing domain before restoring this guide.',
      );
    }

    if (row.size_system_id) {
      await assertActiveSystemBelongsToDomain(transaction, {
        organizationId: input.organizationId,
        sizeSystemId: row.size_system_id,
        sizingDomainId: row.sizing_domain_id,
      });
    }

    await sql`
      update sizing.size_guides
      set
        status = 'ACTIVE',
        updated_at = now(),
        version = version + 1
      where id = ${input.id}
        and organization_id = ${input.organizationId}
        and status = 'ARCHIVED'
    `.execute(transaction);

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'RESTORED',
      targetType: 'SIZE_GUIDE',
      targetId: input.id,
    });
  });
}

// ─── Duplicate guide ───────────────────────────────────────────────────────────

export async function duplicateSizeGuide(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    id: string;
    name?: string;
    actorId: string;
  },
): Promise<{ id: string; revisionId: string }> {
  return withSizingTransaction(db, async (transaction) => {
    const source = await sql<{
      guide_id: string;
      name: string;
      description: string | null;
      sizing_domain_id: string;
      size_system_id: string | null;
      revision_id: string | null;
      instructions: string | null;
      fit_notes: string | null;
    }>`
      select
        guide.id::text as guide_id,
        guide.name,
        guide.description,
        guide.sizing_domain_id::text,
        guide.size_system_id::text,
        coalesce(
          guide.current_published_revision_id::text,
          (
            select revision.id::text
            from sizing.size_guide_revisions revision
            where revision.size_guide_id = guide.id
              and revision.organization_id = ${input.organizationId}
            order by revision.revision_number desc
            limit 1
          )
        ) as revision_id,
        source_revision.instructions,
        source_revision.fit_notes
      from sizing.size_guides guide
      left join sizing.size_guide_revisions source_revision
        on source_revision.id = coalesce(
          guide.current_published_revision_id,
          (
            select revision.id
            from sizing.size_guide_revisions revision
            where revision.size_guide_id = guide.id
              and revision.organization_id = ${input.organizationId}
            order by revision.revision_number desc
            limit 1
          )
        )
      where guide.id = ${input.id}
        and guide.organization_id = ${input.organizationId}
        and guide.status = 'ACTIVE'
      for share of guide
    `.execute(transaction);

    const guide = source.rows[0];
    if (!guide) {
      throw new SizingDomainError('NOT_FOUND', 'Active size guide was not found.');
    }

    const newName = input.name ?? `Copy of ${guide.name}`;

    const newGuide = await sql<{ id: string }>`
      insert into sizing.size_guides (
        organization_id,
        name,
        description,
        sizing_domain_id,
        size_system_id
      )
      values (
        ${input.organizationId},
        ${newName},
        ${guide.description},
        ${guide.sizing_domain_id},
        ${guide.size_system_id}
      )
      returning id::text
    `.execute(transaction);

    const newGuideId = newGuide.rows[0]?.id;
    if (!newGuideId) {
      throw new Error('Duplicate guide creation did not return an id.');
    }

    const createdBy = await resolveIamActorId(transaction, input.actorId);

    const newRevision = await sql<{ id: string }>`
      insert into sizing.size_guide_revisions (
        organization_id,
        size_guide_id,
        revision_number,
        status,
        version,
        instructions,
        fit_notes,
        created_by
      )
      values (
        ${input.organizationId},
        ${newGuideId},
        1,
        'DRAFT',
        0,
        ${guide.instructions},
        ${guide.fit_notes},
        ${createdBy}
      )
      returning id::text
    `.execute(transaction);

    const newRevisionId = newRevision.rows[0]?.id;
    if (!newRevisionId) {
      throw new Error('Duplicate revision creation did not return an id.');
    }

    if (guide.revision_id) {
      const sourceRows = await sql<{
        id: string;
        display_label: string;
        position: number;
        size_definition_id: string | null;
      }>`
        select
          id::text,
          display_label,
          position,
          size_definition_id::text
        from sizing.size_guide_rows
        where revision_id = ${guide.revision_id}
          and organization_id = ${input.organizationId}
        order by position, id
      `.execute(transaction);

      for (const sourceRow of sourceRows.rows) {
        const newRow = await sql<{ id: string }>`
          insert into sizing.size_guide_rows (
            organization_id,
            revision_id,
            size_definition_id,
            display_label,
            position
          )
          values (
            ${input.organizationId},
            ${newRevisionId},
            ${sourceRow.size_definition_id},
            ${sourceRow.display_label},
            ${sourceRow.position}
          )
          returning id::text
        `.execute(transaction);

        const newRowId = newRow.rows[0]?.id;
        if (!newRowId) {
          throw new Error('Duplicate guide row creation did not return an id.');
        }

        await sql`
          insert into sizing.size_guide_measurements (
            organization_id,
            row_id,
            measurement_definition_id,
            value_type,
            value_exact,
            value_min,
            value_max,
            unit_code,
            is_approximate
          )
          select
            ${input.organizationId},
            ${newRowId},
            measurement_definition_id,
            value_type,
            value_exact,
            value_min,
            value_max,
            unit_code,
            is_approximate
          from sizing.size_guide_measurements
          where row_id = ${sourceRow.id}
            and organization_id = ${input.organizationId}
        `.execute(transaction);
      }
    }

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'DUPLICATED',
      targetType: 'SIZE_GUIDE',
      targetId: newGuideId,
      metadata: {
        sourceGuideId: input.id,
        sourceRevisionId: guide.revision_id,
        name: newName,
      },
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
    sizeGuideId?: string | undefined;
    expectedProductVersion?: number | undefined;
    actorId: string;
  },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    await lockProductForSizingMutation(transaction, {
      organizationId: input.organizationId,
      productId: input.productId,
      expectedProductVersion: input.expectedProductVersion,
    });

    const system = await sql<{
      id: string;
      sizing_domain_id: string;
    }>`
      select id::text, sizing_domain_id::text
      from sizing.size_systems
      where id = ${input.sizeSystemId}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
      for share
    `.execute(transaction);

    const systemRow = system.rows[0];
    if (!systemRow) {
      throw new SizingDomainError('NOT_FOUND', 'Active size system was not found.');
    }

    if (input.sizeGuideId) {
      const guide = await sql<{
        id: string;
        sizing_domain_id: string;
        size_system_id: string | null;
      }>`
        select
          id::text,
          sizing_domain_id::text,
          size_system_id::text
        from sizing.size_guides
        where id = ${input.sizeGuideId}
          and organization_id = ${input.organizationId}
          and status = 'ACTIVE'
          and current_published_revision_id is not null
        for share
      `.execute(transaction);

      const guideRow = guide.rows[0];
      if (!guideRow) {
        throw new SizingDomainError(
          'VALIDATION_ERROR',
          'The selected size guide must be active and have a published revision.',
        );
      }

      if (guideRow.sizing_domain_id !== systemRow.sizing_domain_id) {
        throw new SizingDomainError(
          'DOMAIN_MISMATCH',
          'The selected size guide and size system belong to different sizing domains.',
        );
      }

      if (guideRow.size_system_id && guideRow.size_system_id !== input.sizeSystemId) {
        throw new SizingDomainError(
          'SYSTEM_MISMATCH',
          'The selected size guide is bound to a different size system.',
        );
      }
    }

    await sql`
      insert into sizing.product_size_configurations (
        organization_id,
        product_id,
        size_system_id,
        size_guide_id,
        status
      )
      values (
        ${input.organizationId},
        ${input.productId},
        ${input.sizeSystemId},
        ${input.sizeGuideId ?? null},
        'ACTIVE'
      )
      on conflict (product_id)
      do update set
        size_system_id = excluded.size_system_id,
        size_guide_id = excluded.size_guide_id,
        status = 'ACTIVE'
    `.execute(transaction);

    await bumpProductVersion(transaction, input.organizationId, input.productId);

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'PRODUCT_SIZING_SET',
      targetType: 'PRODUCT',
      targetId: input.productId,
      metadata: {
        sizeSystemId: input.sizeSystemId,
        sizeGuideId: input.sizeGuideId ?? null,
      },
    });
  });
}

export async function removeProductSizingConfiguration(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    expectedProductVersion?: number | undefined;
    actorId: string;
  },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    await lockProductForSizingMutation(transaction, {
      organizationId: input.organizationId,
      productId: input.productId,
      expectedProductVersion: input.expectedProductVersion,
    });

    const changed = await sql`
      update sizing.product_size_configurations
      set status = 'ARCHIVED'
      where product_id = ${input.productId}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
    `.execute(transaction);

    if (Number(changed.numAffectedRows) === 0) {
      throw new SizingDomainError(
        'NOT_FOUND',
        'Active product sizing configuration was not found.',
      );
    }

    await bumpProductVersion(transaction, input.organizationId, input.productId);

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'PRODUCT_SIZING_REMOVED',
      targetType: 'PRODUCT',
      targetId: input.productId,
    });
  });
}

export async function getProductSizingConfiguration(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
): Promise<{
  productId: string;
  productVersion: number | null;
  configured: boolean;
  sizeSystemId: string | null;
  sizeSystemName: string | null;
  sizeGuideId: string | null;
  sizeGuideName: string | null;
  sizeGuideStatus: LifecycleStatus | null;
  sizeGuideSystemId: string | null;
  hasPublishedGuide: boolean;
  configStatus: LifecycleStatus | null;
}> {
  const product = await sql<{ version: string | number }>`
    select version
    from catalog.products
    where id = ${productId}
      and organization_id = ${organizationId}
  `.execute(db);

  if (!product.rows[0]) {
    throw new SizingDomainError('NOT_FOUND', 'Product was not found.');
  }

  const result = await sql<{
    size_system_id: string;
    system_name: string;
    size_guide_id: string | null;
    guide_name: string | null;
    guide_status: LifecycleStatus | null;
    guide_size_system_id: string | null;
    has_published_guide: boolean;
    config_status: LifecycleStatus;
  }>`
    select
      config.size_system_id::text,
      system.name as system_name,
      config.size_guide_id::text,
      guide.name as guide_name,
      guide.status as guide_status,
      guide.size_system_id::text as guide_size_system_id,
      (guide.current_published_revision_id is not null) as has_published_guide,
      config.status as config_status
    from sizing.product_size_configurations config
    join sizing.size_systems system
      on system.id = config.size_system_id
     and system.organization_id = config.organization_id
    left join sizing.size_guides guide
      on guide.id = config.size_guide_id
     and guide.organization_id = config.organization_id
    where config.product_id = ${productId}
      and config.organization_id = ${organizationId}
      and config.status = 'ACTIVE'
  `.execute(db);

  const productVersion = numberFromDatabase(product.rows[0].version);
  const row = result.rows[0];

  if (!row) {
    return {
      productId,
      productVersion,
      configured: false,
      sizeSystemId: null,
      sizeSystemName: null,
      sizeGuideId: null,
      sizeGuideName: null,
      sizeGuideStatus: null,
      sizeGuideSystemId: null,
      hasPublishedGuide: false,
      configStatus: null,
    };
  }

  return {
    productId,
    productVersion,
    configured: true,
    sizeSystemId: row.size_system_id,
    sizeSystemName: row.system_name,
    sizeGuideId: row.size_guide_id,
    sizeGuideName: row.guide_name,
    sizeGuideStatus: row.guide_status,
    sizeGuideSystemId: row.guide_size_system_id,
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
  await withSizingTransaction(db, async (transaction) => {
    const category = await sql<{ id: string }>`
      select id::text
      from catalog.categories
      where id = ${input.categoryId}
        and organization_id = ${input.organizationId}
        and status <> 'ARCHIVED'
      for update
    `.execute(transaction);

    if (!category.rows[0]) {
      throw new SizingDomainError('NOT_FOUND', 'Active category was not found.');
    }

    if (input.sizeGuideId) {
      const guide = await sql<{ id: string }>`
        select id::text
        from sizing.size_guides
        where id = ${input.sizeGuideId}
          and organization_id = ${input.organizationId}
          and status = 'ACTIVE'
          and current_published_revision_id is not null
        for share
      `.execute(transaction);

      if (!guide.rows[0]) {
        throw new SizingDomainError(
          'VALIDATION_ERROR',
          'Category default must reference an active size guide with a published revision.',
        );
      }
    }

    await sql`
      update catalog.categories
      set default_size_guide_id = ${input.sizeGuideId ?? null}
      where id = ${input.categoryId}
        and organization_id = ${input.organizationId}
    `.execute(transaction);

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'CATEGORY_DEFAULT_GUIDE_SET',
      targetType: 'CATEGORY',
      targetId: input.categoryId,
      metadata: {
        sizeGuideId: input.sizeGuideId,
      },
    });
  });
}

// ─── Option value ↔ size definition mapping ───────────────────────────────────

async function linkOptionValueToSizeDefinitionInternal(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    optionValueId: string;
    sizeDefinitionId: string | null;
  },
): Promise<void> {
  const optionValue = await sql<{
    option_value_id: string;
    product_id: string;
    axis_code: string;
    configured_size_system_id: string | null;
  }>`
    select
      value.id::text as option_value_id,
      axis.product_id::text,
      axis.code as axis_code,
      configuration.size_system_id::text as configured_size_system_id
    from catalog.product_option_values value
    join catalog.product_option_axes axis
      on axis.id = value.option_axis_id
     and axis.organization_id = value.organization_id
    join catalog.products product
      on product.id = axis.product_id
     and product.organization_id = axis.organization_id
    left join sizing.product_size_configurations configuration
      on configuration.product_id = product.id
     and configuration.organization_id = product.organization_id
     and configuration.status = 'ACTIVE'
    where value.id = ${input.optionValueId}
      and value.organization_id = ${input.organizationId}
      and value.status = 'ACTIVE'
      and axis.status = 'ACTIVE'
  `.execute(db);

  const optionRow = optionValue.rows[0];
  if (!optionRow) {
    throw new SizingDomainError('NOT_FOUND', 'Active product option value was not found.');
  }

  if (!optionRow.axis_code.toLowerCase().includes('size')) {
    throw new SizingDomainError(
      'VALIDATION_ERROR',
      'Only values from a size option axis can be linked to a size definition.',
    );
  }

  if (input.sizeDefinitionId) {
    const definition = await sql<{
      id: string;
      size_system_id: string;
    }>`
      select id::text, size_system_id::text
      from sizing.size_definitions
      where id = ${input.sizeDefinitionId}
        and organization_id = ${input.organizationId}
        and status = 'ACTIVE'
    `.execute(db);

    const definitionRow = definition.rows[0];
    if (!definitionRow) {
      throw new SizingDomainError(
        'NOT_FOUND',
        'Active size definition was not found.',
      );
    }

    if (
      optionRow.configured_size_system_id &&
      optionRow.configured_size_system_id !== definitionRow.size_system_id
    ) {
      throw new SizingDomainError(
        'SYSTEM_MISMATCH',
        'The size definition does not belong to the product configured size system.',
      );
    }
  }

  const updated = await sql`
    update catalog.product_option_values
    set size_definition_id = ${input.sizeDefinitionId ?? null}
    where id = ${input.optionValueId}
      and organization_id = ${input.organizationId}
      and status = 'ACTIVE'
  `.execute(db);

  if (Number(updated.numAffectedRows) !== 1) {
    throw new SizingDomainError('NOT_FOUND', 'Active product option value was not found.');
  }
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
  await withSizingTransaction(db, async (transaction) => {
    await linkOptionValueToSizeDefinitionInternal(transaction, input);

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'OPTION_VALUE_SIZE_DEFINITION_SET',
      targetType: 'PRODUCT_OPTION_VALUE',
      targetId: input.optionValueId,
      metadata: {
        sizeDefinitionId: input.sizeDefinitionId,
      },
    });
  });
}

export async function linkOptionValuesToSizeDefinitionsBulk(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    mappings: Array<{
      optionValueId: string;
      sizeDefinitionId: string | null;
    }>;
    actorId: string;
  },
): Promise<void> {
  await withSizingTransaction(db, async (transaction) => {
    const ids = input.mappings.map((mapping) => mapping.optionValueId);
    if (new Set(ids).size !== ids.length) {
      throw new SizingDomainError(
        'VALIDATION_ERROR',
        'The same option value cannot appear more than once in a bulk mapping request.',
      );
    }

    for (const mapping of input.mappings) {
      await linkOptionValueToSizeDefinitionInternal(transaction, {
        organizationId: input.organizationId,
        optionValueId: mapping.optionValueId,
        sizeDefinitionId: mapping.sizeDefinitionId,
      });
    }

    await recordSizingAudit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'OPTION_VALUE_SIZE_DEFINITIONS_BULK_SET',
      targetType: 'ORGANIZATION',
      targetId: input.organizationId,
      metadata: {
        mappingCount: input.mappings.length,
      },
    });
  });
}

// ─── Guide list queries ────────────────────────────────────────────────────────

export interface SizeGuideListItem {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sizingDomainId: string;
  readonly sizingDomainName: string;
  readonly sizeSystemId: string | null;
  readonly sizeSystemName: string | null;
  readonly status: LifecycleStatus;
  readonly hasPublishedRevision: boolean;
  readonly version: number;
  readonly productCount: number;
  readonly categoryCount: number;
  readonly updatedAt: string;
}

export async function listSizeGuides(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    page: number;
    pageSize: number;
    status?: LifecycleStatus | 'ALL';
    domainId?: string;
    search?: string;
  },
): Promise<{ items: readonly SizeGuideListItem[]; totalItems: number }> {
  const offset = (input.page - 1) * input.pageSize;
  const statusFilter = input.status === 'ALL' ? null : (input.status ?? 'ACTIVE');
  const search = input.search?.trim() || null;

  const [rows, countResult] = await Promise.all([
    sql<{
      id: string;
      name: string;
      description: string | null;
      sizing_domain_id: string;
      domain_name: string;
      size_system_id: string | null;
      system_name: string | null;
      status: LifecycleStatus;
      has_published: boolean;
      version: string | number;
      product_count: string;
      category_count: string;
      updated_at: string;
    }>`
      select
        guide.id::text,
        guide.name,
        guide.description,
        guide.sizing_domain_id::text,
        domain.name as domain_name,
        guide.size_system_id::text,
        system.name as system_name,
        guide.status,
        (guide.current_published_revision_id is not null) as has_published,
        guide.version,
        count(distinct configuration.product_id)::text as product_count,
        count(distinct category.id)::text as category_count,
        guide.updated_at::text
      from sizing.size_guides guide
      join sizing.sizing_domains domain
        on domain.id = guide.sizing_domain_id
       and domain.organization_id = guide.organization_id
      left join sizing.size_systems system
        on system.id = guide.size_system_id
       and system.organization_id = guide.organization_id
      left join sizing.product_size_configurations configuration
        on configuration.size_guide_id = guide.id
       and configuration.organization_id = guide.organization_id
       and configuration.status = 'ACTIVE'
      left join catalog.categories category
        on category.default_size_guide_id = guide.id
       and category.organization_id = guide.organization_id
       and category.status <> 'ARCHIVED'
      where guide.organization_id = ${input.organizationId}
        and (${statusFilter}::text is null or guide.status = ${statusFilter}::text)
        and (${input.domainId ?? null}::uuid is null or guide.sizing_domain_id = ${input.domainId ?? null}::uuid)
        and (
          ${search}::text is null
          or guide.name ilike '%' || ${search ?? ''}::text || '%'
          or coalesce(guide.description, '') ilike '%' || ${search ?? ''}::text || '%'
          or domain.name ilike '%' || ${search ?? ''}::text || '%'
          or coalesce(system.name, '') ilike '%' || ${search ?? ''}::text || '%'
        )
      group by guide.id, domain.name, system.name
      order by guide.updated_at desc, guide.id
      limit ${input.pageSize}
      offset ${offset}
    `.execute(db),
    sql<{ count: string }>`
      select count(*)::text as count
      from sizing.size_guides guide
      join sizing.sizing_domains domain
        on domain.id = guide.sizing_domain_id
       and domain.organization_id = guide.organization_id
      left join sizing.size_systems system
        on system.id = guide.size_system_id
       and system.organization_id = guide.organization_id
      where guide.organization_id = ${input.organizationId}
        and (${statusFilter}::text is null or guide.status = ${statusFilter}::text)
        and (${input.domainId ?? null}::uuid is null or guide.sizing_domain_id = ${input.domainId ?? null}::uuid)
        and (
          ${search}::text is null
          or guide.name ilike '%' || ${search ?? ''}::text || '%'
          or coalesce(guide.description, '') ilike '%' || ${search ?? ''}::text || '%'
          or domain.name ilike '%' || ${search ?? ''}::text || '%'
          or coalesce(system.name, '') ilike '%' || ${search ?? ''}::text || '%'
        )
    `.execute(db),
  ]);

  return {
    items: rows.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      sizingDomainId: row.sizing_domain_id,
      sizingDomainName: row.domain_name,
      sizeSystemId: row.size_system_id,
      sizeSystemName: row.system_name,
      status: row.status,
      hasPublishedRevision: row.has_published,
      version: numberFromDatabase(row.version),
      productCount: Number(row.product_count),
      categoryCount: Number(row.category_count),
      updatedAt: row.updated_at,
    })),
    totalItems: Number(countResult.rows[0]?.count ?? 0),
  };
}

// ─── Size guide detail ─────────────────────────────────────────────────────────

export interface SizeGuideDetail {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sizingDomainId: string;
  readonly sizingDomainName: string;
  readonly sizeSystemId: string | null;
  readonly sizeSystemName: string | null;
  readonly status: LifecycleStatus;
  readonly currentPublishedRevisionId: string | null;
  readonly version: number;
  readonly revisions: readonly {
    id: string;
    revisionNumber: number;
    status: RevisionStatus;
    version: number;
    instructions: string | null;
    fitNotes: string | null;
    createdAt: string;
    publishedAt: string | null;
    rows: readonly {
      id: string;
      displayLabel: string;
      position: number;
      sizeDefinitionId: string | null;
      sizeDefinitionLabel: string | null;
      measurements: readonly {
        measurementDefinitionId: string;
        measurementDefinitionName: string;
        exact: string | null;
        min: string | null;
        max: string | null;
        unit: MeasurementUnit;
        approximate: boolean;
      }[];
    }[];
  }[];
  readonly products: readonly {
    id: string;
    title: string;
    handle: string;
  }[];
  readonly categories: readonly {
    id: string;
    name: string;
    handle: string;
  }[];
}

export async function getSizeGuideDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  guideId: string,
): Promise<SizeGuideDetail | null> {
  const [
    guideResult,
    revisionsResult,
    rowsResult,
    measurementsResult,
    productsResult,
    categoriesResult,
  ] = await Promise.all([
    sql<{
      id: string;
      name: string;
      description: string | null;
      sizing_domain_id: string;
      domain_name: string;
      size_system_id: string | null;
      system_name: string | null;
      status: LifecycleStatus;
      current_published_revision_id: string | null;
      version: string | number;
    }>`
      select
        guide.id::text,
        guide.name,
        guide.description,
        guide.sizing_domain_id::text,
        domain.name as domain_name,
        guide.size_system_id::text,
        system.name as system_name,
        guide.status,
        guide.current_published_revision_id::text,
        guide.version
      from sizing.size_guides guide
      join sizing.sizing_domains domain
        on domain.id = guide.sizing_domain_id
       and domain.organization_id = guide.organization_id
      left join sizing.size_systems system
        on system.id = guide.size_system_id
       and system.organization_id = guide.organization_id
      where guide.id = ${guideId}
        and guide.organization_id = ${organizationId}
    `.execute(db),
    sql<{
      id: string;
      revision_number: number;
      status: RevisionStatus;
      version: string | number;
      instructions: string | null;
      fit_notes: string | null;
      created_at: string;
      published_at: string | null;
    }>`
      select
        id::text,
        revision_number,
        status,
        version,
        instructions,
        fit_notes,
        created_at::text,
        published_at::text
      from sizing.size_guide_revisions
      where size_guide_id = ${guideId}
        and organization_id = ${organizationId}
      order by revision_number desc
    `.execute(db),
    sql<{
      id: string;
      revision_id: string;
      display_label: string;
      position: number;
      size_definition_id: string | null;
      size_definition_label: string | null;
    }>`
      select
        row.id::text,
        row.revision_id::text,
        row.display_label,
        row.position,
        row.size_definition_id::text,
        definition.label as size_definition_label
      from sizing.size_guide_rows row
      join sizing.size_guide_revisions revision
        on revision.id = row.revision_id
       and revision.organization_id = row.organization_id
      left join sizing.size_definitions definition
        on definition.id = row.size_definition_id
       and definition.organization_id = row.organization_id
      where revision.size_guide_id = ${guideId}
        and row.organization_id = ${organizationId}
      order by row.position, row.id
    `.execute(db),
    sql<{
      row_id: string;
      measurement_definition_id: string;
      measurement_definition_name: string;
      value_exact: string | null;
      value_min: string | null;
      value_max: string | null;
      unit_code: MeasurementUnit;
      is_approximate: boolean;
    }>`
      select
        measurement.row_id::text,
        measurement.measurement_definition_id::text,
        definition.name as measurement_definition_name,
        measurement.value_exact::text,
        measurement.value_min::text,
        measurement.value_max::text,
        measurement.unit_code,
        measurement.is_approximate
      from sizing.size_guide_measurements measurement
      join sizing.size_guide_rows row
        on row.id = measurement.row_id
       and row.organization_id = measurement.organization_id
      join sizing.size_guide_revisions revision
        on revision.id = row.revision_id
       and revision.organization_id = row.organization_id
      join sizing.measurement_definitions definition
        on definition.id = measurement.measurement_definition_id
       and definition.organization_id = measurement.organization_id
      where revision.size_guide_id = ${guideId}
        and measurement.organization_id = ${organizationId}
      order by definition.sort_order, definition.name, definition.id
    `.execute(db),
    sql<{ id: string; title: string; handle: string }>`
      select product.id::text, product.title, product.handle
      from sizing.product_size_configurations configuration
      join catalog.products product
        on product.id = configuration.product_id
       and product.organization_id = configuration.organization_id
      where configuration.size_guide_id = ${guideId}
        and configuration.organization_id = ${organizationId}
        and configuration.status = 'ACTIVE'
      order by product.title, product.id
    `.execute(db),
    sql<{ id: string; name: string; handle: string }>`
      select id::text, name, handle
      from catalog.categories
      where default_size_guide_id = ${guideId}
        and organization_id = ${organizationId}
        and status <> 'ARCHIVED'
      order by name, id
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
    sizeSystemId: guide.size_system_id,
    sizeSystemName: guide.system_name,
    status: guide.status,
    currentPublishedRevisionId: guide.current_published_revision_id,
    version: numberFromDatabase(guide.version),
    revisions: revisionsResult.rows.map((revision) => ({
      id: revision.id,
      revisionNumber: revision.revision_number,
      status: revision.status,
      version: numberFromDatabase(revision.version),
      instructions: revision.instructions,
      fitNotes: revision.fit_notes,
      createdAt: revision.created_at,
      publishedAt: revision.published_at,
      rows: rowsResult.rows
        .filter((row) => row.revision_id === revision.id)
        .map((row) => ({
          id: row.id,
          displayLabel: row.display_label,
          position: row.position,
          sizeDefinitionId: row.size_definition_id,
          sizeDefinitionLabel: row.size_definition_label,
          measurements: measurementsResult.rows
            .filter((measurement) => measurement.row_id === row.id)
            .map((measurement) => ({
              measurementDefinitionId: measurement.measurement_definition_id,
              measurementDefinitionName: measurement.measurement_definition_name,
              exact: measurement.value_exact,
              min: measurement.value_min,
              max: measurement.value_max,
              unit: measurement.unit_code,
              approximate: measurement.is_approximate,
            })),
        })),
    })),
    products: productsResult.rows,
    categories: categoriesResult.rows,
  };
}

// ─── Admin workspace ───────────────────────────────────────────────────────────

export interface AdminSizingWorkspace {
  readonly domains: readonly {
    id: string;
    code: string;
    name: string;
    subjectType: SubjectType;
    status: LifecycleStatus;
  }[];
  readonly systems: readonly {
    id: string;
    sizingDomainId: string;
    code: string;
    name: string;
    regionCode: string | null;
    status: LifecycleStatus;
  }[];
  readonly sizeDefinitions: readonly {
    id: string;
    sizeSystemId: string;
    code: string;
    label: string;
    sortOrder: number;
    status: LifecycleStatus;
  }[];
  readonly measurementDefinitions: readonly {
    id: string;
    sizingDomainId: string;
    code: string;
    name: string;
    description: string | null;
    instructions: string | null;
    sortOrder: number;
    subjectType: SubjectType;
    defaultUnit: MeasurementUnit;
    status: LifecycleStatus;
  }[];
  readonly guides: readonly {
    id: string;
    name: string;
    description: string | null;
    sizingDomainId: string;
    sizeSystemId: string | null;
    status: LifecycleStatus;
    currentPublishedRevisionId: string | null;
    version: number;
    revisions: readonly {
      id: string;
      revisionNumber: number;
      status: RevisionStatus;
      version: number;
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
          unit: MeasurementUnit;
          approximate: boolean;
        }[];
      }[];
    }[];
  }[];
  readonly productConfigurations: readonly {
    productId: string;
    productTitle: string;
    productVersion: number;
    sizeSystemId: string;
    sizeGuideId: string | null;
    status: LifecycleStatus;
  }[];
}

/**
 * Complete tenant-scoped Admin read model.
 *
 * This intentionally includes archived taxonomy resources so the Admin UI can
 * implement archive/restore workflows without a second bootstrap endpoint.
 */
export async function getAdminSizingWorkspace(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<AdminSizingWorkspace> {
  const [
    domains,
    systems,
    definitions,
    measurements,
    guides,
    revisions,
    rows,
    values,
    configs,
  ] = await Promise.all([
    sql<{
      id: string;
      code: string;
      name: string;
      subject_type: SubjectType;
      status: LifecycleStatus;
    }>`
      select id::text, code, name, subject_type, status
      from sizing.sizing_domains
      where organization_id = ${organizationId}
      order by status, name, id
    `.execute(db),
    sql<{
      id: string;
      sizing_domain_id: string;
      code: string;
      name: string;
      region_code: string | null;
      status: LifecycleStatus;
    }>`
      select id::text, sizing_domain_id::text, code, name, region_code, status
      from sizing.size_systems
      where organization_id = ${organizationId}
      order by status, name, id
    `.execute(db),
    sql<{
      id: string;
      size_system_id: string;
      code: string;
      label: string;
      sort_order: number;
      status: LifecycleStatus;
    }>`
      select id::text, size_system_id::text, code, label, sort_order, status
      from sizing.size_definitions
      where organization_id = ${organizationId}
      order by status, sort_order, label, id
    `.execute(db),
    sql<{
      id: string;
      sizing_domain_id: string;
      code: string;
      name: string;
      description: string | null;
      instructions: string | null;
      sort_order: number;
      subject_type: SubjectType;
      default_unit: MeasurementUnit;
      status: LifecycleStatus;
    }>`
      select
        id::text,
        sizing_domain_id::text,
        code,
        name,
        description,
        instructions,
        sort_order,
        subject_type,
        default_unit,
        status
      from sizing.measurement_definitions
      where organization_id = ${organizationId}
      order by status, sort_order, name, id
    `.execute(db),
    sql<{
      id: string;
      name: string;
      description: string | null;
      sizing_domain_id: string;
      size_system_id: string | null;
      status: LifecycleStatus;
      current_published_revision_id: string | null;
      version: string | number;
    }>`
      select
        id::text,
        name,
        description,
        sizing_domain_id::text,
        size_system_id::text,
        status,
        current_published_revision_id::text,
        version
      from sizing.size_guides
      where organization_id = ${organizationId}
      order by updated_at desc, id
    `.execute(db),
    sql<{
      id: string;
      size_guide_id: string;
      revision_number: number;
      status: RevisionStatus;
      version: string | number;
      instructions: string | null;
      fit_notes: string | null;
      created_at: string;
      published_at: string | null;
    }>`
      select
        id::text,
        size_guide_id::text,
        revision_number,
        status,
        version,
        instructions,
        fit_notes,
        created_at::text,
        published_at::text
      from sizing.size_guide_revisions
      where organization_id = ${organizationId}
      order by revision_number desc, id
    `.execute(db),
    sql<{
      id: string;
      revision_id: string;
      display_label: string;
      position: number;
      size_definition_id: string | null;
    }>`
      select id::text, revision_id::text, display_label, position, size_definition_id::text
      from sizing.size_guide_rows
      where organization_id = ${organizationId}
      order by position, id
    `.execute(db),
    sql<{
      row_id: string;
      measurement_definition_id: string;
      value_exact: string | null;
      value_min: string | null;
      value_max: string | null;
      unit_code: MeasurementUnit;
      is_approximate: boolean;
    }>`
      select
        row_id::text,
        measurement_definition_id::text,
        value_exact::text,
        value_min::text,
        value_max::text,
        unit_code,
        is_approximate
      from sizing.size_guide_measurements
      where organization_id = ${organizationId}
    `.execute(db),
    sql<{
      product_id: string;
      product_title: string;
      product_version: string | number;
      size_system_id: string;
      size_guide_id: string | null;
      status: LifecycleStatus;
    }>`
      select
        configuration.product_id::text,
        product.title as product_title,
        product.version as product_version,
        configuration.size_system_id::text,
        configuration.size_guide_id::text,
        configuration.status
      from sizing.product_size_configurations configuration
      join catalog.products product
        on product.id = configuration.product_id
       and product.organization_id = configuration.organization_id
      where configuration.organization_id = ${organizationId}
      order by product.title, product.id
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
      status: row.status,
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
      status: row.status,
    })),
    guides: guides.rows.map((guide) => ({
      id: guide.id,
      name: guide.name,
      description: guide.description,
      sizingDomainId: guide.sizing_domain_id,
      sizeSystemId: guide.size_system_id,
      status: guide.status,
      currentPublishedRevisionId: guide.current_published_revision_id,
      version: numberFromDatabase(guide.version),
      revisions: revisions.rows
        .filter((revision) => revision.size_guide_id === guide.id)
        .map((revision) => ({
          id: revision.id,
          revisionNumber: revision.revision_number,
          status: revision.status,
          version: numberFromDatabase(revision.version),
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
      productVersion: numberFromDatabase(row.product_version),
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
  readonly productConfigurationsWithSystemGuideMismatch: number;
  readonly publishedRevisionsWithEmptyRows: number;
  readonly publishedRowsWithoutMeasurements: number;
  readonly optionValuesInSizeAxisWithoutSizeDefinitionLink: number;
  readonly optionValuesMappedOutsideConfiguredSystem: number;
  readonly guideRowsWithSystemMismatch: number;
  readonly categoryDefaultsUsingUnavailableGuide: number;
  readonly activeDefinitionsUnderArchivedSystem: number;
  readonly activeMeasurementsUnderArchivedDomain: number;
}

export async function getSizingQualityChecks(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<SizingQualityChecks> {
  const [
    noConfig,
    noGuide,
    archivedGuide,
    configGuideMismatch,
    emptyRevisions,
    emptyPublishedRows,
    unlinkedValues,
    optionSystemMismatch,
    guideRowMismatch,
    categoryGuideUnavailable,
    orphanedDefinitions,
    orphanedMeasurements,
  ] = await Promise.all([
    sql<{ count: string }>`
      select count(distinct product.id)::text as count
      from catalog.products product
      join catalog.product_option_axes axis
        on axis.product_id = product.id
       and axis.organization_id = product.organization_id
       and axis.status = 'ACTIVE'
      where product.organization_id = ${organizationId}
        and lower(axis.code) like '%size%'
        and not exists (
          select 1
          from sizing.product_size_configurations configuration
          where configuration.product_id = product.id
            and configuration.organization_id = product.organization_id
            and configuration.status = 'ACTIVE'
        )
    `.execute(db),
    sql<{ count: string }>`
      select count(*)::text as count
      from sizing.product_size_configurations configuration
      where configuration.organization_id = ${organizationId}
        and configuration.status = 'ACTIVE'
        and (
          configuration.size_guide_id is null
          or not exists (
            select 1
            from sizing.size_guides guide
            where guide.id = configuration.size_guide_id
              and guide.organization_id = configuration.organization_id
              and guide.status = 'ACTIVE'
              and guide.current_published_revision_id is not null
          )
        )
    `.execute(db),
    sql<{ count: string }>`
      select count(*)::text as count
      from sizing.product_size_configurations configuration
      join sizing.size_guides guide
        on guide.id = configuration.size_guide_id
       and guide.organization_id = configuration.organization_id
      where configuration.organization_id = ${organizationId}
        and configuration.status = 'ACTIVE'
        and guide.status = 'ARCHIVED'
    `.execute(db),
    sql<{ count: string }>`
      select count(*)::text as count
      from sizing.product_size_configurations configuration
      join sizing.size_systems system
        on system.id = configuration.size_system_id
       and system.organization_id = configuration.organization_id
      join sizing.size_guides guide
        on guide.id = configuration.size_guide_id
       and guide.organization_id = configuration.organization_id
      where configuration.organization_id = ${organizationId}
        and configuration.status = 'ACTIVE'
        and (
          guide.sizing_domain_id <> system.sizing_domain_id
          or (guide.size_system_id is not null and guide.size_system_id <> configuration.size_system_id)
        )
    `.execute(db),
    sql<{ count: string }>`
      select count(*)::text as count
      from sizing.size_guide_revisions revision
      where revision.organization_id = ${organizationId}
        and revision.status = 'PUBLISHED'
        and not exists (
          select 1
          from sizing.size_guide_rows row
          where row.revision_id = revision.id
            and row.organization_id = revision.organization_id
        )
    `.execute(db),
    sql<{ count: string }>`
      select count(*)::text as count
      from sizing.size_guide_rows row
      join sizing.size_guide_revisions revision
        on revision.id = row.revision_id
       and revision.organization_id = row.organization_id
      where row.organization_id = ${organizationId}
        and revision.status = 'PUBLISHED'
        and not exists (
          select 1
          from sizing.size_guide_measurements measurement
          where measurement.row_id = row.id
            and measurement.organization_id = row.organization_id
        )
    `.execute(db),
    sql<{ count: string }>`
      select count(distinct value.id)::text as count
      from catalog.product_option_values value
      join catalog.product_option_axes axis
        on axis.id = value.option_axis_id
       and axis.organization_id = value.organization_id
      where value.organization_id = ${organizationId}
        and value.status = 'ACTIVE'
        and axis.status = 'ACTIVE'
        and lower(axis.code) like '%size%'
        and value.size_definition_id is null
    `.execute(db),
    sql<{ count: string }>`
      select count(*)::text as count
      from catalog.product_option_values value
      join catalog.product_option_axes axis
        on axis.id = value.option_axis_id
       and axis.organization_id = value.organization_id
      join sizing.product_size_configurations configuration
        on configuration.product_id = axis.product_id
       and configuration.organization_id = axis.organization_id
       and configuration.status = 'ACTIVE'
      join sizing.size_definitions definition
        on definition.id = value.size_definition_id
       and definition.organization_id = value.organization_id
      where value.organization_id = ${organizationId}
        and value.status = 'ACTIVE'
        and definition.size_system_id <> configuration.size_system_id
    `.execute(db),
    sql<{ count: string }>`
      select count(*)::text as count
      from sizing.size_guide_rows row
      join sizing.size_guide_revisions revision
        on revision.id = row.revision_id
       and revision.organization_id = row.organization_id
      join sizing.size_guides guide
        on guide.id = revision.size_guide_id
       and guide.organization_id = revision.organization_id
      join sizing.size_definitions definition
        on definition.id = row.size_definition_id
       and definition.organization_id = row.organization_id
      where row.organization_id = ${organizationId}
        and (
          guide.size_system_id is null
          or definition.size_system_id <> guide.size_system_id
        )
    `.execute(db),
    sql<{ count: string }>`
      select count(*)::text as count
      from catalog.categories category
      join sizing.size_guides guide
        on guide.id = category.default_size_guide_id
       and guide.organization_id = category.organization_id
      where category.organization_id = ${organizationId}
        and category.status <> 'ARCHIVED'
        and (
          guide.status <> 'ACTIVE'
          or guide.current_published_revision_id is null
        )
    `.execute(db),
    sql<{ count: string }>`
      select count(*)::text as count
      from sizing.size_definitions definition
      join sizing.size_systems system
        on system.id = definition.size_system_id
       and system.organization_id = definition.organization_id
      where definition.organization_id = ${organizationId}
        and definition.status = 'ACTIVE'
        and system.status = 'ARCHIVED'
    `.execute(db),
    sql<{ count: string }>`
      select count(*)::text as count
      from sizing.measurement_definitions definition
      join sizing.sizing_domains domain
        on domain.id = definition.sizing_domain_id
       and domain.organization_id = definition.organization_id
      where definition.organization_id = ${organizationId}
        and definition.status = 'ACTIVE'
        and domain.status = 'ARCHIVED'
    `.execute(db),
  ]);

  return {
    productsWithSizeAxisButNoSizingConfig: Number(noConfig.rows[0]?.count ?? 0),
    productsWithConfigButNoPublishedGuide: Number(noGuide.rows[0]?.count ?? 0),
    productsUsingArchivedGuide: Number(archivedGuide.rows[0]?.count ?? 0),
    productConfigurationsWithSystemGuideMismatch: Number(
      configGuideMismatch.rows[0]?.count ?? 0,
    ),
    publishedRevisionsWithEmptyRows: Number(emptyRevisions.rows[0]?.count ?? 0),
    publishedRowsWithoutMeasurements: Number(emptyPublishedRows.rows[0]?.count ?? 0),
    optionValuesInSizeAxisWithoutSizeDefinitionLink: Number(
      unlinkedValues.rows[0]?.count ?? 0,
    ),
    optionValuesMappedOutsideConfiguredSystem: Number(
      optionSystemMismatch.rows[0]?.count ?? 0,
    ),
    guideRowsWithSystemMismatch: Number(guideRowMismatch.rows[0]?.count ?? 0),
    categoryDefaultsUsingUnavailableGuide: Number(
      categoryGuideUnavailable.rows[0]?.count ?? 0,
    ),
    activeDefinitionsUnderArchivedSystem: Number(
      orphanedDefinitions.rows[0]?.count ?? 0,
    ),
    activeMeasurementsUnderArchivedDomain: Number(
      orphanedMeasurements.rows[0]?.count ?? 0,
    ),
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
 * Priority: product's own published guide -> primary/default category guide -> null.
 *
 * If the product has a sizing configuration, a category fallback must be compatible
 * with that configured size system/domain.
 */
export async function getPublicSizeGuideForProduct(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
): Promise<PublicSizeGuide | null> {
  const guide = await sql<{
    guide_id: string;
    name: string;
    revision_id: string;
    instructions: string | null;
    fit_notes: string | null;
  }>`
    with product_context as (
      select
        product.id,
        product.primary_category_id,
        configuration.size_system_id,
        configured_system.sizing_domain_id as configured_domain_id
      from catalog.products product
      left join sizing.product_size_configurations configuration
        on configuration.product_id = product.id
       and configuration.organization_id = product.organization_id
       and configuration.status = 'ACTIVE'
      left join sizing.size_systems configured_system
        on configured_system.id = configuration.size_system_id
       and configured_system.organization_id = configuration.organization_id
      where product.id = ${productId}
        and product.organization_id = ${organizationId}
      limit 1
    ),
    chosen_category as (
      select coalesce(
        context.primary_category_id,
        (
          select product_category.category_id
          from catalog.product_categories product_category
          where product_category.product_id = context.id
            and product_category.organization_id = ${organizationId}
          order by product_category.category_id
          limit 1
        )
      ) as category_id,
      context.size_system_id,
      context.configured_domain_id
      from product_context context
    ),
    candidate_guides as (
      select
        guide.id as guide_id,
        guide.name,
        revision.id as revision_id,
        revision.instructions,
        revision.fit_notes,
        1 as priority
      from sizing.product_size_configurations configuration
      join sizing.size_guides guide
        on guide.id = configuration.size_guide_id
       and guide.organization_id = configuration.organization_id
      join sizing.size_guide_revisions revision
        on revision.id = guide.current_published_revision_id
       and revision.organization_id = guide.organization_id
      where configuration.organization_id = ${organizationId}
        and configuration.product_id = ${productId}
        and configuration.status = 'ACTIVE'
        and guide.status = 'ACTIVE'
        and revision.status = 'PUBLISHED'

      union all

      select
        guide.id as guide_id,
        guide.name,
        revision.id as revision_id,
        revision.instructions,
        revision.fit_notes,
        2 as priority
      from chosen_category chosen
      join catalog.categories category
        on category.id = chosen.category_id
       and category.organization_id = ${organizationId}
       and category.status <> 'ARCHIVED'
      join sizing.size_guides guide
        on guide.id = category.default_size_guide_id
       and guide.organization_id = ${organizationId}
      join sizing.size_guide_revisions revision
        on revision.id = guide.current_published_revision_id
       and revision.organization_id = guide.organization_id
      where guide.status = 'ACTIVE'
        and revision.status = 'PUBLISHED'
        and (
          chosen.size_system_id is null
          or (
            guide.sizing_domain_id = chosen.configured_domain_id
            and (guide.size_system_id is null or guide.size_system_id = chosen.size_system_id)
          )
        )
        and not exists (
          select 1
          from sizing.product_size_configurations configuration
          where configuration.organization_id = ${organizationId}
            and configuration.product_id = ${productId}
            and configuration.status = 'ACTIVE'
            and configuration.size_guide_id is not null
        )
    )
    select guide_id::text, name, revision_id::text, instructions, fit_notes
    from candidate_guides
    order by priority
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
    select
      size_row.id::text as row_id,
      size_row.display_label as label,
      definition.name,
      definition.instructions,
      measurement.value_exact::text,
      measurement.value_min::text,
      measurement.value_max::text,
      measurement.unit_code,
      measurement.is_approximate
    from sizing.size_guide_rows size_row
    join sizing.size_guide_measurements measurement
      on measurement.row_id = size_row.id
     and measurement.organization_id = size_row.organization_id
    join sizing.measurement_definitions definition
      on definition.id = measurement.measurement_definition_id
     and definition.organization_id = measurement.organization_id
    where size_row.revision_id = ${row.revision_id}
      and size_row.organization_id = ${organizationId}
    order by
      size_row.position,
      size_row.id,
      definition.sort_order,
      definition.name,
      definition.id
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
    const current = sizeRows.get(measurement.row_id) ?? {
      label: measurement.label,
      measurements: [],
    };

    current.measurements.push({
      name: measurement.name,
      instructions: measurement.instructions,
      ...(measurement.value_exact !== null ? { exact: measurement.value_exact } : {}),
      ...(measurement.value_min !== null ? { min: measurement.value_min } : {}),
      ...(measurement.value_max !== null ? { max: measurement.value_max } : {}),
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

// ─── Category defaults ─────────────────────────────────────────────────────────

export interface CategorySizeGuideDefaultItem {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categoryPath: string;
  readonly sizeGuideId: string | null;
  readonly sizeGuideName: string | null;
  readonly sizeGuideStatus: LifecycleStatus | null;
  readonly hasPublishedGuide: boolean;
}

export async function listCategorySizeGuideDefaults(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    page: number;
    pageSize: number;
    search?: string;
    mappingStatus?: 'MAPPED' | 'UNMAPPED' | 'ALL';
  },
): Promise<{
  items: readonly CategorySizeGuideDefaultItem[];
  totalItems: number;
}> {
  const offset = (input.page - 1) * input.pageSize;
  const search = input.search?.trim() || null;
  const mappingStatus = input.mappingStatus ?? 'ALL';

  const baseCte = sql`
    with recursive tree as (
      select
        id,
        name,
        handle,
        parent_category_id,
        ('/' || handle)::text as path
      from catalog.categories
      where organization_id = ${input.organizationId}
        and parent_category_id is null
        and status <> 'ARCHIVED'

      union all

      select
        child.id,
        child.name,
        child.handle,
        child.parent_category_id,
        (tree.path || '/' || child.handle)::text as path
      from catalog.categories child
      join tree on tree.id = child.parent_category_id
      where child.organization_id = ${input.organizationId}
        and child.status <> 'ARCHIVED'
    )
  `;

  const [result, countResult] = await Promise.all([
    sql<{
      category_id: string;
      category_name: string;
      category_path: string;
      size_guide_id: string | null;
      size_guide_name: string | null;
      size_guide_status: LifecycleStatus | null;
      has_published_guide: boolean;
    }>`
      ${baseCte}
      select
        category.id::text as category_id,
        category.name as category_name,
        coalesce(tree.path, '/' || category.handle) as category_path,
        category.default_size_guide_id::text as size_guide_id,
        guide.name as size_guide_name,
        guide.status as size_guide_status,
        (guide.current_published_revision_id is not null) as has_published_guide
      from catalog.categories category
      left join tree on tree.id = category.id
      left join sizing.size_guides guide
        on guide.id = category.default_size_guide_id
       and guide.organization_id = ${input.organizationId}
      where category.organization_id = ${input.organizationId}
        and category.status <> 'ARCHIVED'
        and (
          ${mappingStatus} = 'ALL'
          or (${mappingStatus} = 'MAPPED' and category.default_size_guide_id is not null)
          or (${mappingStatus} = 'UNMAPPED' and category.default_size_guide_id is null)
        )
        and (
          ${search}::text is null
          or category.name ilike '%' || ${search ?? ''}::text || '%'
          or coalesce(tree.path, '/' || category.handle) ilike '%' || ${search ?? ''}::text || '%'
          or coalesce(guide.name, '') ilike '%' || ${search ?? ''}::text || '%'
        )
      order by category_path, category.name, category.id
      limit ${input.pageSize}
      offset ${offset}
    `.execute(db),
    sql<{ count: string }>`
      ${baseCte}
      select count(*)::text as count
      from catalog.categories category
      left join tree on tree.id = category.id
      left join sizing.size_guides guide
        on guide.id = category.default_size_guide_id
       and guide.organization_id = ${input.organizationId}
      where category.organization_id = ${input.organizationId}
        and category.status <> 'ARCHIVED'
        and (
          ${mappingStatus} = 'ALL'
          or (${mappingStatus} = 'MAPPED' and category.default_size_guide_id is not null)
          or (${mappingStatus} = 'UNMAPPED' and category.default_size_guide_id is null)
        )
        and (
          ${search}::text is null
          or category.name ilike '%' || ${search ?? ''}::text || '%'
          or coalesce(tree.path, '/' || category.handle) ilike '%' || ${search ?? ''}::text || '%'
          or coalesce(guide.name, '') ilike '%' || ${search ?? ''}::text || '%'
        )
    `.execute(db),
  ]);

  return {
    items: result.rows.map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryPath: row.category_path,
      sizeGuideId: row.size_guide_id,
      sizeGuideName: row.size_guide_name,
      sizeGuideStatus: row.size_guide_status,
      hasPublishedGuide: row.has_published_guide,
    })),
    totalItems: Number(countResult.rows[0]?.count ?? 0),
  };
}

// ─── Option value mapping read model ───────────────────────────────────────────

export interface SizeOptionValueMappingItem {
  readonly optionValueId: string;
  readonly optionValueLabel: string;
  readonly optionAxisId: string;
  readonly optionAxisName: string;
  readonly productTitle: string;
  readonly productId: string;
  readonly configuredSizeSystemId: string | null;
  readonly sizeDefinitionId: string | null;
  readonly sizeDefinitionLabel: string | null;
  readonly sizeDefinitionSystemId: string | null;
}

export async function listSizeOptionValuesWithMapping(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    page: number;
    pageSize: number;
    search?: string;
    mappingStatus?: 'MAPPED' | 'UNMAPPED' | 'ALL';
    sizeSystemId?: string;
    optionId?: string;
  },
): Promise<{
  items: readonly SizeOptionValueMappingItem[];
  totalItems: number;
}> {
  const offset = (input.page - 1) * input.pageSize;
  const search = input.search?.trim() || null;
  const mappingStatus = input.mappingStatus ?? 'ALL';

  const [result, countResult] = await Promise.all([
    sql<{
      option_value_id: string;
      option_value_label: string;
      option_axis_id: string;
      option_axis_name: string;
      product_title: string;
      product_id: string;
      configured_size_system_id: string | null;
      size_definition_id: string | null;
      size_definition_label: string | null;
      size_definition_system_id: string | null;
    }>`
      select
        value.id::text as option_value_id,
        value.display_value as option_value_label,
        axis.id::text as option_axis_id,
        axis.name as option_axis_name,
        product.title as product_title,
        product.id::text as product_id,
        configuration.size_system_id::text as configured_size_system_id,
        value.size_definition_id::text,
        definition.label as size_definition_label,
        definition.size_system_id::text as size_definition_system_id
      from catalog.product_option_values value
      join catalog.product_option_axes axis
        on axis.id = value.option_axis_id
       and axis.organization_id = value.organization_id
      join catalog.products product
        on product.id = axis.product_id
       and product.organization_id = axis.organization_id
      left join sizing.product_size_configurations configuration
        on configuration.product_id = product.id
       and configuration.organization_id = product.organization_id
       and configuration.status = 'ACTIVE'
      left join sizing.size_definitions definition
        on definition.id = value.size_definition_id
       and definition.organization_id = value.organization_id
      where value.organization_id = ${input.organizationId}
        and value.status = 'ACTIVE'
        and axis.status = 'ACTIVE'
        and lower(axis.code) like '%size%'
        and (
          ${mappingStatus} = 'ALL'
          or (${mappingStatus} = 'MAPPED' and value.size_definition_id is not null)
          or (${mappingStatus} = 'UNMAPPED' and value.size_definition_id is null)
        )
        and (${input.optionId ?? null}::uuid is null or axis.id = ${input.optionId ?? null}::uuid)
        and (
          ${input.sizeSystemId ?? null}::uuid is null
          or configuration.size_system_id = ${input.sizeSystemId ?? null}::uuid
          or definition.size_system_id = ${input.sizeSystemId ?? null}::uuid
        )
        and (
          ${search}::text is null
          or value.display_value ilike '%' || ${search ?? ''}::text || '%'
          or axis.name ilike '%' || ${search ?? ''}::text || '%'
          or product.title ilike '%' || ${search ?? ''}::text || '%'
          or coalesce(definition.label, '') ilike '%' || ${search ?? ''}::text || '%'
        )
      order by product.title, axis.name, value.position, value.display_value, value.id
      limit ${input.pageSize}
      offset ${offset}
    `.execute(db),
    sql<{ count: string }>`
      select count(*)::text as count
      from catalog.product_option_values value
      join catalog.product_option_axes axis
        on axis.id = value.option_axis_id
       and axis.organization_id = value.organization_id
      join catalog.products product
        on product.id = axis.product_id
       and product.organization_id = axis.organization_id
      left join sizing.product_size_configurations configuration
        on configuration.product_id = product.id
       and configuration.organization_id = product.organization_id
       and configuration.status = 'ACTIVE'
      left join sizing.size_definitions definition
        on definition.id = value.size_definition_id
       and definition.organization_id = value.organization_id
      where value.organization_id = ${input.organizationId}
        and value.status = 'ACTIVE'
        and axis.status = 'ACTIVE'
        and lower(axis.code) like '%size%'
        and (
          ${mappingStatus} = 'ALL'
          or (${mappingStatus} = 'MAPPED' and value.size_definition_id is not null)
          or (${mappingStatus} = 'UNMAPPED' and value.size_definition_id is null)
        )
        and (${input.optionId ?? null}::uuid is null or axis.id = ${input.optionId ?? null}::uuid)
        and (
          ${input.sizeSystemId ?? null}::uuid is null
          or configuration.size_system_id = ${input.sizeSystemId ?? null}::uuid
          or definition.size_system_id = ${input.sizeSystemId ?? null}::uuid
        )
        and (
          ${search}::text is null
          or value.display_value ilike '%' || ${search ?? ''}::text || '%'
          or axis.name ilike '%' || ${search ?? ''}::text || '%'
          or product.title ilike '%' || ${search ?? ''}::text || '%'
          or coalesce(definition.label, '') ilike '%' || ${search ?? ''}::text || '%'
        )
    `.execute(db),
  ]);

  return {
    items: result.rows.map((row) => ({
      optionValueId: row.option_value_id,
      optionValueLabel: row.option_value_label,
      optionAxisId: row.option_axis_id,
      optionAxisName: row.option_axis_name,
      productTitle: row.product_title,
      productId: row.product_id,
      configuredSizeSystemId: row.configured_size_system_id,
      sizeDefinitionId: row.size_definition_id,
      sizeDefinitionLabel: row.size_definition_label,
      sizeDefinitionSystemId: row.size_definition_system_id,
    })),
    totalItems: Number(countResult.rows[0]?.count ?? 0),
  };
}
