import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

export const storefrontEventNames = [
  'PRODUCT_VIEWED',
  'PRODUCT_LIST_VIEWED',
  'PRODUCT_SELECTED',
  'VARIANT_SELECTED',
  'SIZE_GUIDE_OPENED',
  'ADD_TO_CART',
  'REMOVE_FROM_CART',
  'VIEW_CART',
  'BEGIN_CHECKOUT',
  'ADD_SHIPPING_INFO',
  'ADD_PAYMENT_INFO',
  'ORDER_PLACED',
  'PAYMENT_CONFIRMED',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'REFUND_COMPLETED',
] as const;

export type StorefrontEventName = (typeof storefrontEventNames)[number];
export type ConsentDecision = 'GRANTED' | 'DENIED' | 'UNKNOWN';

export class AnalyticsIngestionError extends Error {
  public readonly code = 'INVALID_ANALYTICS_EVENT';
}

export interface StorefrontEventInput {
  readonly eventId: string;
  readonly schemaVersion: 1;
  readonly name: StorefrontEventName;
  readonly origin: 'BROWSER' | 'SERVER';
  readonly occurredAt: string;
  readonly sessionId?: string;
  readonly anonymousId?: string;
  readonly consent: {
    readonly analytics: ConsentDecision;
    readonly marketing: ConsentDecision;
  };
  readonly attribution?: {
    readonly source?: string;
    readonly medium?: string;
    readonly campaign?: string;
    readonly content?: string;
    readonly referrerOrigin?: string;
    readonly touch: 'FIRST' | 'SESSION' | 'LAST_NON_DIRECT';
  };
  readonly data: Record<string, unknown>;
}

export interface StorefrontEventReceipt {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: 'RECORDED' | 'DUPLICATE' | 'ANALYTICS_CONSENT_REQUIRED';
}

function trimmed(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const result = value.trim();
  return result ? result.slice(0, maximum) : undefined;
}

function eventItem(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const item = data.item;
  if (item && typeof item === 'object' && !Array.isArray(item))
    return item as Record<string, unknown>;
  const items = data.items;
  if (Array.isArray(items) && items[0] && typeof items[0] === 'object')
    return items[0] as Record<string, unknown>;
  return undefined;
}

function decimal(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{1,16}(?:\.\d{1,4})?$/.test(value)) return undefined;
  return value;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value: unknown, field: string): string | undefined {
  const result = trimmed(value, 36);
  if (result && !uuidPattern.test(result))
    throw new AnalyticsIngestionError(`${field} must be a UUID.`);
  return result;
}

function validateEventData(name: StorefrontEventName, data: Record<string, unknown>): void {
  const item = eventItem(data);
  const requiresItem = [
    'PRODUCT_VIEWED',
    'PRODUCT_SELECTED',
    'VARIANT_SELECTED',
    'ADD_TO_CART',
    'REMOVE_FROM_CART',
  ].includes(name);
  if (requiresItem && !item)
    throw new AnalyticsIngestionError(`${name} requires an item.`);
  if (item) {
    if (!uuid(item.productId, 'data.item.productId') || !uuid(item.skuId, 'data.item.skuId'))
      throw new AnalyticsIngestionError('Commerce items require productId and skuId.');
  }
  if (name === 'SIZE_GUIDE_OPENED' && !uuid(data.productId, 'data.productId'))
    throw new AnalyticsIngestionError('SIZE_GUIDE_OPENED requires productId.');
  if (name === 'PRODUCT_LIST_VIEWED') {
    if (!Array.isArray(data.items) || !trimmed(data.listId, 200))
      throw new AnalyticsIngestionError('PRODUCT_LIST_VIEWED requires listId and items.');
  }
  if (name.includes('CHECKOUT') || name === 'VIEW_CART' || name.startsWith('ADD_')) {
    if (!trimmed(data.cartId, 200) && name !== 'ADD_TO_CART')
      throw new AnalyticsIngestionError(`${name} requires cartId.`);
  }
  if (['ORDER_PLACED', 'PAYMENT_CONFIRMED', 'ORDER_DELIVERED', 'ORDER_CANCELLED', 'REFUND_COMPLETED'].includes(name))
    if (!uuid(data.orderId, 'data.orderId'))
      throw new AnalyticsIngestionError(`${name} requires orderId.`);
  const suppliedValue = data.value;
  if (suppliedValue !== undefined && !decimal(suppliedValue))
    throw new AnalyticsIngestionError('data.value must be a non-negative decimal string.');
  const suppliedCurrency = trimmed(data.currency, 3);
  if (suppliedCurrency && !/^[A-Za-z]{3}$/.test(suppliedCurrency))
    throw new AnalyticsIngestionError('data.currency must be an ISO 4217 code.');
}

/**
 * Records only explicitly consented browser observations. The unique event ID is
 * the retry/deduplication boundary; business conversions remain authoritative in
 * Orders, Payments, Delivery, and Refunds.
 */
