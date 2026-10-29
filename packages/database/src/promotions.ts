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
    status?: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
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
    const promotionStatus = input.status ?? 'ACTIVE';
    const promotionResult = await sql<{ id: string; version: string }>`
      insert into promotions.promotions (
        organization_id, name, promotion_type, status, starts_at, ends_at, priority, combinability
      ) values (
        ${input.organizationId}, ${input.name.trim()}, ${input.promotionType}, ${promotionStatus},
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
  input: {
    organizationId: string;
    actorId: string;
    promotionId: string;
    code: string;
    usageLimitTotal?: number | null;
    usageLimitPerCustomer?: number | null;
  },
): Promise<{ id: string; normalizedCode: string }> {
  const normalizedCode = normalizeCoupon(input.code);
  return db.transaction().execute(async (transaction) => {
    const promotion = await sql<{ id: string }>`
      select id from promotions.promotions where id = ${input.promotionId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    if (!promotion.rows[0]) throw new PromotionDomainError('NOT_FOUND', 'Promotion was not found.');
    try {
      const created = await sql<{ id: string }>`
        insert into promotions.coupon_codes (
          organization_id, promotion_id, code, normalized_code, usage_limit_total, usage_limit_per_customer
        )
        values (
          ${input.organizationId}, ${input.promotionId}, ${input.code.trim()}, ${normalizedCode},
          ${input.usageLimitTotal ?? null}, ${input.usageLimitPerCustomer ?? null}
        ) returning id
      `.execute(transaction);
      const id = created.rows[0]?.id;
      if (!id) throw new Error('Coupon creation did not return an id.');
      await emitPromotionEvent(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        promotionId: input.promotionId,
        action: 'promotions.coupon.created',
      });
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

export async function updateCouponCode(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    promotionId: string;
    couponId: string;
    status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    usageLimitTotal?: number | null;
    usageLimitPerCustomer?: number | null;
  },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const coupon = await sql<{ id: string }>`
      select id from promotions.coupon_codes
      where id = ${input.couponId} and promotion_id = ${input.promotionId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    if (!coupon.rows[0]) throw new PromotionDomainError('NOT_FOUND', 'Coupon code was not found.');

    await sql`
      update promotions.coupon_codes
      set
        status = coalesce(${input.status ?? null}, status),
        usage_limit_total = case when ${input.usageLimitTotal !== undefined} then ${input.usageLimitTotal ?? null} else usage_limit_total end,
        usage_limit_per_customer = case when ${input.usageLimitPerCustomer !== undefined} then ${input.usageLimitPerCustomer ?? null} else usage_limit_per_customer end,
        updated_at = now(),
        version = version + 1
      where id = ${input.couponId} and organization_id = ${input.organizationId}
    `.execute(transaction);

    await emitPromotionEvent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      promotionId: input.promotionId,
      action: 'promotions.coupon.updated',
    });
  });
}

export async function updatePromotionStatus(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    promotionId: string;
    status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const existing = await sql<{ id: string }>`
      select id from promotions.promotions where id = ${input.promotionId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    if (!existing.rows[0]) throw new PromotionDomainError('NOT_FOUND', 'Promotion was not found.');

    await sql`
      update promotions.promotions
      set status = ${input.status}, updated_at = now(), version = version + 1
      where id = ${input.promotionId} and organization_id = ${input.organizationId}
    `.execute(transaction);

    await emitPromotionEvent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      promotionId: input.promotionId,
      action: `promotions.promotion.status_${input.status.toLowerCase()}`,
    });
  });
}

