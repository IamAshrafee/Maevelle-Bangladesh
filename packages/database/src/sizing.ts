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

export async function createSizingDomain(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    code: string;
    name: string;
    subjectType: 'BODY' | 'GARMENT' | 'PRODUCT';
  },
): Promise<{ id: string }> {
  const result = await sql<{ id: string }>`
    insert into sizing.sizing_domains (organization_id, code, name, subject_type)
    values (${input.organizationId}, ${input.code}, ${input.name}, ${input.subjectType}) returning id
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new Error('Sizing domain creation did not return an id.');
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
  },
): Promise<{ id: string }> {
  const result = await sql<{ id: string }>`
    insert into sizing.measurement_definitions (organization_id, sizing_domain_id, code, name, subject_type, default_unit)
    select ${input.organizationId},domain.id,${input.code},${input.name},${input.subjectType},${input.defaultUnit}
    from sizing.sizing_domains domain
    where domain.id=${input.sizingDomainId} and domain.organization_id=${input.organizationId}
      and domain.status='ACTIVE'
    returning id
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new SizingDomainError('NOT_FOUND', 'Sizing domain was not found.');
  return row;
}

export async function createSizeGuide(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; name: string; sizingDomainId: string; actorId: string },
): Promise<{ id: string; revisionId: string }> {
  return db.transaction().execute(async (transaction) => {
    const guide = await sql<{ id: string }>`
      insert into sizing.size_guides (organization_id, name, sizing_domain_id)
      select ${input.organizationId},${input.name},domain.id
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
    return { id, revisionId };
  });
}

export async function createSizeGuideRevision(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; sizeGuideId: string; actorId: string; instructions?: string },
): Promise<{ id: string; revisionNumber: number }> {
  const result = await sql<{ id: string; revision_number: number }>`
    insert into sizing.size_guide_revisions (organization_id, size_guide_id, revision_number, instructions, created_by)
    select ${input.organizationId}, guide.id, coalesce(max(revision.revision_number), 0) + 1, ${input.instructions ?? null}, ${input.actorId}
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

export async function publishSizeGuideRevision(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; sizeGuideId: string; revisionId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    await assertDraftRevision(transaction, input.organizationId, input.revisionId);
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
  });
}

export async function attachSizeGuideToProduct(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; productId: string; sizeSystemId: string; sizeGuideId?: string },
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
}

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
    subjectType: 'BODY' | 'GARMENT' | 'PRODUCT';
    defaultUnit: 'cm' | 'inch';
  }[];
  readonly guides: readonly {
    id: string;
    name: string;
    sizingDomainId: string;
    status: 'ACTIVE' | 'ARCHIVED';
    currentPublishedRevisionId: string | null;
    version: number;
    revisions: readonly {
      id: string;
      revisionNumber: number;
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      instructions: string | null;
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
        subject_type: AdminSizingWorkspace['measurementDefinitions'][number]['subjectType'];
        default_unit: 'cm' | 'inch';
      }>`
        select id::text,sizing_domain_id::text,code,name,subject_type,default_unit
        from sizing.measurement_definitions where organization_id=${organizationId} and status='ACTIVE'
        order by name,id
      `.execute(db),
      sql<{
        id: string;
        name: string;
        sizing_domain_id: string;
        status: AdminSizingWorkspace['guides'][number]['status'];
        current_published_revision_id: string | null;
        version: string;
      }>`
        select id::text,name,sizing_domain_id::text,status,current_published_revision_id::text,version::text
        from sizing.size_guides where organization_id=${organizationId} order by updated_at desc,id
      `.execute(db),
      sql<{
        id: string;
        size_guide_id: string;
        revision_number: number;
        status: AdminSizingWorkspace['guides'][number]['revisions'][number]['status'];
        instructions: string | null;
        created_at: string;
        published_at: string | null;
      }>`
        select id::text,size_guide_id::text,revision_number,status,instructions,created_at::text,published_at::text
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
      subjectType: row.subject_type,
      defaultUnit: row.default_unit,
    })),
    guides: guides.rows.map((guide) => ({
      id: guide.id,
      name: guide.name,
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

export interface PublicSizeGuide {
  readonly name: string;
  readonly instructions: string | null;
  readonly rows: readonly {
    label: string;
    measurements: readonly {
      name: string;
      exact?: string;
      min?: string;
      max?: string;
      unit: string;
      approximate: boolean;
    }[];
  }[];
}

export async function getPublicSizeGuideForProduct(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
): Promise<PublicSizeGuide | undefined> {
  const guide = await sql<{
    guide_id: string;
    name: string;
    revision_id: string;
    instructions: string | null;
  }>`
    select guide.id as guide_id, guide.name, revision.id as revision_id, revision.instructions
    from sizing.product_size_configurations configuration
    join sizing.size_guides guide on guide.id = configuration.size_guide_id
    join sizing.size_guide_revisions revision on revision.id = guide.current_published_revision_id
    where configuration.organization_id = ${organizationId} and configuration.product_id = ${productId}
      and configuration.status = 'ACTIVE' and revision.status = 'PUBLISHED'
  `.execute(db);
  const row = guide.rows[0];
  if (!row) return undefined;
  const records = await sql<{
    row_id: string;
    label: string;
    name: string;
    value_exact: string | null;
    value_min: string | null;
    value_max: string | null;
    unit_code: string;
    is_approximate: boolean;
  }>`
    select size_row.id as row_id, size_row.display_label as label, definition.name,
      measurement.value_exact::text, measurement.value_min::text, measurement.value_max::text, measurement.unit_code, measurement.is_approximate
    from sizing.size_guide_rows size_row
    join sizing.size_guide_measurements measurement on measurement.row_id = size_row.id
    join sizing.measurement_definitions definition on definition.id = measurement.measurement_definition_id
    where size_row.revision_id = ${row.revision_id}
    order by size_row.position, size_row.id, definition.name
  `.execute(db);
  const rows = new Map<
    string,
    {
      label: string;
      measurements: {
        name: string;
        exact?: string;
        min?: string;
        max?: string;
        unit: string;
        approximate: boolean;
      }[];
    }
  >();
  for (const measurement of records.rows) {
    const current = rows.get(measurement.row_id) ?? { label: measurement.label, measurements: [] };
    current.measurements.push({
      name: measurement.name,
      ...(measurement.value_exact ? { exact: measurement.value_exact } : {}),
      ...(measurement.value_min ? { min: measurement.value_min } : {}),
      ...(measurement.value_max ? { max: measurement.value_max } : {}),
      unit: measurement.unit_code,
      approximate: measurement.is_approximate,
    });
    rows.set(measurement.row_id, current);
  }
  return { name: row.name, instructions: row.instructions, rows: [...rows.values()] };
}
