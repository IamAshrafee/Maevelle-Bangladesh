import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import type { CartView } from '../cart.js';
import {
  decimal4Minor,
  decimalPattern,
  OrderDomainError,
  type DeliveryQuote,
} from './types.js';

export async function resolveDeliveryQuote(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; currency: string; countryCode: string; geographyNodeId?: string },
): Promise<DeliveryQuote> {
  const result = await sql<{
    id: string;
    name: string;
    flat_amount: string;
    currency_code: string;
  }>`
    with recursive ancestry(id, depth) as (
      select ${input.geographyNodeId ?? null}::uuid, 0 where ${input.geographyNodeId ?? null}::uuid is not null
      union all
      select node.parent_id, ancestry.depth + 1
      from geography.nodes node join ancestry on ancestry.id = node.id
      where node.parent_id is not null
    )
    select rule.id, rule.name, rule.flat_amount::text, rule.currency_code
    from orders.delivery_pricing_rules rule
    where rule.organization_id = ${input.organizationId}
      and rule.status = 'ACTIVE'
      and rule.country_code = ${input.countryCode.toUpperCase()}
      and rule.currency_code = ${input.currency}
      and (rule.geography_node_id is null or rule.geography_node_id in (select id from ancestry))
    order by rule.priority desc,
      case when rule.geography_node_id is null then 1000000 else coalesce((select depth from ancestry where id = rule.geography_node_id), 1000000) end,
      rule.id
    limit 1
  `.execute(db);
  const row = result.rows[0];
  if (!row)
    throw new OrderDomainError(
      'VALIDATION_FAILED',
      'Delivery is not configured for this address and currency.',
    );
  return { ruleId: row.id, ruleName: row.name, amount: row.flat_amount, currency: row.currency_code };
}

export async function quoteForCheckout(
  db: Kysely<DatabaseSchema>,
  checkout: { organization_id: string; country_code: string | null; geography_node_id: string | null },
  cart: CartView,
): Promise<DeliveryQuote | null> {
  if (!checkout.country_code) return null;
  return resolveDeliveryQuote(db, {
    organizationId: checkout.organization_id,
    currency: cart.currency,
    countryCode: checkout.country_code,
    ...(checkout.geography_node_id ? { geographyNodeId: checkout.geography_node_id } : {}),
  });
}

export async function listDeliveryPricingRules(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
) {
  return (
    await sql<{
      id: string;
      name: string;
      country_code: string;
      geography_node_id: string | null;
      flat_amount: string;
      currency_code: string;
      priority: number;
      status: 'ACTIVE' | 'INACTIVE';
      version: string;
    }>`select id,name,country_code,geography_node_id,flat_amount::text,currency_code,priority,status,version::text from orders.delivery_pricing_rules where organization_id=${organizationId} order by status,priority desc,name,id`.execute(
      db,
    )
  ).rows.map((row) => ({ ...row, version: Number(row.version) }));
}

export async function createDeliveryPricingRule(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    name: string;
    countryCode: string;
    geographyNodeId?: string;
    flatAmount: string;
    currency: string;
    priority?: number;
  },
) {
  if (!input.name.trim() || !/^[A-Z]{2}$/.test(input.countryCode) || !/^[A-Z]{3}$/.test(input.currency))
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery pricing rule details are invalid.');
  if (!decimalPattern.test(input.flatAmount) || decimal4Minor(input.flatAmount) < 0n)
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery amount is invalid.');
  if (!Number.isInteger(input.priority ?? 0))
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery pricing priority must be an integer.');
  return db.transaction().execute(async (transaction) => {
    if (input.geographyNodeId) {
      const geography = await sql<{ id: string }>`select id from geography.nodes where id=${input.geographyNodeId} and status='ACTIVE'`.execute(
        transaction,
      );
      if (!geography.rows[0])
        throw new OrderDomainError('VALIDATION_FAILED', 'Delivery geography was not found.');
    }
    const conflicting = await sql<{ id: string }>`
      select id from orders.delivery_pricing_rules
      where organization_id=${input.organizationId} and status='ACTIVE'
        and country_code=${input.countryCode}
        and currency_code=${input.currency}
        and coalesce(geography_node_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(${input.geographyNodeId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        and priority=${input.priority ?? 0}
      limit 1
    `.execute(transaction);
    if (conflicting.rows[0])
      throw new OrderDomainError(
        'VALIDATION_FAILED',
        'An active delivery pricing rule already has this country, geography, and priority.',
      );
    const result = await sql<{ id: string; version: string }>`
      insert into orders.delivery_pricing_rules (organization_id,name,country_code,geography_node_id,flat_amount,currency_code,priority)
      values (${input.organizationId},${input.name.trim()},${input.countryCode},${input.geographyNodeId ?? null},${input.flatAmount}::numeric,${input.currency},${input.priority ?? 0})
      returning id,version::text
    `.execute(transaction);
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'orders.delivery_pricing_rule.created',
      targetType: 'orders.delivery_pricing_rule',
      targetId: result.rows[0]!.id,
      metadata: { countryCode: input.countryCode, flatAmount: input.flatAmount, priority: input.priority ?? 0 },
    });
    return { id: result.rows[0]!.id, version: Number(result.rows[0]!.version) };
  });
}

