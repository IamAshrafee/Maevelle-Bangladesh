import { sql, type Kysely } from 'kysely';
import type {
  ProductRecommendationActionDto,
  ProductRecommendationSettingsDto,
  RecommendationPlacementCodeDto,
} from '@maevelle/contracts';
import { appendAuditEvent } from '../platform.js';
import type { DatabaseSchema } from '../index.js';
import { loadPlacements, RecommendationError, type PlacementConfig } from './evaluate.js';

export async function listRecommendationPlacements(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<PlacementConfig[]> {
  return loadPlacements(db, organizationId);
}

export async function updateRecommendationPlacement(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    code: RecommendationPlacementCodeDto;
    expectedVersion: number;
    enabled: boolean;
    targetCount: number;
    candidateLimit: number;
    minimumScore: number;
  },
): Promise<PlacementConfig> {
  return db.transaction().execute(async (tx) => {
    const existing = (await loadPlacements(tx, input.organizationId)).find(
      (row) => row.code === input.code,
    );
    if (!existing) throw new RecommendationError('NOT_FOUND', 'Placement not found.');
    if (existing.version !== input.expectedVersion)
      throw new RecommendationError('CONFLICT', 'Placement changed. Reload and try again.');
    const result = await sql<{ version: string }>`
      insert into recommendations.placements(organization_id,code,enabled,target_count,candidate_limit,minimum_score,updated_by)
      values(${input.organizationId},${input.code},${input.enabled},${input.targetCount},${input.candidateLimit},${input.minimumScore},${input.actorId}::uuid)
      on conflict(organization_id,code) do update set enabled=excluded.enabled,target_count=excluded.target_count,
        candidate_limit=excluded.candidate_limit,minimum_score=excluded.minimum_score,version=recommendations.placements.version+1,
        updated_by=excluded.updated_by,updated_at=now()
      where recommendations.placements.version=${input.expectedVersion}
      returning version::text
    `.execute(tx);
    if (!result.rows[0])
      throw new RecommendationError('CONFLICT', 'Placement changed. Reload and try again.');
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'recommendations.placement.updated',
      targetType: 'recommendations.placement',
      metadata: { code: input.code },
      beforeDiff: existing,
      afterDiff: input,
    });
    return (await loadPlacements(tx, input.organizationId)).find((row) => row.code === input.code)!;
  });
}

export async function getProductRecommendationSettings(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
): Promise<ProductRecommendationSettingsDto[]> {
  const product = await sql<{
    id: string;
  }>`select id::text from catalog.products where organization_id=${organizationId} and id=${productId}::uuid`.execute(
    db,
  );
  if (!product.rows[0]) throw new RecommendationError('NOT_FOUND', 'Product not found.');
  const rows = await sql<{
    placement_code: RecommendationPlacementCodeDto;
    mode: 'AUTOMATIC' | 'HYBRID' | 'MANUAL';
    enabled: boolean | null;
    target_count: number | null;
    minimum_score: number | null;
    version: string;
  }>`
    select placement_code,mode,enabled,target_count,minimum_score,version::text from recommendations.product_settings
    where organization_id=${organizationId} and source_product_id=${productId}::uuid
  `.execute(db);
  const actions = await sql<{
    placement_code: RecommendationPlacementCodeDto;
    target_product_id: string;
    action: 'PIN' | 'BOOST' | 'EXCLUDE';
    pin_position: number | null;
    boost: number | null;
  }>`
    select placement_code,target_product_id::text,action,pin_position,boost from recommendations.product_actions
    where organization_id=${organizationId} and source_product_id=${productId}::uuid
    order by placement_code,pin_position nulls last,target_product_id
  `.execute(db);
  return (['pdp_complementary', 'pdp_similar'] as const).map((placement) => {
    const row = rows.rows.find((item) => item.placement_code === placement);
    return {
      placement,
      mode: row?.mode ?? 'HYBRID',
      enabled: row?.enabled ?? null,
      targetCount: row?.target_count ?? null,
      minimumScore: row?.minimum_score ?? null,
      version: Number(row?.version ?? 0),
      actions: actions.rows
        .filter((item) => item.placement_code === placement)
        .map((item) => ({
          targetProductId: item.target_product_id,
          action: item.action,
          pinPosition: item.pin_position,
          boost: item.boost,
        })),
    };
  });
}

