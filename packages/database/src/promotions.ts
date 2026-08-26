import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';

const moneyScale = 10_000n;

export class PromotionDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'STALE_VERSION',
    message: string,
  ) {
    super(message);
    this.name = 'PromotionDomainError';
  }
}

export type PromotionBenefit = 'PERCENTAGE_DISCOUNT' | 'FIXED_AMOUNT_DISCOUNT';
export type PromotionCombinability = 'STACKABLE' | 'EXCLUSIVE';

export interface PromotionCalculationLine {
  readonly lineId: string;
  readonly variantId: string;
  readonly productId: string;
  readonly categoryIds: readonly string[];
  readonly gross: string;
}

export interface PromotionCalculation {
  readonly promotionId: string;
  readonly revisionId: string;
  readonly couponCodeId: string | null;
  readonly discount: string;
  readonly allocations: readonly { lineId: string; amount: string }[];
}

function toScaled(value: string): bigint {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) {
    throw new PromotionDomainError(
      'VALIDATION_FAILED',
      'Money must have at most four decimal places.',
    );
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole ?? '0') * moneyScale + BigInt(((fraction ?? '') + '0000').slice(0, 4));
}

function fromScaled(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % moneyScale).toString().padStart(4, '0');
  return `${sign}${(absolute / moneyScale).toString()}.${fraction}`;
}

/** Deterministic largest-remainder allocation with stable line-id tiebreaking. */
export function allocateDiscount(
  totalDiscount: string,
  lines: readonly { lineId: string; gross: string }[],
): readonly { lineId: string; amount: string }[] {
  const requested = toScaled(totalDiscount);
  const totalGross = lines.reduce((sum, line) => sum + toScaled(line.gross), 0n);
  const discount = requested > totalGross ? totalGross : requested;
  if (discount <= 0n || totalGross <= 0n)
    return lines.map((line) => ({ lineId: line.lineId, amount: '0.0000' }));
  const portions = lines.map((line) => {
    const gross = toScaled(line.gross);
    const numerator = discount * gross;
    return {
      lineId: line.lineId,
      floor: numerator / totalGross,
      remainder: numerator % totalGross,
    };
  });
  let remaining = discount - portions.reduce((sum, portion) => sum + portion.floor, 0n);
  for (const portion of [...portions].sort((left, right) => {
    if (left.remainder === right.remainder) return left.lineId.localeCompare(right.lineId);
    return left.remainder > right.remainder ? -1 : 1;
  })) {
    if (remaining === 0n) break;
    portion.floor += 1n;
    remaining -= 1n;
  }
  return portions
    .sort((left, right) => left.lineId.localeCompare(right.lineId))
    .map((portion) => ({ lineId: portion.lineId, amount: fromScaled(portion.floor) }));
}

function normalizeCoupon(value: string): string {
  const normalized = value.trim().replace(/\s+/g, '').toLocaleUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(normalized)) {
    throw new PromotionDomainError('VALIDATION_FAILED', 'Coupon code is not valid.');
  }
  return normalized;
}

async function emitPromotionEvent(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; promotionId: string; action: string },
): Promise<void> {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.action,
    targetType: 'promotions.promotion',
    targetId: input.promotionId,
  });
  await sql`
    insert into platform.outbox_events (
      organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
    ) values (
      ${input.organizationId}, ${input.action}, 1, 'promotions.promotion', ${input.promotionId}, 1,
      ${JSON.stringify({ promotionId: input.promotionId })}::jsonb, now()
    )
  `.execute(db);
}

async function assertPromotionTargetOwnership(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  target: {
    productIds?: readonly string[];
    variantIds?: readonly string[];
    categoryIds?: readonly string[];
  },
): Promise<void> {
  const checks: readonly [readonly string[] | undefined, ReturnType<typeof sql>][] = [
    [
      target.productIds,
      sql`select id from catalog.products where organization_id = ${organizationId} and id = any(${target.productIds ?? []}::uuid[])`,
    ],
    [
      target.variantIds,
      sql`select id from catalog.product_variants where organization_id = ${organizationId} and id = any(${target.variantIds ?? []}::uuid[])`,
    ],
    [
      target.categoryIds,
      sql`select id from catalog.categories where organization_id = ${organizationId} and id = any(${target.categoryIds ?? []}::uuid[])`,
    ],
  ];
  for (const [ids, query] of checks) {
    if (!ids?.length) continue;
    const found = await query.execute(db);
    if (found.rows.length !== new Set(ids).size) {
      throw new PromotionDomainError(
        'VALIDATION_FAILED',
        'Each promotion target must belong to the current Organization.',
      );
    }
  }
}