export async function updatePromotion(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    promotionId: string;
    name?: string;
    startsAt?: Date | null;
    endsAt?: Date | null;
    priority?: number;
    combinability?: PromotionCombinability;
    status?: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    benefitType?: PromotionBenefit;
    benefitValue?: string;
    minimumMerchandiseSubtotal?: string | null;
    productIds?: readonly string[];
    variantIds?: readonly string[];
    categoryIds?: readonly string[];
  },
): Promise<void> {
  if (input.name !== undefined && !input.name.trim()) {
    throw new PromotionDomainError('VALIDATION_FAILED', 'Promotion name cannot be empty.');
  }
  if (input.benefitValue !== undefined) {
    const value = toScaled(input.benefitValue);
    if (value <= 0n) throw new PromotionDomainError('VALIDATION_FAILED', 'Promotion benefit must be positive.');
    if (input.benefitType === 'PERCENTAGE_DISCOUNT' && value > 100n * moneyScale) {
      throw new PromotionDomainError('VALIDATION_FAILED', 'Percentage discount cannot exceed 100%.');
    }
  }
  if (input.minimumMerchandiseSubtotal) {
    toScaled(input.minimumMerchandiseSubtotal);
  }

  await db.transaction().execute(async (transaction) => {
    const existing = await sql<{ id: string; version: string }>`
      select id, version::text from promotions.promotions where id = ${input.promotionId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    if (!existing.rows[0]) throw new PromotionDomainError('NOT_FOUND', 'Promotion was not found.');

    await assertPromotionTargetOwnership(transaction, input.organizationId, input);

    await sql`
      update promotions.promotions
      set
        name = coalesce(${input.name !== undefined ? input.name.trim() : null}, name),
        status = coalesce(${input.status ?? null}, status),
        starts_at = case when ${input.startsAt !== undefined} then ${input.startsAt ?? null} else starts_at end,
        ends_at = case when ${input.endsAt !== undefined} then ${input.endsAt ?? null} else ends_at end,
        priority = coalesce(${input.priority ?? null}, priority),
        combinability = coalesce(${input.combinability ?? null}, combinability),
        updated_at = now(),
        version = version + 1
      where id = ${input.promotionId} and organization_id = ${input.organizationId}
    `.execute(transaction);

    const ruleChange =
      input.benefitType !== undefined ||
      input.benefitValue !== undefined ||
      input.minimumMerchandiseSubtotal !== undefined ||
      input.productIds !== undefined ||
      input.variantIds !== undefined ||
      input.categoryIds !== undefined;

    if (ruleChange) {
      const activeRevision = await sql<{
        id: string;
        revision_number: number;
        benefit_type: PromotionBenefit;
        benefit_value: string;
        minimum_merchandise_subtotal: string | null;
      }>`
        select id, revision_number, benefit_type, benefit_value::text, minimum_merchandise_subtotal::text
        from promotions.promotion_revisions
        where promotion_id = ${input.promotionId} and status = 'ACTIVE'
        order by revision_number desc
        limit 1
      `.execute(transaction);

      const prev = activeRevision.rows[0];
      const nextRevisionNumber = (prev?.revision_number ?? 0) + 1;
      const benefitType = input.benefitType ?? prev?.benefit_type ?? 'PERCENTAGE_DISCOUNT';
      const benefitValue = input.benefitValue ?? prev?.benefit_value ?? '10.0000';
      const minimumSubtotal =
        input.minimumMerchandiseSubtotal !== undefined
          ? input.minimumMerchandiseSubtotal
          : (prev?.minimum_merchandise_subtotal ?? null);

      if (prev) {
        await sql`
          update promotions.promotion_revisions
          set status = 'SUPERSEDED'
          where promotion_id = ${input.promotionId} and status = 'ACTIVE'
        `.execute(transaction);
      }

      const newRev = await sql<{ id: string }>`
        insert into promotions.promotion_revisions (
          organization_id, promotion_id, revision_number, status, benefit_type, benefit_value, minimum_merchandise_subtotal, activated_at
        ) values (
          ${input.organizationId}, ${input.promotionId}, ${nextRevisionNumber}, 'ACTIVE', ${benefitType}, ${benefitValue}::numeric,
          ${minimumSubtotal ?? null}::numeric, now()
        ) returning id
      `.execute(transaction);

      const revisionId = newRev.rows[0]?.id;
      if (!revisionId) throw new Error('Could not create new revision.');

      for (const productId of input.productIds ?? []) {
        await sql`insert into promotions.promotion_target_products (organization_id, promotion_revision_id, product_id) values (${input.organizationId}, ${revisionId}, ${productId})`.execute(transaction);
      }
      for (const variantId of input.variantIds ?? []) {
        await sql`insert into promotions.promotion_target_variants (organization_id, promotion_revision_id, variant_id) values (${input.organizationId}, ${revisionId}, ${variantId})`.execute(transaction);
      }
      for (const categoryId of input.categoryIds ?? []) {
        await sql`insert into promotions.promotion_target_categories (organization_id, promotion_revision_id, category_id) values (${input.organizationId}, ${revisionId}, ${categoryId})`.execute(transaction);
      }
    }

    await emitPromotionEvent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      promotionId: input.promotionId,
      action: 'promotions.promotion.updated',
    });
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
  readonly coupons: readonly {
    id: string;
    code: string;
    status: string;
    usageLimitTotal?: number | null;
    usageLimitPerCustomer?: number | null;
    usageCount?: number;
    createdAt?: string;
  }[];
  readonly committedUsageCount: number;
  readonly committedDiscount: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly targetProductCount?: number;
  readonly targetCategoryCount?: number;
  readonly targetVariantCount?: number;
}

export interface AdminPromotionDetail extends AdminPromotionSummary {
  readonly revisionId: string | null;
  readonly revisionNumber: number;
  readonly targetProducts: readonly { id: string; title: string; handle: string }[];
  readonly targetCategories: readonly { id: string; name: string; handle: string }[];
  readonly recentUsages: readonly {
    id: string;
    orderId: string | null;
    orderNumber: string | null;
    customerId: string | null;
    customerName: string | null;
    customerNumber: string | null;
    couponCode: string | null;
    discountAmount: string;
    status: string;
    createdAt: string;
  }[];
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
      updated_at: string;
      target_product_count: string;
      target_category_count: string;
      target_variant_count: string;
    }>`
      select promotion.id::text, promotion.name, promotion.promotion_type, promotion.status,
        promotion.starts_at::text, promotion.ends_at::text, promotion.priority, promotion.combinability,
        revision.benefit_type, revision.benefit_value::text,
        revision.minimum_merchandise_subtotal::text,
        count(distinct usage.id) filter (where usage.status='COMMITTED')::text as committed_usage_count,
        coalesce(sum(usage.discount_amount) filter (where usage.status='COMMITTED'),0)::text as committed_discount,
        promotion.created_at::text,
        promotion.updated_at::text,
        coalesce(tp.cnt, 0)::text as target_product_count,
        coalesce(tc.cnt, 0)::text as target_category_count,
        coalesce(tv.cnt, 0)::text as target_variant_count
      from promotions.promotions promotion
      join promotions.promotion_revisions revision
        on revision.promotion_id=promotion.id and revision.status='ACTIVE'
      left join promotions.promotion_usage usage
        on usage.promotion_id=promotion.id and usage.organization_id=promotion.organization_id
      left join (
        select promotion_revision_id, count(*)::text as cnt
        from promotions.promotion_target_products
        group by promotion_revision_id
      ) tp on tp.promotion_revision_id = revision.id
      left join (
        select promotion_revision_id, count(*)::text as cnt
        from promotions.promotion_target_categories
        group by promotion_revision_id
      ) tc on tc.promotion_revision_id = revision.id
      left join (
        select promotion_revision_id, count(*)::text as cnt
        from promotions.promotion_target_variants
        group by promotion_revision_id
      ) tv on tv.promotion_revision_id = revision.id
      where promotion.organization_id=${organizationId}
      group by promotion.id, revision.id, tp.cnt, tc.cnt, tv.cnt
      order by promotion.created_at desc, promotion.id desc
    `.execute(db),
    sql<{
      id: string;
      promotion_id: string;
      code: string;
      status: string;
      usage_limit_total: string | null;
      usage_limit_per_customer: string | null;
      created_at: string;
      usage_count: string;
    }>`
      select c.id::text, c.promotion_id::text, c.code, c.status,
        c.usage_limit_total::text, c.usage_limit_per_customer::text,
        c.created_at::text,
        count(u.id) filter (where u.status = 'COMMITTED')::text as usage_count
      from promotions.coupon_codes c
      left join promotions.promotion_usage u on u.coupon_code_id = c.id
      where c.organization_id=${organizationId}
      group by c.id
      order by c.created_at, c.id
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
      .map((coupon) => ({
        id: coupon.id,
        code: coupon.code,
        status: coupon.status,
        usageLimitTotal: coupon.usage_limit_total ? Number(coupon.usage_limit_total) : null,
        usageLimitPerCustomer: coupon.usage_limit_per_customer ? Number(coupon.usage_limit_per_customer) : null,
        usageCount: Number(coupon.usage_count),
        createdAt: coupon.created_at,
      })),
    committedUsageCount: Number(promotion.committed_usage_count),
    committedDiscount: promotion.committed_discount,
    createdAt: promotion.created_at,
    updatedAt: promotion.updated_at,
    targetProductCount: Number(promotion.target_product_count),
    targetCategoryCount: Number(promotion.target_category_count),
    targetVariantCount: Number(promotion.target_variant_count),
  }));
}