export async function saveProductRecommendationSettings(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    actorId: string;
    placement: RecommendationPlacementCodeDto;
    expectedVersion: number;
    mode: 'AUTOMATIC' | 'HYBRID' | 'MANUAL';
    enabled: boolean | null;
    targetCount: number | null;
    minimumScore: number | null;
    actions: readonly ProductRecommendationActionDto[];
  },
): Promise<ProductRecommendationSettingsDto> {
  if (
    input.actions.length > 100 ||
    new Set(input.actions.map((x) => x.targetProductId)).size !== input.actions.length ||
    input.actions.some((x) => x.targetProductId === input.productId)
  )
    throw new RecommendationError(
      'VALIDATION_FAILED',
      'Actions must have distinct other Products.',
    );
  const pins = input.actions
    .filter((action) => action.action === 'PIN')
    .map((action) => action.pinPosition);
  if (new Set(pins).size !== pins.length)
    throw new RecommendationError('VALIDATION_FAILED', 'Pin positions must be unique.');
  return db.transaction().execute(async (tx) => {
    const before = (
      await getProductRecommendationSettings(tx, input.organizationId, input.productId)
    ).find((row) => row.placement === input.placement)!;
    if (before.version !== input.expectedVersion)
      throw new RecommendationError('CONFLICT', 'Recommendations changed. Reload and try again.');
    await sql`insert into recommendations.placements(organization_id,code,enabled,target_count,candidate_limit,minimum_score)
      values(${input.organizationId},'pdp_complementary',true,3,96,35),(${input.organizationId},'pdp_similar',true,4,96,30)
      on conflict(organization_id,code) do nothing`.execute(tx);
    if (input.actions.length) {
      const targets = await sql<{ id: string }>`
        select id::text from catalog.products where organization_id=${input.organizationId}
          and id in (${sql.join(input.actions.map((action) => sql`${action.targetProductId}::uuid`))})
      `.execute(tx);
      if (targets.rows.length !== input.actions.length)
        throw new RecommendationError(
          'VALIDATION_FAILED',
          'One or more targets are outside this organization.',
        );
    }
    const saved = await sql<{ version: string }>`
      insert into recommendations.product_settings(organization_id,source_product_id,placement_code,mode,enabled,target_count,minimum_score,updated_by)
      values(${input.organizationId},${input.productId}::uuid,${input.placement},${input.mode},${input.enabled},${input.targetCount},${input.minimumScore},${input.actorId}::uuid)
      on conflict(organization_id,source_product_id,placement_code) do update set
        mode=excluded.mode,enabled=excluded.enabled,target_count=excluded.target_count,minimum_score=excluded.minimum_score,
        updated_by=excluded.updated_by,updated_at=now(),version=recommendations.product_settings.version+1
      where recommendations.product_settings.version=${input.expectedVersion}
      returning version::text
    `.execute(tx);
    if (!saved.rows[0])
      throw new RecommendationError('CONFLICT', 'Recommendations changed. Reload and try again.');
    await sql`delete from recommendations.product_actions where organization_id=${input.organizationId}
      and source_product_id=${input.productId}::uuid and placement_code=${input.placement}`.execute(
      tx,
    );
    for (const action of input.actions) {
      await sql`insert into recommendations.product_actions(organization_id,source_product_id,placement_code,target_product_id,action,pin_position,boost,created_by)
        values(${input.organizationId},${input.productId}::uuid,${input.placement},${action.targetProductId}::uuid,
          ${action.action},${action.pinPosition},${action.boost},${input.actorId}::uuid)`.execute(
        tx,
      );
    }
    const after = (
      await getProductRecommendationSettings(tx, input.organizationId, input.productId)
    ).find((row) => row.placement === input.placement)!;
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'recommendations.product.updated',
      targetType: 'catalog.product',
      targetId: input.productId,
      beforeDiff: before,
      afterDiff: after,
    });
    return after;
  });
}

