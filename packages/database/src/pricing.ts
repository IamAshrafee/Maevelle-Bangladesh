import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';

export class PricingDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'STALE_VERSION',
    message: string,
  ) {
    super(message);
    this.name = 'PricingDomainError';
  }
}

export interface ResolvedPrice {
  readonly priceDefinitionId: string;
  readonly variantId: string;
  readonly amount: string;
  readonly compareAtAmount: string | null;
  readonly currency: string;
}

function assertMoney(value: string, label: string): void {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) {
    throw new PricingDomainError(
      'VALIDATION_FAILED',
      `${label} must be a non-negative decimal with at most four decimal places.`,
    );
  }
}

function assertCurrency(value: string): void {
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new PricingDomainError(
      'VALIDATION_FAILED',
      'Currency must be a three-letter uppercase code.',
    );
  }
}

async function emitPriceEvent(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; priceDefinitionId: string; action: string },
): Promise<void> {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.action,
    targetType: 'pricing.price_definition',
    targetId: input.priceDefinitionId,
  });
  await sql`
    insert into platform.outbox_events (
      organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
    ) values (
      ${input.organizationId}, ${input.action}, 1, 'pricing.price_definition', ${input.priceDefinitionId}, 1,
      ${JSON.stringify({ priceDefinitionId: input.priceDefinitionId })}::jsonb, now()
    )
  `.execute(db);
}