export async function createPromotion(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    name: string;
    promotionType: 'AUTOMATIC' | 'COUPON';
    benefitType: PromotionBenefit;
    benefitValue: string;
    combinability: PromotionCombinability;
    startsAt?: Date;
    endsAt?: Date | null;
    priority?: number;
    minimumMerchandiseSubtotal?: string;
    productIds?: readonly string[];
    variantIds?: readonly string[];
    categoryIds?: readonly string[];
  },
): Promise<{ id: string; revisionId: string; version: number }> {
  if (!input.name.trim())
    throw new PromotionDomainError('VALIDATION_FAILED', 'Promotion name is required.');
  const value = toScaled(input.benefitValue);
  if (value <= 0n)
    throw new PromotionDomainError('VALIDATION_FAILED', 'Promotion benefit must be positive.');
  if (input.benefitType === 'PERCENTAGE_DISCOUNT' && value > 100n * moneyScale) {
    throw new PromotionDomainError('VALIDATION_FAILED', 'Percentage discount cannot exceed 100%.');
  }
  if (input.minimumMerchandiseSubtotal) toScaled(input.minimumMerchandiseSubtotal);
  return db.transaction().execute(async (transaction) => {
    await assertPromotionTargetOwnership(transaction, input.organizationId, input);
    const promotionResult = await sql<{ id: string; version: string }>`
      insert into promotions.promotions (
        organization_id, name, promotion_type, status, starts_at, ends_at, priority, combinability
      ) values (
        ${input.organizationId}, ${input.name.trim()}, ${input.promotionType}, 'ACTIVE',
        ${input.startsAt ?? null}, ${input.endsAt ?? null}, ${input.priority ?? 0}, ${input.combinability}
      ) returning id, version::text
    `.execute(transaction);
    const promotion = promotionResult.rows[0];
    if (!promotion) throw new Error('Promotion creation did not return a promotion.');
    const revisionResult = await sql<{ id: string }>`
      insert into promotions.promotion_revisions (
        organization_id, promotion_id, revision_number, status, benefit_type, benefit_value, minimum_merchandise_subtotal, activated_at
      ) values (
        ${input.organizationId}, ${promotion.id}, 1, 'ACTIVE', ${input.benefitType}, ${input.benefitValue}::numeric,
        ${input.minimumMerchandiseSubtotal ?? null}::numeric, now()
      ) returning id
    `.execute(transaction);
    const revisionId = revisionResult.rows[0]?.id;
    if (!revisionId) throw new Error('Promotion revision creation did not return an id.');
    for (const productId of input.productIds ?? []) {
      await sql`insert into promotions.promotion_target_products (organization_id, promotion_revision_id, product_id) values (${input.organizationId}, ${revisionId}, ${productId})`.execute(
        transaction,
      );
    }
    for (const variantId of input.variantIds ?? []) {
      await sql`insert into promotions.promotion_target_variants (organization_id, promotion_revision_id, variant_id) values (${input.organizationId}, ${revisionId}, ${variantId})`.execute(
        transaction,
      );
    }
    for (const categoryId of input.categoryIds ?? []) {
      await sql`insert into promotions.promotion_target_categories (organization_id, promotion_revision_id, category_id) values (${input.organizationId}, ${revisionId}, ${categoryId})`.execute(
        transaction,
      );
    }
    await emitPromotionEvent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      promotionId: promotion.id,
      action: 'promotions.promotion.created',
    });
    return { id: promotion.id, revisionId, version: Number(promotion.version) };
  });
}

