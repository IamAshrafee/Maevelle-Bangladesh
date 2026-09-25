import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';

export type DeliveryRiskLevel = 'INSUFFICIENT_HISTORY' | 'LOW' | 'MODERATE' | 'ELEVATED';

export interface CustomerDeliveryHistory {
  readonly totalDeliveries: number;
  readonly eligibleDeliveries: number;
  readonly deliveredCount: number;
  readonly failedDeliveryCount: number;
  readonly rtoCount: number;
  readonly lostOrDamagedCount: number;
  readonly cancelledBeforeDispatchCount: number;
  readonly customerReturnCount: number;
  readonly codEligibleCount: number;
  readonly codDeliveredCount: number;
  readonly differentOrderCount: number;
  readonly successRate: number | null;
  readonly rtoRate: number | null;
  readonly lastSuccessfulDelivery?: string;
  readonly lastRto?: string;
  readonly recentOutcomes: readonly {
    deliveryId: string;
    deliveryNumber: string;
    orderNumber: string;
    providerCode?: string;
    outcome: string;
    occurredAt: string;
  }[];
  readonly risk: {
    level: DeliveryRiskLevel;
    reasons: readonly { code: string; explanation: string }[];
  };
  readonly providerHistory: readonly {
    providerCode: string;
    total: number;
    delivered: number;
    rto: number;
  }[];
  readonly checkedAt: string;
  readonly externalProviderHistory: {
    readonly pathao: {
      readonly available: false;
      readonly reason: 'NO_OFFICIAL_API_DOCUMENTED';
    };
  };
}

interface DeliveryHistoryRow {
  id: string;
  delivery_number: string;
  order_number: string;
  outcome_status: string;
  operational_status: string;
  cod_required: boolean;
  handed_over_at: Date | null;
  delivered_at: Date | null;
  failed_at: Date | null;
  updated_at: Date;
  provider_code: string | null;
  has_rto: boolean;
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 100;
}

function assessRisk(input: {
  eligible: number;
  delivered: number;
  failed: number;
  rto: number;
  lostOrDamaged: number;
  recent: readonly DeliveryHistoryRow[];
}): CustomerDeliveryHistory['risk'] {
  const reasons: { code: string; explanation: string }[] = [];
  const rtoRate = input.eligible ? input.rto / input.eligible : 0;
  const failedRate = input.eligible ? input.failed / input.eligible : 0;
  const recentNegative = input.recent
    .slice(0, 5)
    .filter(
      (row) => row.has_rto || ['FAILED', 'LOST', 'DAMAGED'].includes(row.outcome_status),
    ).length;

  if (input.eligible < 2) {
    reasons.push({
      code: 'INSUFFICIENT_HISTORY',
      explanation: 'Fewer than two handed-over deliveries are available for a reliable pattern.',
    });
    return { level: 'INSUFFICIENT_HISTORY', reasons };
  }
  if (input.rto >= 2)
    reasons.push({
      code: 'REPEATED_RTO',
      explanation: `${input.rto} eligible deliveries resulted in RTO.`,
    });
  if (rtoRate >= 0.4)
    reasons.push({
      code: 'HIGH_RTO_RATE',
      explanation: `${Math.round(rtoRate * 100)}% of eligible deliveries resulted in RTO.`,
    });
  if (input.delivered === 0)
    reasons.push({
      code: 'NO_SUCCESSFUL_DELIVERY',
      explanation: 'No successful handed-over delivery is recorded yet.',
    });
  if (recentNegative >= 2)
    reasons.push({
      code: 'RECENT_NEGATIVE_TREND',
      explanation: `${recentNegative} of the five most recent deliveries had a negative outcome.`,
    });
  if (input.lostOrDamaged > 0)
    reasons.push({
      code: 'COURIER_EXCEPTION_HISTORY',
      explanation: `${input.lostOrDamaged} delivery record(s) were lost or damaged; review context before attributing customer risk.`,
    });

  if ((input.rto >= 2 && rtoRate >= 0.4) || (input.delivered === 0 && input.eligible >= 3))
    return { level: 'ELEVATED', reasons };
  if (input.rto > 0 || failedRate >= 0.4 || recentNegative >= 2)
    return { level: 'MODERATE', reasons };
  return {
    level: 'LOW',
    reasons: [
      {
        code: 'POSITIVE_OBSERVED_HISTORY',
        explanation: `${input.delivered} of ${input.eligible} eligible deliveries were completed successfully.`,
      },
    ],
  };
}