export async function createPriceDefinition(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    variantId: string;
    currency: string;
    amount: string;
    compareAtAmount?: string | null;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
    status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  },
): Promise<ResolvedPrice & { version: number }> {
  assertCurrency(input.currency);
  assertMoney(input.amount, 'Amount');
  if (input.compareAtAmount !== undefined && input.compareAtAmount !== null) {
    assertMoney(input.compareAtAmount, 'Compare-at amount');
    if (
      BigInt(
        input.compareAtAmount
          .replace('.', '')
          .padEnd(
            input.compareAtAmount.indexOf('.') < 0 ? 5 : input.compareAtAmount.indexOf('.') + 5,
            '0',
          ),
      ) < 0n
    ) {
      throw new PricingDomainError('VALIDATION_FAILED', 'Compare-at amount is invalid.');
    }
  }
  if (input.effectiveTo && input.effectiveFrom && input.effectiveTo <= input.effectiveFrom) {
    throw new PricingDomainError(
      'VALIDATION_FAILED',
      'Effective end must be after effective start.',
    );
  }
  return db.transaction().execute(async (transaction) => {
    const variant = await sql<{ id: string }>`
      select id from catalog.product_variants
      where id = ${input.variantId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    if (!variant.rows[0]) {
      throw new PricingDomainError(
        'NOT_FOUND',
        'Catalog Variant was not found in this organization.',
      );
    }
    try {
      const result = await sql<{
        id: string;
        variant_id: string;
        amount: string;
        compare_at_amount: string | null;
        currency_code: string;
        version: string;
      }>`
        insert into pricing.price_definitions (
          organization_id, variant_id, currency_code, amount, compare_at_amount, effective_from, effective_to, status
        ) values (
          ${input.organizationId}, ${input.variantId}, ${input.currency}, ${input.amount}::numeric,
          ${input.compareAtAmount ?? null}::numeric, ${input.effectiveFrom ?? new Date()}, ${input.effectiveTo ?? null}, ${input.status ?? 'ACTIVE'}
        ) returning id, variant_id, amount::text, compare_at_amount::text, currency_code, version::text
      `.execute(transaction);
      const row = result.rows[0];
      if (!row) throw new Error('Price Definition creation did not return a row.');
      await emitPriceEvent(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        priceDefinitionId: row.id,
        action: 'pricing.price_definition.created',
      });
      return {
        priceDefinitionId: row.id,
        variantId: row.variant_id,
        amount: row.amount,
        compareAtAmount: row.compare_at_amount,
        currency: row.currency_code,
        version: Number(row.version),
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23P01'
      ) {
        throw new PricingDomainError(
          'CONFLICT',
          'An active price already overlaps this time range.',
        );
      }
      throw error;
    }
  });
}

/** Replaces the current default price atomically while retaining prior definitions as history. */
export async function setCurrentVariantPrice(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    variantId: string;
    currency: string;
    amount: string;
    compareAtAmount?: string | null;
  },
): Promise<ResolvedPrice & { version: number }> {
  assertCurrency(input.currency);
  assertMoney(input.amount, 'Amount');
  if (input.compareAtAmount !== undefined && input.compareAtAmount !== null) {
    assertMoney(input.compareAtAmount, 'Compare-at amount');
    if (Number(input.compareAtAmount) < Number(input.amount))
      throw new PricingDomainError(
        'VALIDATION_FAILED',
        'Compare-at amount must be greater than or equal to the selling amount.',
      );
  }
  return db.transaction().execute(async (transaction) => {
    const variant = await sql<{ id: string }>`select id::text from catalog.product_variants
      where organization_id=${input.organizationId} and id=${input.variantId}::uuid`.execute(
      transaction,
    );
    if (!variant.rows[0])
      throw new PricingDomainError('NOT_FOUND', 'Catalog Variant was not found.');
    await sql`update pricing.price_definitions set status='ARCHIVED',updated_at=now(),version=version+1
      where organization_id=${input.organizationId} and variant_id=${input.variantId}::uuid
        and currency_code=${input.currency} and status='ACTIVE'
        and effective_from<=now() and (effective_to is null or effective_to>now())`.execute(transaction);
    const result = await sql<{
      id: string;
      variant_id: string;
      amount: string;
      compare_at_amount: string | null;
      currency_code: string;
      version: string;
    }>`insert into pricing.price_definitions
        (organization_id,variant_id,currency_code,amount,compare_at_amount,effective_from,status)
      values (${input.organizationId},${input.variantId},${input.currency},${input.amount}::numeric,
        ${input.compareAtAmount ?? null}::numeric,now(),'ACTIVE')
      returning id::text,variant_id::text,amount::text,compare_at_amount::text,
        currency_code,version::text`.execute(transaction);
    const price = result.rows[0];
    if (!price) throw new Error('Current price replacement did not return a Price.');
    await emitPriceEvent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      priceDefinitionId: price.id,
      action: 'pricing.price_definition.replaced',
    });
    return {
      priceDefinitionId: price.id,
      variantId: price.variant_id,
      amount: price.amount,
      compareAtAmount: price.compare_at_amount,
      currency: price.currency_code,
      version: Number(price.version),
    };
  });
}

/** The sole V1 price resolver shared by storefront, Cart, and Promotion calculation. */
export async function resolveVariantPrice(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; variantId: string; currency: string; at?: Date },
): Promise<ResolvedPrice | undefined> {
  assertCurrency(input.currency);
  const at = input.at ?? new Date();
  const result = await sql<{
    id: string;
    variant_id: string;
    amount: string;
    compare_at_amount: string | null;
    currency_code: string;
  }>`
    select id, variant_id, amount::text, compare_at_amount::text, currency_code
    from pricing.price_definitions
    where organization_id = ${input.organizationId}
      and variant_id = ${input.variantId}
      and currency_code = ${input.currency}
      and status = 'ACTIVE'
      and effective_from <= ${at}
      and (effective_to is null or effective_to > ${at})
    order by effective_from desc, id desc
    limit 1
  `.execute(db);
  const row = result.rows[0];
  return row
    ? {
        priceDefinitionId: row.id,
        variantId: row.variant_id,
        amount: row.amount,
        compareAtAmount: row.compare_at_amount,
        currency: row.currency_code,
      }
    : undefined;
}

export async function listVariantPrices(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  variantId?: string,
): Promise<
  readonly (ResolvedPrice & {
    productId: string;
    productTitle: string;
    sku: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: string;
    version: number;
  })[]
> {
  const result = await sql<{
    id: string;
    variant_id: string;
    amount: string;
    compare_at_amount: string | null;
    currency_code: string;
    effective_from: Date;
    effective_to: Date | null;
    status: string;
    version: string;
    product_id: string;
    product_title: string;
    sku: string;
  }>`
    select price.id,price.variant_id,price.amount::text,price.compare_at_amount::text,
      price.currency_code,price.effective_from,price.effective_to,price.status,price.version::text,
      product.id::text as product_id,product.title as product_title,variant.sku
    from pricing.price_definitions price
    join catalog.product_variants variant
      on variant.id=price.variant_id and variant.organization_id=price.organization_id
    join catalog.products product
      on product.id=variant.product_id and product.organization_id=price.organization_id
    where price.organization_id = ${organizationId}
      and (${variantId ?? null}::uuid is null or price.variant_id = ${variantId ?? null}::uuid)
    order by product.title,variant.sku,price.effective_from desc,price.id desc
  `.execute(db);
  return result.rows.map((row) => ({
    priceDefinitionId: row.id,
    variantId: row.variant_id,
    amount: row.amount,
    compareAtAmount: row.compare_at_amount,
    currency: row.currency_code,
    productId: row.product_id,
    productTitle: row.product_title,
    sku: row.sku,
    effectiveFrom: row.effective_from.toISOString(),
    effectiveTo: row.effective_to?.toISOString() ?? null,
    status: row.status,
    version: Number(row.version),
  }));
}
