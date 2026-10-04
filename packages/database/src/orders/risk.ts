import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import {
  getCustomerDeliveryHistory,
  normalizeBangladeshCustomerPhone,
  type CustomerDeliveryHistory,
} from '../delivery-intelligence.js';
import {
  checkSteadfastCustomerFraud,
  getActiveSteadfastCredentials,
  type SteadfastFraudCheckResult,
} from '../steadfast.js';
import type { EncryptionKey } from '@maevelle/security';
import { OrderDomainError } from './types.js';

export type OrderRiskLevel = 'INSUFFICIENT_HISTORY' | 'LOW' | 'MODERATE' | 'ELEVATED';

export type OrderRecommendation =
  | 'APPROVE_COD'
  | 'VERIFY_CUSTOMER'
  | 'REQUIRE_PREPAYMENT'
  | 'REJECT_SUSPICIOUS';

export interface OrderRiskSignal {
  readonly code: string;
  readonly title: string;
  readonly severity: 'INFO' | 'LOW' | 'WARNING' | 'CRITICAL';
  readonly explanation: string;
}

export interface OrderDuplicateCandidate {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly orderStatus: string;
  readonly createdAt: string;
  readonly matchingReasons: readonly string[];
}

export interface OrderDeliveryRiskAssessment {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly normalizedPhone: string;
  readonly overallRiskLevel: OrderRiskLevel;
  readonly recommendation: OrderRecommendation;
  readonly signals: readonly OrderRiskSignal[];
  readonly internalHistory: CustomerDeliveryHistory;
  readonly providerHistory: {
    readonly steadfast?: SteadfastFraudCheckResult;
    readonly pathao: { readonly available: false; readonly reason: string };
  };
  readonly duplicateOrders: readonly OrderDuplicateCandidate[];
  readonly evaluatedAt: string;
  readonly expiresAt: string;
  readonly isFresh: boolean;
}

/**
 * Detects recent potential duplicate order submissions (e.g. repeated checkout clicks,
 * identical cart submissions, or accidental re-orders within a 48-hour window).
 */
export async function detectOrderDuplicates(
  db: Kysely<DatabaseSchema>,
  input: {
    readonly organizationId: string;
    readonly orderId: string;
  },
): Promise<readonly OrderDuplicateCandidate[]> {
  const current = await sql<{
    id: string;
    order_number: string;
    customer_id: string | null;
    normalized_phone: string;
    total_amount: string;
    created_at: Date;
    address_line_1: string;
  }>`
    select o.id, o.order_number, o.customer_id, snap.normalized_phone, o.total_amount::text, o.created_at,
           coalesce(addr.address_line_1, '') as address_line_1
    from orders.orders o
    join orders.order_customer_snapshots snap on snap.organization_id = o.organization_id and snap.order_id = o.id
    left join orders.order_addresses addr on addr.organization_id = o.organization_id and addr.order_id = o.id and addr.address_type = 'DELIVERY'
    where o.organization_id = ${input.organizationId} and o.id = ${input.orderId}
  `.execute(db);

  const row = current.rows[0];
  if (!row) return [];

  const candidates = await sql<{
    id: string;
    order_number: string;
    order_status: string;
    total_amount: string;
    created_at: Date;
    normalized_phone: string;
    customer_id: string | null;
    address_line_1: string;
  }>`
    select o.id, o.order_number, o.order_status, o.total_amount::text, o.created_at,
           snap.normalized_phone, o.customer_id, coalesce(addr.address_line_1, '') as address_line_1
    from orders.orders o
    join orders.order_customer_snapshots snap on snap.organization_id = o.organization_id and snap.order_id = o.id
    left join orders.order_addresses addr on addr.organization_id = o.organization_id and addr.order_id = o.id and addr.address_type = 'DELIVERY'
    where o.organization_id = ${input.organizationId}
      and o.id <> ${input.orderId}
      and o.order_status not in ('CANCELLED')
      and o.created_at >= (${row.created_at}::timestamptz - interval '48 hours')
      and o.created_at <= (${row.created_at}::timestamptz + interval '48 hours')
      and (
        snap.normalized_phone = ${row.normalized_phone}
        or (o.customer_id is not null and o.customer_id = ${row.customer_id ?? null}::uuid)
      )
    order by o.created_at desc limit 5
  `.execute(db);

  if (!candidates.rows.length) return [];

  // Query line items to check for identical variants
  const currentLines = await sql<{ variant_id: string | null }>`
    select variant_id from orders.order_lines
    where organization_id = ${input.organizationId} and order_id = ${input.orderId} and line_status = 'ACTIVE'
  `.execute(db);
  const currentVariantIds = new Set(
    currentLines.rows.map((l) => l.variant_id).filter(Boolean) as string[],
  );

  const results: OrderDuplicateCandidate[] = [];

  for (const candidate of candidates.rows) {
    const reasons: string[] = [];
    if (candidate.normalized_phone === row.normalized_phone) {
      reasons.push('Identical customer phone number');
    }
    if (
      row.address_line_1 &&
      candidate.address_line_1 &&
      row.address_line_1.trim().toLowerCase() === candidate.address_line_1.trim().toLowerCase()
    ) {
      reasons.push('Identical delivery address line');
    }

    const candLines = await sql<{ variant_id: string | null }>`
      select variant_id from orders.order_lines
      where organization_id = ${input.organizationId} and order_id = ${candidate.id} and line_status = 'ACTIVE'
    `.execute(db);
    const candVariantIds = new Set(
      candLines.rows.map((l) => l.variant_id).filter(Boolean) as string[],
    );

    const hasSharedVariant = [...currentVariantIds].some((id) => candVariantIds.has(id));
    if (hasSharedVariant) {
      reasons.push('Contains identical product variant items');
    }

    const diffMinutes = Math.abs(
      Math.round((row.created_at.getTime() - candidate.created_at.getTime()) / 60000),
    );
    if (diffMinutes <= 30) {
      reasons.push(`Placed within ${diffMinutes} minutes of this order`);
    }

    if (reasons.length >= 2 || (hasSharedVariant && diffMinutes <= 120)) {
      results.push({
        orderId: candidate.id,
        orderNumber: candidate.order_number,
        orderStatus: candidate.order_status,
        createdAt: candidate.created_at.toISOString(),
        matchingReasons: reasons,
      });
    }
  }

  return results;
}