/**
 * Produces factual, organization-scoped delivery history using Maevelle's
 * normalized customer phones and canonical/alias customer family. Merchant
 * cancellations before handover are reported separately and never counted as
 * customer delivery failures.
 */
export async function getCustomerDeliveryHistory(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; customerId?: string; deliveryId?: string },
): Promise<CustomerDeliveryHistory> {
  if (!input.customerId && !input.deliveryId)
    throw new Error('Customer or Delivery identity is required.');
  const deliveries = await sql<DeliveryHistoryRow>`with recursive customer_family as (
      select customer.id
      from customers.customers customer
      where customer.organization_id=${input.organizationId}
        and customer.id=${input.customerId ?? null}::uuid
      union
      select case when alias.canonical_customer_id=family.id
        then alias.alias_customer_id else alias.canonical_customer_id end
      from customers.customer_aliases alias
      join customer_family family on family.id in (alias.canonical_customer_id,alias.alias_customer_id)
      where alias.organization_id=${input.organizationId}
    ), target_phones as (
      select phone.normalized_value
      from customers.customer_phones phone
      where phone.organization_id=${input.organizationId} and phone.customer_id in (select id from customer_family)
      union
      select snapshot.normalized_phone
      from orders.order_customer_snapshots snapshot
      join orders.orders order_row on order_row.id=snapshot.order_id and order_row.organization_id=snapshot.organization_id
      where snapshot.organization_id=${input.organizationId} and order_row.customer_id in (select id from customer_family)
      union
      select snapshot.normalized_phone
      from delivery.deliveries selected
      join orders.order_customer_snapshots snapshot on snapshot.order_id=selected.order_id
        and snapshot.organization_id=selected.organization_id
      where selected.organization_id=${input.organizationId} and selected.id=${input.deliveryId ?? null}::uuid
    ), matched_orders as (
      select distinct order_row.id
      from orders.orders order_row
      join orders.order_customer_snapshots snapshot on snapshot.order_id=order_row.id
        and snapshot.organization_id=order_row.organization_id
      where order_row.organization_id=${input.organizationId}
        and (order_row.customer_id in (select id from customer_family)
          or snapshot.normalized_phone in (select normalized_value from target_phones))
    )
    select delivery.id,delivery.delivery_number,order_row.order_number,delivery.outcome_status,
      delivery.operational_status,delivery.cod_required,delivery.handed_over_at,delivery.delivered_at,
      delivery.failed_at,delivery.updated_at,booking.provider_code,
      exists(select 1 from returns.return_cases return_case where return_case.organization_id=delivery.organization_id
        and return_case.delivery_id=delivery.id and return_case.case_type='RTO') as has_rto
    from delivery.deliveries delivery
    join orders.orders order_row on order_row.id=delivery.order_id and order_row.organization_id=delivery.organization_id
    left join lateral (
      select courier.provider_code from delivery.courier_bookings courier
      where courier.organization_id=delivery.organization_id and courier.delivery_id=delivery.id
        and courier.status in ('BOOKED','CANCELLATION_PENDING','CANCELLED','UNKNOWN_OUTCOME')
      order by courier.booking_sequence desc limit 1
    ) booking on true
    where delivery.organization_id=${input.organizationId} and delivery.order_id in (select id from matched_orders)
    order by coalesce(delivery.delivered_at,delivery.failed_at,delivery.handed_over_at,delivery.updated_at) desc,delivery.id desc`.execute(
    db,
  );

  const rows = deliveries.rows;
  const eligibleRows = rows.filter(
    (row) =>
      row.handed_over_at !== null ||
      ['DELIVERED', 'FAILED', 'RETURNED_TO_ORIGIN', 'LOST', 'DAMAGED'].includes(row.outcome_status),
  );
  const deliveredCount = eligibleRows.filter((row) => row.outcome_status === 'DELIVERED').length;
  const failedDeliveryCount = eligibleRows.filter((row) => row.outcome_status === 'FAILED').length;
  const rtoCount = eligibleRows.filter(
    (row) => row.has_rto || row.outcome_status === 'RETURNED_TO_ORIGIN',
  ).length;
  const lostOrDamagedCount = eligibleRows.filter((row) =>
    ['LOST', 'DAMAGED'].includes(row.outcome_status),
  ).length;
  const cancelledBeforeDispatchCount = rows.filter(
    (row) => row.outcome_status === 'CANCELLED_BEFORE_HANDOVER',
  ).length;
  const codRows = eligibleRows.filter((row) => row.cod_required);
  const orderNumbers = new Set(rows.map((row) => row.order_number));
  const customerReturns = await sql<{ count: string }>`with recursive customer_family as (
      select customer.id from customers.customers customer
      where customer.organization_id=${input.organizationId} and customer.id=${input.customerId ?? null}::uuid
      union select case when alias.canonical_customer_id=family.id
        then alias.alias_customer_id else alias.canonical_customer_id end from customers.customer_aliases alias
      join customer_family family on family.id in (alias.canonical_customer_id,alias.alias_customer_id)
      where alias.organization_id=${input.organizationId}
    ), target_orders as (
      select distinct delivery.order_id from delivery.deliveries delivery
      where delivery.organization_id=${input.organizationId} and delivery.id=any(${rows.map((row) => row.id)}::uuid[])
    ) select count(*)::text as count from returns.return_cases return_case
      where return_case.organization_id=${input.organizationId} and return_case.case_type='CUSTOMER_RETURN'
        and (return_case.order_id in (select order_id from target_orders)
          or return_case.customer_id in (select id from customer_family))`.execute(db);
  const providerMap = new Map<string, { total: number; delivered: number; rto: number }>();
  for (const row of eligibleRows) {
    const provider = row.provider_code ?? 'UNASSIGNED';
    const current = providerMap.get(provider) ?? { total: 0, delivered: 0, rto: 0 };
    current.total += 1;
    if (row.outcome_status === 'DELIVERED') current.delivered += 1;
    if (row.has_rto || row.outcome_status === 'RETURNED_TO_ORIGIN') current.rto += 1;
    providerMap.set(provider, current);
  }
  const risk = assessRisk({
    eligible: eligibleRows.length,
    delivered: deliveredCount,
    failed: failedDeliveryCount,
    rto: rtoCount,
    lostOrDamaged: lostOrDamagedCount,
    recent: rows,
  });
  const lastSuccessful = rows.find((row) => row.outcome_status === 'DELIVERED');
  const lastRto = rows.find((row) => row.has_rto || row.outcome_status === 'RETURNED_TO_ORIGIN');
  return {
    totalDeliveries: rows.length,
    eligibleDeliveries: eligibleRows.length,
    deliveredCount,
    failedDeliveryCount,
    rtoCount,
    lostOrDamagedCount,
    cancelledBeforeDispatchCount,
    customerReturnCount: Number(customerReturns.rows[0]?.count ?? 0),
    codEligibleCount: codRows.length,
    codDeliveredCount: codRows.filter((row) => row.outcome_status === 'DELIVERED').length,
    differentOrderCount: orderNumbers.size,
    successRate: percentage(deliveredCount, eligibleRows.length),
    rtoRate: percentage(rtoCount, eligibleRows.length),
    ...(lastSuccessful
      ? {
          lastSuccessfulDelivery: (
            lastSuccessful.delivered_at ?? lastSuccessful.updated_at
          ).toISOString(),
        }
      : {}),
    ...(lastRto ? { lastRto: (lastRto.failed_at ?? lastRto.updated_at).toISOString() } : {}),
    recentOutcomes: rows.slice(0, 10).map((row) => ({
      deliveryId: row.id,
      deliveryNumber: row.delivery_number,
      orderNumber: row.order_number,
      ...(row.provider_code ? { providerCode: row.provider_code } : {}),
      outcome: row.has_rto ? 'RTO' : row.outcome_status,
      occurredAt: (
        row.delivered_at ??
        row.failed_at ??
        row.handed_over_at ??
        row.updated_at
      ).toISOString(),
    })),
    risk,
    providerHistory: [...providerMap.entries()]
      .map(([providerCode, value]) => ({ providerCode, ...value }))
      .sort(
        (left, right) =>
          right.total - left.total || left.providerCode.localeCompare(right.providerCode),
      ),
    checkedAt: new Date().toISOString(),
    externalProviderHistory: {
      pathao: { available: false, reason: 'NO_OFFICIAL_API_DOCUMENTED' },
    },
  };
}