export async function getAdminPromotionDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  promotionId: string,
): Promise<AdminPromotionDetail | null> {
  const promotionRow = await sql<{
    id: string;
    name: string;
    promotion_type: AdminPromotionSummary['promotionType'];
    status: AdminPromotionSummary['status'];
    starts_at: string | null;
    ends_at: string | null;
    priority: number;
    combinability: PromotionCombinability;
    created_at: string;
    updated_at: string;
    revision_id: string | null;
    revision_number: number | null;
    benefit_type: PromotionBenefit | null;
    benefit_value: string | null;
    minimum_merchandise_subtotal: string | null;
    committed_usage_count: string;
    committed_discount: string;
  }>`
    select
      promotion.id::text, promotion.name, promotion.promotion_type, promotion.status,
      promotion.starts_at::text, promotion.ends_at::text, promotion.priority, promotion.combinability,
      promotion.created_at::text, promotion.updated_at::text,
      revision.id::text as revision_id, revision.revision_number, revision.benefit_type, revision.benefit_value::text,
      revision.minimum_merchandise_subtotal::text,
      count(distinct usage.id) filter (where usage.status='COMMITTED')::text as committed_usage_count,
      coalesce(sum(usage.discount_amount) filter (where usage.status='COMMITTED'), 0)::text as committed_discount
    from promotions.promotions promotion
    left join promotions.promotion_revisions revision
      on revision.promotion_id = promotion.id and revision.status = 'ACTIVE'
    left join promotions.promotion_usage usage
      on usage.promotion_id = promotion.id and usage.organization_id = promotion.organization_id
    where promotion.id = ${promotionId} and promotion.organization_id = ${organizationId}
    group by promotion.id, revision.id
  `.execute(db);

  const row = promotionRow.rows[0];
  if (!row) return null;

  const [products, categories, coupons, usages] = await Promise.all([
    row.revision_id
      ? sql<{ id: string; title: string; handle: string }>`
          select p.id::text, p.title, p.handle
          from promotions.promotion_target_products tp
          join catalog.products p on p.id = tp.product_id
          where tp.promotion_revision_id = ${row.revision_id}
          order by p.title
        `.execute(db)
      : Promise.resolve({ rows: [] }),
    row.revision_id
      ? sql<{ id: string; name: string; handle: string }>`
          select c.id::text, c.name, c.handle
          from promotions.promotion_target_categories tc
          join catalog.categories c on c.id = tc.category_id
          where tc.promotion_revision_id = ${row.revision_id}
          order by c.name
        `.execute(db)
      : Promise.resolve({ rows: [] }),
    sql<{
      id: string;
      code: string;
      status: string;
      usage_limit_total: string | null;
      usage_limit_per_customer: string | null;
      usage_count: string;
      created_at: string;
    }>`
      select c.id::text, c.code, c.status,
        c.usage_limit_total::text, c.usage_limit_per_customer::text,
        c.created_at::text,
        count(u.id) filter (where u.status = 'COMMITTED')::text as usage_count
      from promotions.coupon_codes c
      left join promotions.promotion_usage u on u.coupon_code_id = c.id
      where c.promotion_id = ${promotionId} and c.organization_id = ${organizationId}
      group by c.id
      order by c.created_at desc
    `.execute(db),
    sql<{
      id: string;
      order_id: string | null;
      order_number: string | null;
      customer_id: string | null;
      customer_name: string | null;
      customer_number: string | null;
      coupon_code: string | null;
      discount_amount: string;
      status: string;
      created_at: string;
    }>`
      select
        u.id::text, u.order_id::text, o.order_number,
        u.customer_id::text, cust.display_name as customer_name, cust.customer_number,
        c.code as coupon_code, u.discount_amount::text, u.status, u.created_at::text
      from promotions.promotion_usage u
      left join orders.orders o on o.id = u.order_id
      left join customers.customers cust on cust.id = u.customer_id
      left join promotions.coupon_codes c on c.id = u.coupon_code_id
      where u.promotion_id = ${promotionId} and u.organization_id = ${organizationId}
      order by u.created_at desc
      limit 50
    `.execute(db),
  ]);

  return {
    id: row.id,
    name: row.name,
    promotionType: row.promotion_type,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    priority: row.priority,
    combinability: row.combinability,
    benefitType: row.benefit_type ?? 'PERCENTAGE_DISCOUNT',
    benefitValue: row.benefit_value ?? '0.0000',
    minimumMerchandiseSubtotal: row.minimum_merchandise_subtotal,
    coupons: coupons.rows.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      status: coupon.status,
      usageLimitTotal: coupon.usage_limit_total ? Number(coupon.usage_limit_total) : null,
      usageLimitPerCustomer: coupon.usage_limit_per_customer ? Number(coupon.usage_limit_per_customer) : null,
      usageCount: Number(coupon.usage_count),
      createdAt: coupon.created_at,
    })),
    committedUsageCount: Number(row.committed_usage_count),
    committedDiscount: row.committed_discount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revisionId: row.revision_id,
    revisionNumber: row.revision_number ?? 1,
    targetProductCount: products.rows.length,
    targetCategoryCount: categories.rows.length,
    targetVariantCount: 0,
    targetProducts: products.rows,
    targetCategories: categories.rows,
    recentUsages: usages.rows.map((u) => ({
      id: u.id,
      orderId: u.order_id,
      orderNumber: u.order_number,
      customerId: u.customer_id,
      customerName: u.customer_name,
      customerNumber: u.customer_number,
      couponCode: u.coupon_code,
      discountAmount: u.discount_amount,
      status: u.status,
      createdAt: u.created_at,
    })),
  };
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
