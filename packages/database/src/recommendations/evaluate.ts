import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type {
  ProductRecommendationsDto,
  RecommendationCardDto,
  RecommendationPlacementCodeDto,
  RecommendationPreviewDto,
  ProductRecommendationSettingsDto,
} from '@maevelle/contracts';
import { catalogProductHasCoherentActiveVariants } from '../catalog-variant-integrity.js';
import type { DatabaseSchema } from '../index.js';

export class RecommendationError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED',
    message: string,
  ) {
    super(message);
  }
}

export const placementCodes = ['pdp_complementary', 'pdp_similar'] as const;
export type PlacementCode = RecommendationPlacementCodeDto;

export interface PlacementConfig {
  code: PlacementCode;
  enabled: boolean;
  targetCount: number;
  candidateLimit: number;
  minimumScore: number;
  strategy: string;
  strategyVersion: number;
  version: number;
}

export const defaultPlacements: Record<PlacementCode, PlacementConfig> = {
  pdp_complementary: {
    code: 'pdp_complementary',
    enabled: true,
    targetCount: 3,
    candidateLimit: 96,
    minimumScore: 35,
    strategy: 'contextual_v1',
    strategyVersion: 1,
    version: 0,
  },
  pdp_similar: {
    code: 'pdp_similar',
    enabled: true,
    targetCount: 4,
    candidateLimit: 96,
    minimumScore: 30,
    strategy: 'contextual_v1',
    strategyVersion: 1,
    version: 0,
  },
};

interface Descriptor {
  id: string;
  product_type_id: string;
  category_ids: string[];
  tag_ids: string[];
  occasion_ids: string[];
  collection_ids: string[];
  attribute_keys: string[];
  color_codes: string[];
}

const descriptorColumns = sql`
  coalesce((select array_agg(x.category_id::text) from catalog.product_categories x where x.organization_id=p.organization_id and x.product_id=p.id),'{}'::text[]) category_ids,
  coalesce((select array_agg(x.tag_id::text) from catalog.product_tags x where x.organization_id=p.organization_id and x.product_id=p.id),'{}'::text[]) tag_ids,
  coalesce((select array_agg(x.occasion_id::text) from catalog.product_occasions x where x.organization_id=p.organization_id and x.product_id=p.id),'{}'::text[]) occasion_ids,
  coalesce((select array_agg(x.collection_id::text) from catalog.product_collections x where x.organization_id=p.organization_id and x.product_id=p.id),'{}'::text[]) collection_ids,
  coalesce((select array_agg(distinct definition.code || ':' || lower(coalesce(option.code,value.value_text,'')))
    from catalog.product_attribute_values value
    join catalog.attribute_definitions definition on definition.id=value.attribute_definition_id and definition.organization_id=value.organization_id and definition.status='ACTIVE'
    left join catalog.attribute_reference_options option on option.id=value.value_reference_id and option.organization_id=value.organization_id and option.status='ACTIVE'
    where value.organization_id=p.organization_id and value.product_id=p.id and (value.value_text is not null or option.id is not null)),'{}'::text[]) attribute_keys,
  coalesce((select array_agg(distinct color.code)
    from catalog.product_variants variant
    join catalog.variant_colors vc on vc.organization_id=variant.organization_id and vc.variant_id=variant.id
    join catalog.colors color on color.organization_id=vc.organization_id and color.id=vc.color_id and color.status='ACTIVE'
    where variant.organization_id=p.organization_id and variant.product_id=p.id and variant.status='ACTIVE'),'{}'::text[]) color_codes
`;

async function sourceDescriptor(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
  preview = false,
): Promise<Descriptor | undefined> {
  const result = await sql<Descriptor>`
    select p.id::text,p.product_type_id::text,${descriptorColumns}
    from catalog.products p where p.organization_id=${organizationId} and p.id=${productId}::uuid
      and ((${preview} and p.status<>'ARCHIVED') or
        (p.status='ACTIVE' and p.publication_status='PUBLISHED'
          and ${catalogProductHasCoherentActiveVariants(sql.ref('p.organization_id'), sql.ref('p.id'))}))
  `.execute(db);
  return result.rows[0];
}

