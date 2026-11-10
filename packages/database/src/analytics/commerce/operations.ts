import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../../index.js';

export const commerceOperations = [
  'QUOTE',
  'FINAL_TERMS',
  'PLACEMENT',
  'PAYMENT_READ',
  'CLAIM_SUBMIT',
] as const;
export type CommerceOperation = (typeof commerceOperations)[number];
export type CommerceOutcome =
  | 'REVIEW_REQUIRED'
  | 'SUCCESS'
  | 'POLICY_BLOCKED'
  | 'SOURCE_CONFLICT'
  | 'PAYMENT_METHOD_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'CLIENT_ERROR'
  | 'SERVER_ERROR';

export function commerceOutcome(status: number, code?: string): CommerceOutcome {
  if (status < 400) return 'SUCCESS';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  if (code === 'REVIEW_REQUIRED') return 'REVIEW_REQUIRED';
  if (code === 'POLICY_BLOCKED') return 'POLICY_BLOCKED';
  if (
    [
      'SOURCE_CONFLICT',
      'SOURCE_CHANGED',
      'STALE_SOURCE',
      'STALE_VERSION',
      'STALE_REVISION',
    ].includes(code ?? '')
  )
    return 'SOURCE_CONFLICT';
  if (code === 'PAYMENT_METHOD_UNAVAILABLE' || code === 'DESTINATION_UNAVAILABLE')
    return 'PAYMENT_METHOD_UNAVAILABLE';
  return 'CLIENT_ERROR';
}

export async function recordCommerceOperation(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  operation: CommerceOperation,
  outcome: CommerceOutcome,
  durationMs: number,
) {
  if (
    !commerceOperations.includes(operation) ||
    ![
      'SUCCESS',
      'REVIEW_REQUIRED',
      'POLICY_BLOCKED',
      'SOURCE_CONFLICT',
      'PAYMENT_METHOD_UNAVAILABLE',
      'RATE_LIMITED',
      'CLIENT_ERROR',
      'SERVER_ERROR',
    ].includes(outcome) ||
    !Number.isFinite(durationMs)
  )
    throw new Error('Invalid commerce diagnostic');
  const duration = Math.min(600_000, Math.max(0, Math.round(durationMs)));
  await sql`insert into analytics.commerce_operations(organization_id,day,traffic_class,operation,outcome,count,duration_ms,max_duration_ms)
    select ${organizationId},(clock_timestamp() at time zone 'UTC')::date,coalesce((select traffic_class from analytics.commerce_reporting_scopes where organization_id=${organizationId}),'UNCLASSIFIED'),${operation},${outcome},1,${duration},${duration}
    on conflict(organization_id,day,traffic_class,operation,outcome) do update set count=commerce_operations.count+1,
      duration_ms=commerce_operations.duration_ms+excluded.duration_ms,max_duration_ms=greatest(commerce_operations.max_duration_ms,excluded.max_duration_ms)`.execute(
    db,
  );
}