export async function listCompatibilityRules(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: { query: string; page: number; pageSize: number } = { query: '', page: 1, pageSize: 20 },
) {
  const term = `%${input.query.trim()}%`;
  const offset = (input.page - 1) * input.pageSize;
  const count = await sql<{
    total: string;
  }>`select count(*)::text total from recommendations.compatibility_rules rule
    join catalog.product_types "source" on "source".organization_id=rule.organization_id and "source".id=rule.source_product_type_id
    join catalog.product_types "target" on "target".organization_id=rule.organization_id and "target".id=rule.target_product_type_id
    where rule.organization_id=${organizationId} and (${input.query.trim()}='' or "source".name ilike ${term} or "target".name ilike ${term})`.execute(
    db,
  );
  const result = await sql<{
    id: string;
    sourceProductTypeId: string;
    targetProductTypeId: string;
    sourceName: string;
    targetName: string;
    strength: number;
    enabled: boolean;
    version: string;
  }>`
    select rule.id::text,"source".id::text "sourceProductTypeId","target".id::text "targetProductTypeId",
      "source".name "sourceName","target".name "targetName",rule.strength,rule.enabled,rule.version::text
    from recommendations.compatibility_rules rule
    join catalog.product_types "source" on "source".organization_id=rule.organization_id and "source".id=rule.source_product_type_id
    join catalog.product_types "target" on "target".organization_id=rule.organization_id and "target".id=rule.target_product_type_id
    where rule.organization_id=${organizationId} and (${input.query.trim()}='' or "source".name ilike ${term} or "target".name ilike ${term})
    order by "source".name,"target".name,rule.id limit ${input.pageSize} offset ${offset}
  `.execute(db);
  return {
    items: result.rows.map((row) => ({ ...row, version: Number(row.version) })),
    total: Number(count.rows[0]?.total ?? 0),
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function saveCompatibilityRule(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    sourceProductTypeId: string;
    targetProductTypeId: string;
    strength: number;
    enabled: boolean;
    expectedVersion: number;
  },
) {
  return db.transaction().execute(async (tx) => {
    const existing = await sql<{
      version: string;
    }>`select version::text from recommendations.compatibility_rules
      where organization_id=${input.organizationId} and source_product_type_id=${input.sourceProductTypeId}::uuid
        and target_product_type_id=${input.targetProductTypeId}::uuid for update`.execute(tx);
    if (Number(existing.rows[0]?.version ?? 0) !== input.expectedVersion)
      throw new RecommendationError('CONFLICT', 'Rule changed. Reload and try again.');
    const result = await sql<{ id: string; version: string }>`
      insert into recommendations.compatibility_rules(organization_id,source_product_type_id,target_product_type_id,strength,enabled,updated_by)
      values(${input.organizationId},${input.sourceProductTypeId}::uuid,${input.targetProductTypeId}::uuid,${input.strength},${input.enabled},${input.actorId}::uuid)
      on conflict(organization_id,source_product_type_id,target_product_type_id) do update set
        strength=excluded.strength,enabled=excluded.enabled,updated_by=excluded.updated_by,
        version=recommendations.compatibility_rules.version+1,updated_at=now()
      returning id::text,version::text
    `.execute(tx);
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'recommendations.compatibility.updated',
      targetType: 'recommendations.compatibility',
      targetId: result.rows[0]!.id,
      beforeDiff: existing.rows[0] ?? null,
      afterDiff: input,
    });
    return { id: result.rows[0]!.id, version: Number(result.rows[0]!.version) };
  });
}

export async function searchRecommendationProducts(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    query: string;
    sourceProductId?: string;
    page: number;
    pageSize: number;
  },
) {
  const offset = (input.page - 1) * input.pageSize;
  const term = `%${input.query.trim()}%`;
  const results = await sql<{
    id: string;
    handle: string;
    title: string;
    publication_status: string;
    total: string;
  }>`
    select id::text,handle,title,publication_status,count(*) over()::text total from catalog.products
    where organization_id=${input.organizationId} and status<>'ARCHIVED'
      and id<>coalesce(${input.sourceProductId ?? null}::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
      and (${input.query.trim()}='' or title ilike ${term} or handle ilike ${term})
    order by title,id limit ${input.pageSize} offset ${offset}
  `.execute(db);
  return {
    items: results.rows.map((row) => ({
      id: row.id,
      handle: row.handle,
      title: row.title,
      publication_status: row.publication_status,
    })),
    page: input.page,
    pageSize: input.pageSize,
    total: Number(results.rows[0]?.total ?? 0),
  };
}