/**
 * Evaluates delivery risk for an order combining internal Maevelle history,
 * official Steadfast courier network parcel history, and duplicate detection.
 * Caches results in orders.order_delivery_risk_evaluations to avoid redundant provider calls.
 */
export async function evaluateOrderDeliveryRisk(
  db: Kysely<DatabaseSchema>,
  input: {
    readonly organizationId: string;
    readonly orderId: string;
    readonly forceRefresh?: boolean | undefined;
    readonly encryptionKey?: EncryptionKey | undefined;
    readonly fetchImpl?: typeof fetch | undefined;
  },
): Promise<OrderDeliveryRiskAssessment> {
  const orderInfo = await sql<{
    id: string;
    order_number: string;
    payment_method: string;
    total_amount: string;
    customer_id: string | null;
    normalized_phone: string;
  }>`
    select o.id, o.order_number, o.payment_method, o.total_amount::text, o.customer_id, snap.normalized_phone
    from orders.orders o
    join orders.order_customer_snapshots snap on snap.organization_id = o.organization_id and snap.order_id = o.id
    where o.organization_id = ${input.organizationId} and o.id = ${input.orderId}
  `.execute(db);

  const order = orderInfo.rows[0];
  if (!order) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');

  // 1. Check existing cache unless forceRefresh is true
  if (!input.forceRefresh) {
    const cached = await sql<{
      overall_risk_level: OrderRiskLevel;
      recommendation: OrderRecommendation;
      signals: OrderRiskSignal[];
      internal_history: CustomerDeliveryHistory;
      provider_history: {
        steadfast?: SteadfastFraudCheckResult;
        pathao: { available: false; reason: string };
      };
      duplicate_orders: OrderDuplicateCandidate[];
      evaluated_at: Date;
      expires_at: Date;
    }>`
      select overall_risk_level, recommendation, signals, internal_history, provider_history, duplicate_orders, evaluated_at, expires_at
      from orders.order_delivery_risk_evaluations
      where organization_id = ${input.organizationId}
        and order_id = ${input.orderId}
        and expires_at > now()
    `.execute(db);

    const c = cached.rows[0];
    if (c) {
      return {
        orderId: order.id,
        orderNumber: order.order_number,
        normalizedPhone: order.normalized_phone,
        overallRiskLevel: c.overall_risk_level,
        recommendation: c.recommendation,
        signals: c.signals,
        internalHistory: c.internal_history,
        providerHistory: c.provider_history,
        duplicateOrders: c.duplicate_orders,
        evaluatedAt: c.evaluated_at.toISOString(),
        expiresAt: c.expires_at.toISOString(),
        isFresh: true,
      };
    }
  }

  // 2. Compute internal Maevelle delivery history
  const internalHistory = await getCustomerDeliveryHistory(db, {
    organizationId: input.organizationId,
    orderId: input.orderId,
    phone: order.normalized_phone,
    ...(order.customer_id ? { customerId: order.customer_id } : {}),
  });

  // 3. Query Steadfast Courier Fraud Check if integration account is configured
  let steadfastResult: SteadfastFraudCheckResult | undefined;
  if (input.encryptionKey) {
    try {
      const sf = await getActiveSteadfastCredentials(
        db,
        input.organizationId,
        input.encryptionKey,
      );
      if (sf) {
        steadfastResult = await checkSteadfastCustomerFraud(
          sf.config,
          sf.credentials,
          order.normalized_phone,
          input.fetchImpl ?? fetch,
        );
      }
    } catch (err) {
      console.warn('Failed to query Steadfast fraud check:', err);
    }
  }

  const providerHistory = {
    ...(steadfastResult ? { steadfast: steadfastResult } : {}),
    pathao: {
      available: false as const,
      reason:
        'Pathao fraud check is merchant-panel only; no official developer API is currently documented.',
    },
  };

  // 4. Check for duplicate order candidates
  const duplicateOrders = await detectOrderDuplicates(db, {
    organizationId: input.organizationId,
    orderId: input.orderId,
  });

  // 5. Synthesize explainable signals
  const signals: OrderRiskSignal[] = [];

  // Internal history signals
  if (internalHistory.eligibleDeliveries >= 2 && (internalHistory.successRate ?? 0) >= 80) {
    signals.push({
      code: 'STEADY_INTERNAL_HISTORY',
      title: 'Strong Maevelle Delivery Track Record',
      severity: 'INFO',
      explanation: `Customer has successfully received ${internalHistory.deliveredCount} of ${internalHistory.eligibleDeliveries} previous orders (${internalHistory.successRate}% delivered).`,
    });
  } else if (internalHistory.rtoCount >= 2) {
    signals.push({
      code: 'REPEATED_INTERNAL_RTO',
      title: 'Repeated Internal RTOs',
      severity: 'CRITICAL',
      explanation: `${internalHistory.rtoCount} previous deliveries with Maevelle resulted in Return-To-Origin (RTO).`,
    });
  } else if (internalHistory.rtoCount === 1) {
    signals.push({
      code: 'PREVIOUS_INTERNAL_RTO',
      title: 'Previous RTO Recorded',
      severity: 'WARNING',
      explanation: `1 previous delivery with Maevelle resulted in Return-To-Origin (RTO).`,
    });
  } else if (internalHistory.eligibleDeliveries === 0) {
    signals.push({
      code: 'NEW_CUSTOMER_FIRST_TIME_COD',
      title: 'First-Time Customer',
      severity: 'LOW',
      explanation: 'No prior completed deliveries observed with Maevelle for this phone number.',
    });
  }

  if (internalHistory.customerReturnCount > 0) {
    signals.push({
      code: 'CUSTOMER_RETURNS_OBSERVED',
      title: 'Post-Delivery Customer Returns',
      severity: 'INFO',
      explanation: `Customer has initiated ${internalHistory.customerReturnCount} post-delivery return(s).`,
    });
  }

  // Steadfast courier network signals
  if (steadfastResult && steadfastResult.available) {
    if (steadfastResult.fraudReportsCount > 0) {
      signals.push({
        code: 'COURIER_FRAUD_REPORTS',
        title: 'Courier Network Fraud Reports',
        severity: 'CRITICAL',
        explanation: `${steadfastResult.fraudReportsCount} fraud report(s) logged in the courier network for this phone number.`,
      });
    }

    if (steadfastResult.totalParcels >= 3 && (steadfastResult.successRate ?? 0) >= 80) {
      signals.push({
        code: 'COURIER_NETWORK_PROVEN',
        title: 'Courier Network Verified History',
        severity: 'INFO',
        explanation: `Steadfast network records ${steadfastResult.deliveredCount} delivered out of ${steadfastResult.totalParcels} total parcels (${steadfastResult.successRate}% delivery rate).`,
      });
    } else if (
      steadfastResult.cancelledCount >= 2 &&
      steadfastResult.totalParcels > 0 &&
      steadfastResult.cancelledCount / steadfastResult.totalParcels >= 0.35
    ) {
      signals.push({
        code: 'COURIER_NETWORK_HIGH_CANCELLATIONS',
        title: 'Elevated Courier Network Cancellations',
        severity: 'WARNING',
        explanation: `Steadfast network records ${steadfastResult.cancelledCount} cancelled orders out of ${steadfastResult.totalParcels} total parcels (${Math.round((steadfastResult.cancelledCount / steadfastResult.totalParcels) * 100)}% cancellation rate).`,
      });
    }
  }

  // Duplicate order signals
  if (duplicateOrders.length > 0) {
    signals.push({
      code: 'POTENTIAL_DUPLICATE_ORDER',
      title: 'Potential Duplicate Order Detected',
      severity: 'WARNING',
      explanation: `Order ${duplicateOrders[0]!.orderNumber} was placed within 48 hours with matching recipient details (${duplicateOrders[0]!.matchingReasons.join(', ')}).`,
    });
  }

  // High total amount with first-time customer
  const totalAmountNum = Number(order.total_amount);
  if (totalAmountNum >= 6000 && internalHistory.eligibleDeliveries === 0) {
    signals.push({
      code: 'HIGH_VALUE_FIRST_ORDER',
      title: 'High-Value First Order',
      severity: 'LOW',
      explanation: `First-time COD order total is ৳${totalAmountNum.toLocaleString()}, exceeding standard initial checkout volume.`,
    });
  }

  // 6. Compute overall risk level and recommendation
  let overallRiskLevel: OrderRiskLevel = 'LOW';
  let recommendation: OrderRecommendation = 'APPROVE_COD';

  const hasCritical = signals.some((s) => s.severity === 'CRITICAL');
  const hasWarning = signals.some((s) => s.severity === 'WARNING');

  if (hasCritical) {
    overallRiskLevel = 'ELEVATED';
    recommendation =
      internalHistory.rtoCount >= 2 || (steadfastResult?.fraudReportsCount ?? 0) > 0
        ? 'REQUIRE_PREPAYMENT'
        : 'VERIFY_CUSTOMER';
  } else if (hasWarning || duplicateOrders.length > 0) {
    overallRiskLevel = 'MODERATE';
    recommendation = 'VERIFY_CUSTOMER';
  } else if (internalHistory.eligibleDeliveries < 2 && !steadfastResult?.available) {
    overallRiskLevel = 'INSUFFICIENT_HISTORY';
    recommendation = totalAmountNum > 4000 ? 'VERIFY_CUSTOMER' : 'APPROVE_COD';
  } else {
    overallRiskLevel = 'LOW';
    recommendation = 'APPROVE_COD';
  }

  const evaluatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  // 7. Persist evaluation cache in database
  await sql`
    insert into orders.order_delivery_risk_evaluations (
      order_id, organization_id, normalized_phone, overall_risk_level, recommendation,
      signals, internal_history, provider_history, duplicate_orders, evaluated_at, expires_at
    ) values (
      ${order.id}, ${input.organizationId}, ${order.normalized_phone}, ${overallRiskLevel}, ${recommendation},
      ${JSON.stringify(signals)}::jsonb,
      ${JSON.stringify(internalHistory)}::jsonb,
      ${JSON.stringify(providerHistory)}::jsonb,
      ${JSON.stringify(duplicateOrders)}::jsonb,
      ${evaluatedAt}::timestamptz,
      ${expiresAt}::timestamptz
    )
    on conflict (order_id) do update set
      overall_risk_level = excluded.overall_risk_level,
      recommendation = excluded.recommendation,
      signals = excluded.signals,
      internal_history = excluded.internal_history,
      provider_history = excluded.provider_history,
      duplicate_orders = excluded.duplicate_orders,
      evaluated_at = excluded.evaluated_at,
      expires_at = excluded.expires_at
  `.execute(db);

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    normalizedPhone: order.normalized_phone,
    overallRiskLevel,
    recommendation,
    signals,
    internalHistory,
    providerHistory,
    duplicateOrders,
    evaluatedAt,
    expiresAt,
    isFresh: true,
  };
}