export async function ingestStorefrontEvent(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: StorefrontEventInput,
): Promise<StorefrontEventReceipt> {
  if (input.origin === 'BROWSER' && input.consent.analytics !== 'GRANTED') {
    if (input.sessionId)
      await sql`update analytics.storefront_sessions set analytics_consent=${input.consent.analytics},marketing_consent=${input.consent.marketing},updated_at=now() where organization_id=${organizationId} and session_id=${input.sessionId}::uuid`.execute(
        db,
      );
    return { accepted: false, duplicate: false, reason: 'ANALYTICS_CONSENT_REQUIRED' };
  }
  if (!storefrontEventNames.includes(input.name))
    throw new AnalyticsIngestionError('Unsupported storefront analytics event.');
  if (input.origin === 'BROWSER' && !input.sessionId)
    throw new AnalyticsIngestionError('A browser analytics event requires a sessionId.');
  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.valueOf()) || occurredAt.valueOf() > Date.now() + 300_000)
    throw new AnalyticsIngestionError('occurredAt must be a valid time and cannot be in the future.');
  validateEventData(input.name, input.data);

  const item = eventItem(input.data);
  const orderId = uuid(input.data.orderId, 'data.orderId');
  const cartId = trimmed(input.data.cartId, 200);
  const productId = uuid(item?.productId ?? input.data.productId, 'data.productId');
  const variantId = uuid(item?.skuId, 'data.item.skuId');
  const currency = trimmed(input.data.currency ?? item?.currency, 3)?.toUpperCase();
  const value = decimal(input.data.value ?? item?.price);
  const items = input.data.items;
  const itemCount = Array.isArray(items)
    ? items.reduce(
        (total, candidate) =>
          total +
          (candidate && typeof candidate === 'object'
            ? Number((candidate as Record<string, unknown>).quantity ?? 1)
            : 0),
        0,
      )
    : item
      ? Number(item.quantity ?? 1)
      : undefined;
  const attribution = input.attribution;

  return db.transaction().execute(async (tx) => {
    if (input.sessionId) {
      await sql`
        insert into analytics.storefront_sessions(
          organization_id,session_id,anonymous_id,analytics_consent,marketing_consent,
          first_source,first_medium,first_campaign,first_content,first_referrer_origin,
          last_non_direct_source,last_non_direct_medium,last_non_direct_campaign,last_non_direct_content,
          started_at,last_seen_at,resulting_order_id
        ) values(
          ${organizationId},${input.sessionId}::uuid,${input.anonymousId ?? null}::uuid,
          ${input.consent.analytics},${input.consent.marketing},
          ${attribution?.source ?? null},${attribution?.medium ?? null},${attribution?.campaign ?? null},${attribution?.content ?? null},${attribution?.referrerOrigin ?? null},
          ${attribution?.touch === 'LAST_NON_DIRECT' ? attribution.source ?? null : null},
          ${attribution?.touch === 'LAST_NON_DIRECT' ? attribution.medium ?? null : null},
          ${attribution?.touch === 'LAST_NON_DIRECT' ? attribution.campaign ?? null : null},
          ${attribution?.touch === 'LAST_NON_DIRECT' ? attribution.content ?? null : null},
          ${input.occurredAt}::timestamptz,${input.occurredAt}::timestamptz,${orderId ?? null}::uuid
        )
        on conflict(organization_id,session_id) do update set
          anonymous_id=coalesce(analytics.storefront_sessions.anonymous_id,excluded.anonymous_id),
          analytics_consent=excluded.analytics_consent,marketing_consent=excluded.marketing_consent,
          first_source=coalesce(analytics.storefront_sessions.first_source,excluded.first_source),
          first_medium=coalesce(analytics.storefront_sessions.first_medium,excluded.first_medium),
          first_campaign=coalesce(analytics.storefront_sessions.first_campaign,excluded.first_campaign),
          first_content=coalesce(analytics.storefront_sessions.first_content,excluded.first_content),
          first_referrer_origin=coalesce(analytics.storefront_sessions.first_referrer_origin,excluded.first_referrer_origin),
          last_seen_at=greatest(analytics.storefront_sessions.last_seen_at,excluded.last_seen_at),
          last_non_direct_source=coalesce(excluded.last_non_direct_source,analytics.storefront_sessions.last_non_direct_source),
          last_non_direct_medium=coalesce(excluded.last_non_direct_medium,analytics.storefront_sessions.last_non_direct_medium),
          last_non_direct_campaign=coalesce(excluded.last_non_direct_campaign,analytics.storefront_sessions.last_non_direct_campaign),
          last_non_direct_content=coalesce(excluded.last_non_direct_content,analytics.storefront_sessions.last_non_direct_content),
          resulting_order_id=coalesce(excluded.resulting_order_id,analytics.storefront_sessions.resulting_order_id),updated_at=now()
      `.execute(tx);
    }

    const inserted = await sql<{ event_id: string }>`
      insert into analytics.storefront_events(
        organization_id,event_id,schema_version,event_name,origin,session_id,anonymous_id,order_id,
        product_id,variant_id,cart_id,currency_code,monetary_value,item_count,source,medium,campaign,content,
        referrer_origin,touch,analytics_consent,marketing_consent,payload,occurred_at
      ) values(
        ${organizationId},${input.eventId}::uuid,${input.schemaVersion},${input.name},${input.origin},
        ${input.sessionId ?? null}::uuid,${input.anonymousId ?? null}::uuid,${orderId ?? null}::uuid,
        ${productId ?? null}::uuid,${variantId ?? null}::uuid,${cartId ?? null},${currency ?? null},${value ?? null}::numeric,
        ${Number.isFinite(itemCount) ? itemCount : null},${attribution?.source ?? null},${attribution?.medium ?? null},
        ${attribution?.campaign ?? null},${attribution?.content ?? null},${attribution?.referrerOrigin ?? null},
        ${attribution?.touch ?? null},${input.consent.analytics},${input.consent.marketing},${JSON.stringify(input.data)}::jsonb,
        ${input.occurredAt}::timestamptz
      ) on conflict(organization_id,event_id) do nothing returning event_id::text
    `.execute(tx);
    return inserted.rows.length
      ? { accepted: true, duplicate: false, reason: 'RECORDED' }
      : { accepted: true, duplicate: true, reason: 'DUPLICATE' };
  });
}