export async function updateDeliveryPricingRule(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    ruleId: string;
    expectedVersion: number;
    name: string;
    countryCode: string;
    geographyNodeId?: string;
    flatAmount: string;
    currency: string;
    priority: number;
    status: 'ACTIVE' | 'INACTIVE';
  },
) {
  if (!input.name.trim() || !/^[A-Z]{2}$/.test(input.countryCode) || !/^[A-Z]{3}$/.test(input.currency))
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery pricing rule details are invalid.');
  if (!decimalPattern.test(input.flatAmount) || decimal4Minor(input.flatAmount) < 0n)
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery amount is invalid.');
  if (!Number.isInteger(input.priority))
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery pricing priority must be an integer.');
  return db.transaction().execute(async (transaction) => {
    if (input.geographyNodeId) {
      const geography = await sql<{ id: string }>`select id from geography.nodes where id=${input.geographyNodeId} and status='ACTIVE'`.execute(
        transaction,
      );
      if (!geography.rows[0])
        throw new OrderDomainError('VALIDATION_FAILED', 'Delivery geography was not found.');
    }
    if (input.status === 'ACTIVE') {
      const conflicting = await sql<{ id: string }>`
        select id from orders.delivery_pricing_rules
        where organization_id=${input.organizationId} and status='ACTIVE' and id<>${input.ruleId}
          and country_code=${input.countryCode}
          and currency_code=${input.currency}
          and coalesce(geography_node_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(${input.geographyNodeId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          and priority=${input.priority}
        limit 1
      `.execute(transaction);
      if (conflicting.rows[0])
        throw new OrderDomainError(
          'VALIDATION_FAILED',
          'An active delivery pricing rule already has this country, geography, and priority.',
        );
    }
    const updated = await sql<{ version: string }>`
      update orders.delivery_pricing_rules
      set name=${input.name.trim()},country_code=${input.countryCode},geography_node_id=${input.geographyNodeId ?? null},
          flat_amount=${input.flatAmount}::numeric,currency_code=${input.currency},priority=${input.priority},status=${input.status},
          version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.ruleId} and version=${input.expectedVersion}
      returning version::text
    `.execute(transaction);
    if (updated.rows[0]) {
      await appendAuditEvent(transaction, {
        organizationId: input.organizationId,
        actorType: 'USER',
        actorId: input.actorId,
        action: 'orders.delivery_pricing_rule.updated',
        targetType: 'orders.delivery_pricing_rule',
        targetId: input.ruleId,
        metadata: { countryCode: input.countryCode, flatAmount: input.flatAmount, priority: input.priority, status: input.status },
      });
      return { id: input.ruleId, version: Number(updated.rows[0].version) };
    }
    const exists = await sql<{ id: string }>`select id from orders.delivery_pricing_rules where organization_id=${input.organizationId} and id=${input.ruleId}`.execute(transaction);
    if (!exists.rows[0]) throw new OrderDomainError('NOT_FOUND', 'Delivery pricing rule was not found.');
    throw new OrderDomainError('STALE_VERSION', 'Delivery pricing rule changed; reload before saving.');
  });
}