export async function createCouponCode(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; promotionId: string; code: string },
): Promise<{ id: string; normalizedCode: string }> {
  const normalizedCode = normalizeCoupon(input.code);
  return db.transaction().execute(async (transaction) => {
    const promotion = await sql<{ id: string }>`
      select id from promotions.promotions where id = ${input.promotionId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    if (!promotion.rows[0]) throw new PromotionDomainError('NOT_FOUND', 'Promotion was not found.');
    try {
      const created = await sql<{ id: string }>`
        insert into promotions.coupon_codes (organization_id, promotion_id, code, normalized_code)
        values (${input.organizationId}, ${input.promotionId}, ${input.code.trim()}, ${normalizedCode}) returning id
      `.execute(transaction);
      const id = created.rows[0]?.id;
      if (!id) throw new Error('Coupon creation did not return an id.');
      await emitPromotionEvent(transaction, { ...input, action: 'promotions.coupon.created' });
      return { id, normalizedCode };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new PromotionDomainError('CONFLICT', 'That coupon code is already reserved.');
      }
      throw error;
    }
  });
}

export interface AdminPromotionSummary {
  readonly id: string;
  readonly name: string;
  readonly promotionType: 'AUTOMATIC' | 'COUPON';
  readonly status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly priority: number;
  readonly combinability: PromotionCombinability;
  readonly benefitType: PromotionBenefit;
  readonly benefitValue: string;
  readonly minimumMerchandiseSubtotal: string | null;
  readonly coupons: readonly { id: string; code: string; status: string }[];
  readonly committedUsageCount: number;
  readonly committedDiscount: string;
  readonly createdAt: string;
}

export async function listAdminPromotions(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly AdminPromotionSummary[]> {
  const [promotions, coupons] = await Promise.all([
    sql<{
      id: string;
      name: string;
      promotion_type: AdminPromotionSummary['promotionType'];
      status: AdminPromotionSummary['status'];
      starts_at: string | null;
      ends_at: string | null;
      priority: number;
      combinability: PromotionCombinability;
      benefit_type: PromotionBenefit;
      benefit_value: string;
      minimum_merchandise_subtotal: string | null;
      committed_usage_count: string;
      committed_discount: string;
      created_at: string;
    }>`
      select promotion.id::text,promotion.name,promotion.promotion_type,promotion.status,
        promotion.starts_at::text,promotion.ends_at::text,promotion.priority,promotion.combinability,
        revision.benefit_type,revision.benefit_value::text,
        revision.minimum_merchandise_subtotal::text,
        count(usage.id) filter (where usage.status='COMMITTED')::text as committed_usage_count,
        coalesce(sum(usage.discount_amount) filter (where usage.status='COMMITTED'),0)::text as committed_discount,
        promotion.created_at::text
      from promotions.promotions promotion
      join promotions.promotion_revisions revision
        on revision.promotion_id=promotion.id and revision.status='ACTIVE'
      left join promotions.promotion_usage usage
        on usage.promotion_id=promotion.id and usage.organization_id=promotion.organization_id
      where promotion.organization_id=${organizationId}
      group by promotion.id,revision.id
      order by promotion.created_at desc,promotion.id desc
    `.execute(db),
    sql<{ id: string; promotion_id: string; code: string; status: string }>`
      select id::text,promotion_id::text,code,status from promotions.coupon_codes
      where organization_id=${organizationId} order by created_at,id
    `.execute(db),
  ]);
  return promotions.rows.map((promotion) => ({
    id: promotion.id,
    name: promotion.name,
    promotionType: promotion.promotion_type,
    status: promotion.status,
    startsAt: promotion.starts_at,
    endsAt: promotion.ends_at,
    priority: promotion.priority,
    combinability: promotion.combinability,
    benefitType: promotion.benefit_type,
    benefitValue: promotion.benefit_value,
    minimumMerchandiseSubtotal: promotion.minimum_merchandise_subtotal,
    coupons: coupons.rows
      .filter((coupon) => coupon.promotion_id === promotion.id)
      .map((coupon) => ({ id: coupon.id, code: coupon.code, status: coupon.status })),
    committedUsageCount: Number(promotion.committed_usage_count),
    committedDiscount: promotion.committed_discount,
    createdAt: promotion.created_at,
  }));
}

/** Evaluates promotions provisionally. It never creates or increments promotion_usage. */
export async function evaluatePromotions(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    lines: readonly PromotionCalculationLine[];
    couponCodes?: readonly string[];
    at?: Date;
  },
): Promise<readonly PromotionCalculation[]> {
  const at = input.at ?? new Date();
  const requestedCodes = [...new Set((input.couponCodes ?? []).map(normalizeCoupon))];
  const promotions = await sql<{
    promotion_id: string;
    promotion_type: 'AUTOMATIC' | 'COUPON';
    combinability: PromotionCombinability;
    priority: number;
    revision_id: string;
    benefit_type: PromotionBenefit;
    benefit_value: string;
    minimum_merchandise_subtotal: string | null;
    coupon_code_id: string | null;
  }>`
    select promotion.id as promotion_id, promotion.promotion_type, promotion.combinability, promotion.priority,
      revision.id as revision_id, revision.benefit_type, revision.benefit_value::text, revision.minimum_merchandise_subtotal::text,
      coupon.id as coupon_code_id
    from promotions.promotions promotion
    join promotions.promotion_revisions revision on revision.promotion_id = promotion.id and revision.status = 'ACTIVE'
    left join lateral (
      select id from promotions.coupon_codes
      where promotion_id = promotion.id and status = 'ACTIVE'
        and normalized_code = any(${requestedCodes})
      order by id
      limit 1
    ) coupon on true
    where promotion.organization_id = ${input.organizationId}
      and promotion.status = 'ACTIVE'
      and (promotion.starts_at is null or promotion.starts_at <= ${at})
      and (promotion.ends_at is null or promotion.ends_at > ${at})
      and (promotion.promotion_type = 'AUTOMATIC' or coupon.id is not null)
    order by promotion.priority desc, promotion.id, revision.id, coupon.id
  `.execute(db);
  const applied: PromotionCalculation[] = [];
  let exclusiveApplied = false;
  for (const promotion of promotions.rows) {
    if (exclusiveApplied) continue;
    const targetRows = await sql<{
      product_id: string | null;
      variant_id: string | null;
      category_id: string | null;
    }>`
      select product_id, null::uuid as variant_id, null::uuid as category_id from promotions.promotion_target_products where promotion_revision_id = ${promotion.revision_id}
      union all select null::uuid, variant_id, null::uuid from promotions.promotion_target_variants where promotion_revision_id = ${promotion.revision_id}
      union all select null::uuid, null::uuid, category_id from promotions.promotion_target_categories where promotion_revision_id = ${promotion.revision_id}
    `.execute(db);
    const eligible = input.lines.filter((line) => {
      if (targetRows.rows.length === 0) return true;
      return targetRows.rows.some(
        (target) =>
          target.product_id === line.productId ||
          target.variant_id === line.variantId ||
          (target.category_id !== null && line.categoryIds.includes(target.category_id)),
      );
    });
    const eligibleGross = eligible.reduce((sum, line) => sum + toScaled(line.gross), 0n);
    if (eligibleGross === 0n) continue;
    if (
      promotion.minimum_merchandise_subtotal &&
      eligibleGross < toScaled(promotion.minimum_merchandise_subtotal)
    ) {
      continue;
    }
    const benefit = toScaled(promotion.benefit_value);
    const rawDiscount =
      promotion.benefit_type === 'PERCENTAGE_DISCOUNT'
        ? (eligibleGross * benefit) / (100n * moneyScale)
        : benefit;
    const allocations = allocateDiscount(fromScaled(rawDiscount), eligible);
    const discount = allocations.reduce((sum, allocation) => sum + toScaled(allocation.amount), 0n);
    if (discount === 0n) continue;
    applied.push({
      promotionId: promotion.promotion_id,
      revisionId: promotion.revision_id,
      couponCodeId: promotion.coupon_code_id,
      discount: fromScaled(discount),
      allocations,
    });
    if (promotion.combinability === 'EXCLUSIVE') exclusiveApplied = true;
  }
  return applied;
}