export async function loadPlacements(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<PlacementConfig[]> {
  const result = await sql<{
    code: PlacementCode;
    enabled: boolean;
    target_count: number;
    candidate_limit: number;
    minimum_score: number;
    strategy_key: string;
    strategy_version: number;
    version: string;
  }>`
    select code,enabled,target_count,candidate_limit,minimum_score,strategy_key,strategy_version,version::text
    from recommendations.placements where organization_id=${organizationId}
  `.execute(db);
  return placementCodes.map((code) => {
    const row = result.rows.find((item) => item.code === code);
    return row
      ? {
          code,
          enabled: row.enabled,
          targetCount: row.target_count,
          candidateLimit: row.candidate_limit,
          minimumScore: row.minimum_score,
          strategy: row.strategy_key,
          strategyVersion: row.strategy_version,
          version: Number(row.version),
        }
      : defaultPlacements[code];
  });
}

interface Candidate extends Descriptor {
  handle: string;
  title: string;
  amount: string;
  currency_code: string;
  variant_id: string;
  sku: string;
  media_asset_id: string;
  image_alt: string | null;
  action: 'PIN' | 'BOOST' | 'EXCLUDE' | null;
  pin_position: number | null;
  boost: number | null;
  compatibility_strength: number | null;
}

function overlap(a: readonly string[], b: readonly string[]): number {
  const values = new Set(a);
  return b.filter((value) => values.has(value)).length;
}

function rank(
  source: Descriptor,
  candidate: Candidate,
  code: PlacementCode,
  sourcePrice: number | null,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const categories = overlap(source.category_ids, candidate.category_ids);
  const collections = overlap(source.collection_ids, candidate.collection_ids);
  const tags = overlap(source.tag_ids, candidate.tag_ids);
  const occasions = overlap(source.occasion_ids, candidate.occasion_ids);
  const attributes = overlap(source.attribute_keys, candidate.attribute_keys);
  const colors = overlap(source.color_codes, candidate.color_codes);
  if (code === 'pdp_similar') {
    if (source.product_type_id === candidate.product_type_id) {
      score += 28;
      reasons.push('Same product type');
    }
    if (categories) {
      score += Math.min(24, categories * 12);
      reasons.push('Shared category');
    }
    if (attributes) {
      score += Math.min(24, attributes * 12);
      reasons.push('Matching details');
    }
    if (collections) {
      score += 12;
      reasons.push('Shared collection');
    }
    if (tags) {
      score += Math.min(12, tags * 6);
      reasons.push('Shared style');
    }
    if (colors) {
      score += 8;
      reasons.push('Matching color');
    }
    if (occasions) score += Math.min(8, occasions * 4);
    if (sourcePrice !== null && sourcePrice > 0) {
      const ratio = Number(candidate.amount) / sourcePrice;
      if (ratio >= 0.5 && ratio <= 2) {
        score += 8;
        reasons.push('Comparable price');
      } else if (ratio < 0.25 || ratio > 4) score -= 15;
    }
  } else {
    if (candidate.compatibility_strength) {
      score += candidate.compatibility_strength;
      reasons.push('Compatible product type');
    }
    if (collections) {
      score += 16;
      reasons.push('Shared collection');
    }
    if (tags) {
      score += Math.min(12, tags * 6);
      reasons.push('Shared style');
    }
    if (occasions) {
      score += Math.min(12, occasions * 6);
      reasons.push('Shared occasion');
    }
    if (colors) {
      score += 10;
      reasons.push('Coordinating color');
    }
    if (attributes) score += Math.min(10, attributes * 5);
  }
  if (candidate.action === 'PIN') reasons.unshift('Manually selected');
  if (candidate.action === 'BOOST') score += candidate.boost ?? 0;
  return { score, reasons };
}

async function candidates(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  source: Descriptor,
  code: PlacementCode,
  currency: string,
  limit: number,
  proposedActions?: ProductRecommendationSettingsDto['actions'],
): Promise<Candidate[]> {
  const actionJoin =
    proposedActions === undefined
      ? sql`left join recommendations.product_actions action on action.organization_id=p.organization_id
        and action.source_product_id=${source.id}::uuid and action.target_product_id=p.id and action.placement_code=${code}`
      : proposedActions.length
        ? sql`left join (values ${sql.join(proposedActions.map((item) => sql`(${item.targetProductId}::uuid,${item.action},${item.pinPosition},${item.boost})`))})
          action(target_product_id,action,pin_position,boost) on action.target_product_id=p.id`
        : sql`left join (select null::uuid target_product_id,null::text action,null::integer pin_position,null::integer boost where false)
          action on action.target_product_id=p.id`;
  const result = await sql<Candidate>`
    with pool as (
      select p.id,p.organization_id,p.product_type_id,p.handle,p.title,p.published_at,
        action.action,action.pin_position,action.boost,rule.strength compatibility_strength,
        ${descriptorColumns}
      from catalog.products p
      ${actionJoin}
      left join recommendations.compatibility_rules rule on rule.organization_id=p.organization_id
        and rule.source_product_type_id=${source.product_type_id}::uuid and rule.target_product_type_id=p.product_type_id and rule.enabled
      where p.organization_id=${organizationId} and p.id<>${source.id}::uuid
        and p.status='ACTIVE' and p.publication_status='PUBLISHED'
        and ${catalogProductHasCoherentActiveVariants(sql.ref('p.organization_id'), sql.ref('p.id'))}
        and (
          action.target_product_id is not null
          or (${code}='pdp_complementary' and rule.id is not null)
          or (${code}='pdp_similar' and (
            p.product_type_id=${source.product_type_id}::uuid
            or exists(select 1 from catalog.product_categories x where x.organization_id=p.organization_id and x.product_id=p.id and x.category_id::text=any(${source.category_ids}::text[]))
            or exists(select 1 from catalog.product_collections x where x.organization_id=p.organization_id and x.product_id=p.id and x.collection_id::text=any(${source.collection_ids}::text[]))
            or exists(select 1 from catalog.product_tags x where x.organization_id=p.organization_id and x.product_id=p.id and x.tag_id::text=any(${source.tag_ids}::text[]))
            or exists(select 1 from catalog.product_attribute_values value join catalog.attribute_definitions definition
              on definition.id=value.attribute_definition_id and definition.organization_id=value.organization_id
              left join catalog.attribute_reference_options option on option.id=value.value_reference_id and option.organization_id=value.organization_id
              where value.organization_id=p.organization_id and value.product_id=p.id
              and definition.code || ':' || lower(coalesce(option.code,value.value_text,''))=any(${source.attribute_keys}::text[]))
          ))
        )
    ), bounded as (
      select pool.* from pool where action is not null or
        (${code}='pdp_similar' and (product_type_id=${source.product_type_id}::uuid
          or category_ids && ${source.category_ids}::text[] or collection_ids && ${source.collection_ids}::text[]
          or tag_ids && ${source.tag_ids}::text[] or attribute_keys && ${source.attribute_keys}::text[]))
        or (${code}='pdp_complementary' and compatibility_strength is not null)
      order by case when action='PIN' then 0 else 1 end,pin_position nulls last,
        case when compatibility_strength is not null then 0 else 1 end,
        published_at desc,id
      limit ${limit}
    )
    select bounded.id::text,bounded.product_type_id::text,bounded.handle,bounded.title,
      bounded.category_ids,bounded.tag_ids,bounded.occasion_ids,bounded.collection_ids,bounded.attribute_keys,bounded.color_codes,
      bounded.action,bounded.pin_position,bounded.boost,bounded.compatibility_strength,
      sale.amount::text,sale.currency_code,sale.variant_id::text,sale.sku,
      media.asset_id::text media_asset_id,media.image_alt
    from bounded
    join lateral (
      select variant.id variant_id,variant.sku,price.amount,price.currency_code
      from catalog.product_variants variant
      join lateral (
        select definition.amount,definition.currency_code from pricing.price_definitions definition
        where definition.organization_id=variant.organization_id and definition.variant_id=variant.id
          and definition.currency_code=${currency} and definition.status='ACTIVE'
          and definition.effective_from<=now() and (definition.effective_to is null or definition.effective_to>now())
        order by definition.effective_from desc,definition.id desc limit 1
      ) price on true
      where variant.organization_id=bounded.organization_id and variant.product_id=bounded.id and variant.status='ACTIVE'
        and exists (
          select 1 from inventory.inventory_items item join inventory.inventory_levels level
            on level.organization_id=item.organization_id and level.inventory_item_id=item.id
          where item.organization_id=variant.organization_id and item.variant_id=variant.id and item.status='ACTIVE'
          group by item.variant_id having sum(level.sellable_quantity-level.reserved_quantity)>0
        )
      order by price.amount,variant.id limit 1
    ) sale on true
    join lateral (
      select link.asset_id,coalesce(link.alt_text_override,asset.alt_text) image_alt
      from catalog.product_media link join media.media_assets asset
        on asset.organization_id=link.organization_id and asset.id=link.asset_id
      where link.organization_id=bounded.organization_id and link.product_id=bounded.id
        and asset.visibility_class='PUBLIC' and asset.status in ('READY','ARCHIVED')
        and exists(select 1 from media.media_renditions rendition
          where rendition.organization_id=asset.organization_id and rendition.asset_id=asset.id
            and rendition.source_object_id=asset.current_object_id and rendition.rendition_key='card'
            and rendition.storage_provider<>'url' and rendition.mime_type in ('image/webp','image/avif'))
        and link.role in ('GALLERY','THUMBNAIL','COLOR_GALLERY')
        and (link.variant_id is null or link.variant_id=sale.variant_id)
      order by case when link.variant_id=sale.variant_id then 0 when link.option_value_id is null then 1 else 2 end,
        link.is_primary desc,link.position,link.id limit 1
    ) media on true
  `.execute(db);
  return result.rows;
}

export async function evaluateProductRecommendations(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    currency: string;
    placements?: readonly PlacementCode[];
    preview?: boolean;
    proposed?: ProductRecommendationSettingsDto;
    placementOverride?: PlacementConfig;
  },
): Promise<ProductRecommendationsDto | RecommendationPreviewDto> {
  const source = await sourceDescriptor(db, input.organizationId, input.productId, input.preview);
  if (!source) throw new RecommendationError('NOT_FOUND', 'Product is not available.');
  const sourcePriceResult = await sql<{ amount: string }>`select definition.amount::text amount
    from catalog.product_variants variant join pricing.price_definitions definition
      on definition.organization_id=variant.organization_id and definition.variant_id=variant.id
    where variant.organization_id=${input.organizationId} and variant.product_id=${source.id}::uuid
      and variant.status='ACTIVE' and definition.status='ACTIVE' and definition.currency_code=${input.currency}
      and definition.effective_from<=now() and (definition.effective_to is null or definition.effective_to>now())
    order by definition.amount,variant.id limit 1`.execute(db);
  const sourcePrice = sourcePriceResult.rows[0] ? Number(sourcePriceResult.rows[0].amount) : null;
  const settings = await sql<{
    placement_code: PlacementCode;
    mode: 'AUTOMATIC' | 'HYBRID' | 'MANUAL';
    enabled: boolean | null;
    target_count: number | null;
    minimum_score: number | null;
  }>`
    select placement_code,mode,enabled,target_count,minimum_score from recommendations.product_settings
    where organization_id=${input.organizationId} and source_product_id=${input.productId}::uuid
  `.execute(db);
  const configs = (await loadPlacements(db, input.organizationId))
    .map((config) =>
      input.placementOverride?.code === config.code ? input.placementOverride : config,
    )
    .filter((config) => !input.placements || input.placements.includes(config.code));
  const similarConfig = configs.find((config) => config.code === 'pdp_similar');
  const similarOverride =
    input.proposed?.placement === 'pdp_similar'
      ? { mode: input.proposed.mode, enabled: input.proposed.enabled }
      : settings.rows.find((row) => row.placement_code === 'pdp_similar');
  const reserveSimilarPins = Boolean(
    similarConfig &&
    (similarOverride?.enabled ?? similarConfig.enabled) &&
    similarOverride?.mode !== 'AUTOMATIC',
  );
  const similarPins = !reserveSimilarPins
    ? { rows: [] as { target_product_id: string }[] }
    : input.proposed?.placement === 'pdp_similar'
      ? {
          rows: input.proposed.actions
            .filter((item) => item.action === 'PIN')
            .map((item) => ({ target_product_id: item.targetProductId })),
        }
      : await sql<{
          target_product_id: string;
        }>`select target_product_id::text from recommendations.product_actions
      where organization_id=${input.organizationId} and source_product_id=${source.id}::uuid
        and placement_code='pdp_similar' and action='PIN'`.execute(db);
  const reservedForSimilar = new Set(similarPins.rows.map((row) => row.target_product_id));
  const used = new Set<string>();
  const explanations: RecommendationPreviewDto['explanations'][number][] = [];
  const sections: ProductRecommendationsDto['sections'][number][] = [];
  for (const config of configs) {
    const proposed = input.proposed?.placement === config.code ? input.proposed : undefined;
    const override = settings.rows.find((row) => row.placement_code === config.code);
    const enabled = proposed
      ? (proposed.enabled ?? config.enabled)
      : (override?.enabled ?? config.enabled);
    const target = proposed
      ? (proposed.targetCount ?? config.targetCount)
      : (override?.target_count ?? config.targetCount);
    const minimum = proposed
      ? (proposed.minimumScore ?? config.minimumScore)
      : (override?.minimum_score ?? config.minimumScore);
    const mode = proposed?.mode ?? override?.mode ?? 'HYBRID';
    const pool = enabled
      ? await candidates(
          db,
          input.organizationId,
          source,
          config.code,
          input.currency,
          config.candidateLimit,
          proposed?.actions,
        )
      : [];
    if (input.preview && enabled && mode !== 'AUTOMATIC') {
      const pinned = proposed
        ? {
            rows: proposed.actions
              .filter((item) => item.action === 'PIN')
              .map((item) => ({ target_product_id: item.targetProductId })),
          }
        : await sql<{
            target_product_id: string;
          }>`select target_product_id::text from recommendations.product_actions
        where organization_id=${input.organizationId} and source_product_id=${source.id}::uuid
          and placement_code=${config.code} and action='PIN'`.execute(db);
      const available = new Set(pool.map((item) => item.id));
      for (const pin of pinned.rows)
        if (!available.has(pin.target_product_id))
          explanations.push({
            placement: config.code,
            productId: pin.target_product_id,
            score: 0,
            reasons: ['Pinned Product is unavailable or missing a live price, stock, or image'],
            outcome: 'INELIGIBLE',
          });
    }
    const ranked = pool
      .map((item) => ({ item, ...rank(source, item, config.code, sourcePrice) }))
      .filter((value) => mode !== 'MANUAL' || value.item.action === 'PIN')
      .filter((value) => mode !== 'AUTOMATIC' || value.item.action !== 'PIN')
      .sort(
        (a, b) =>
          Number(b.item.action === 'PIN') - Number(a.item.action === 'PIN') ||
          (a.item.pin_position ?? 999) - (b.item.pin_position ?? 999) ||
          b.score - a.score ||
          a.item.id.localeCompare(b.item.id),
      );
    const items: RecommendationCardDto[] = [];
    for (const value of ranked) {
      const outcome =
        value.item.action === 'EXCLUDE'
          ? 'EXCLUDED'
          : used.has(value.item.id) ||
              (config.code === 'pdp_complementary' &&
                value.item.action !== 'PIN' &&
                reservedForSimilar.has(value.item.id))
            ? 'DUPLICATE'
            : value.item.action !== 'PIN' && value.score < minimum
              ? 'LOW_RELEVANCE'
              : items.length >= target
                ? 'LOW_RELEVANCE'
                : 'SELECTED';
      if (input.preview)
        explanations.push({
          placement: config.code,
          productId: value.item.id,
          score: value.score,
          reasons: value.reasons,
          outcome,
        });
      if (outcome !== 'SELECTED') continue;
      used.add(value.item.id);
      items.push({
        productId: value.item.id,
        handle: value.item.handle,
        title: value.item.title,
        price: { amount: value.item.amount, currency: value.item.currency_code },
        mediaAssetId: value.item.media_asset_id,
        imageAlt: value.item.image_alt ?? value.item.title,
        presentationVariantId: value.item.variant_id,
        sku: value.item.sku,
        position: items.length + 1,
        ...(value.reasons[0] && value.item.action === 'PIN'
          ? { reason: 'Selected to pair with this item' }
          : {}),
      });
    }
    sections.push({
      placement: config.code,
      strategy: config.strategy,
      strategyVersion: config.strategyVersion,
      items,
    });
  }
  const base: ProductRecommendationsDto = {
    productId: source.id,
    recommendationRequestId: randomUUID(),
    sections,
  };
  return input.preview ? { ...base, explanations } : base;
}
