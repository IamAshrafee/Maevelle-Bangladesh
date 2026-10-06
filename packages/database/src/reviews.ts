import { createHash, randomBytes } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from './index.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';

export class ReviewDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
    this.name = 'ReviewDomainError';
  }
}

export const REJECTION_REASONS = [
  'SPAM',
  'DUPLICATE',
  'IRRELEVANT',
  'ABUSIVE_OR_THREATENING',
  'PERSONAL_INFORMATION',
  'UNSAFE_MEDIA',
  'FRAUD_SUSPECTED',
  'PROHIBITED_CONTENT',
  'OTHER',
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Sanitizes user-provided review text by stripping control characters and unsafe markup.
 * Preserves standard Bangla, English, numerals, and punctuation.
 */
export function sanitizeReviewText(text: string | null | undefined, maxLength: number): string | null {
  if (!text) return null;
  const normalized = text
    .normalize('NFC')
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replaceAll(/<[^>]*>/g, '') // Strip HTML tags
    .trim();
  if (normalized.length === 0) return null;
  return normalized.slice(0, maxLength);
}

/**
 * Formats a privacy-preserving author name for public storefront display.
 * E.g., "Nusrat Jahan" -> "Nusrat J.", "Ashrafee" -> "Ashrafee", null -> "Verified customer".
 */
export function formatSafeAuthorName(displayName: string | null | undefined): string {
  if (!displayName?.trim()) return 'Verified customer';
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Verified customer';
  if (parts.length === 1) return parts[0]!;
  const firstName = parts[0]!;
  const lastInitial = parts[parts.length - 1]!.charAt(0).toUpperCase();
  return `${firstName} ${lastInitial}.`;
}

/**
 * Derives a human-readable variant label from an order line's option snapshot or SKU.
 */
function formatVariantLabel(optionSnapshot: unknown, skuSnapshot?: string | null): string | null {
  if (Array.isArray(optionSnapshot) && optionSnapshot.length > 0) {
    const parts = optionSnapshot
      .map((opt) => (typeof opt === 'object' && opt !== null && 'value' in opt ? String(opt.value) : ''))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' / ');
  }
  return skuSnapshot ?? null;
}

export async function authorizeReviewMediaUpload(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; accessToken: string; enforceUploadLimit?: boolean },
): Promise<{ guestOwnerHash: string; productId: string }> {
  const guestOwnerHash = hash(input.accessToken);
  const access = await sql<{ product_id: string }>`
    select product_id::text from reviews.review_access_tokens
    where organization_id = ${input.organizationId} and token_hash = ${guestOwnerHash}
      and revoked_at is null and (expires_at is null or expires_at > now())
  `.execute(db);
  const row = access.rows[0];
  if (!row) {
    throw new ReviewDomainError('FORBIDDEN', 'Review access credential is invalid or expired.');
  }
  if (input.enforceUploadLimit) {
    const uploads = await sql<{ count: number }>`
      select count(*)::int count from media.media_assets
      where organization_id = ${input.organizationId} and guest_owner_hash = ${guestOwnerHash}
        and upload_source = 'CUSTOMER_REVIEW' and status <> 'TRASHED'
    `.execute(db);
    if ((uploads.rows[0]?.count ?? 0) >= 5) {
      throw new ReviewDomainError('VALIDATION_FAILED', 'A Review can include at most 5 images.');
    }
  }
  return { guestOwnerHash, productId: row.product_id };
}

async function attachOwnedReviewMedia(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    accessToken: string;
    revisionId: string;
    mediaAssetIds?: string[];
  },
): Promise<void> {
  const assetIds = input.mediaAssetIds ?? [];
  if (assetIds.length > 5 || new Set(assetIds).size !== assetIds.length) {
    throw new ReviewDomainError('VALIDATION_FAILED', 'A Review can include up to 5 distinct media attachments.');
  }
  const guestOwnerHash = hash(input.accessToken);
  for (let i = 0; i < assetIds.length; i++) {
    const assetId = assetIds[i]!;
    const inserted = await sql<{ id: string; asset_type: string }>`
      insert into reviews.review_media(
        organization_id, review_revision_id, media_asset_id, media_type, position
      )
      select
        ${input.organizationId},
        ${input.revisionId}::uuid,
        asset.id,
        case when asset.asset_type = 'DOCUMENT' then 'IMAGE' else asset.asset_type end,
        ${i}
      from media.media_assets asset
      where asset.organization_id = ${input.organizationId}
        and asset.id = ${assetId}::uuid
        and asset.status in ('READY', 'PROCESSING')
        and asset.upload_source = 'CUSTOMER_REVIEW'
        and asset.guest_owner_hash = ${guestOwnerHash}
      returning id::text, media_type
    `.execute(db);
    if (!inserted.rows[0]) {
      throw new ReviewDomainError(
        'FORBIDDEN',
        'Review media is unavailable, unfinished, or belongs to another Review session.',
      );
    }
    await sql`
      insert into media.media_usage_projection(
        organization_id, asset_id, domain, usage_type, entity_id, relationship_id, label
      ) values (
        ${input.organizationId}, ${assetId}, 'reviews', 'REVIEW_MEDIA',
        ${input.revisionId}, ${inserted.rows[0].id}, 'Customer Review media'
      ) on conflict do nothing
    `.execute(db);
    await sql`
      insert into media.media_usage_history(
        organization_id, asset_id, action, domain, usage_type, entity_id, relationship_id
      ) values (
        ${input.organizationId}, ${assetId}, 'ATTACHED', 'reviews', 'REVIEW_MEDIA',
        ${input.revisionId}, ${inserted.rows[0].id}
      )
    `.execute(db);
  }
}

async function claim(db: Kysely<DatabaseSchema>, org: string, key: string, body: unknown) {
  try {
    return await claimIdempotencyRecord(db, {
      organizationId: org,
      principalType: 'GUEST_REVIEW',
      operationType: 'reviews.submit',
      idempotencyKey: key,
      requestFingerprint: JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof IdempotencyKeyReuseError) throw new ReviewDomainError('CONFLICT', e.message);
    throw e;
  }
}

/**
 * Authoritative rating summary rebuild from eligible published reviews.
 * Invariant REV-INV-017: Summary is a projection rebuilt from approved, visible, active reviews.
 */
async function rebuild(db: Kysely<DatabaseSchema>, org: string, productId: string) {
  await sql`
    insert into reviews.product_rating_summary (
      organization_id, product_id,
      rating_count, rating_sum,
      rating_1_count, rating_2_count, rating_3_count, rating_4_count, rating_5_count,
      text_review_count, media_review_count, verified_review_count,
      updated_at
    )
    select
      ${org},
      ${productId}::uuid,
      count(*)::int as rating_count,
      coalesce(sum(revision.rating), 0)::int as rating_sum,
      count(*) filter (where revision.rating = 1)::int as rating_1_count,
      count(*) filter (where revision.rating = 2)::int as rating_2_count,
      count(*) filter (where revision.rating = 3)::int as rating_3_count,
      count(*) filter (where revision.rating = 4)::int as rating_4_count,
      count(*) filter (where revision.rating = 5)::int as rating_5_count,
      count(*) filter (where revision.body is not null and length(trim(revision.body)) > 0)::int as text_review_count,
      count(*) filter (
        where exists (
          select 1 from reviews.review_media rm
          join media.media_assets a on a.id = rm.media_asset_id
          where rm.review_revision_id = revision.id
            and a.status in ('READY', 'ARCHIVED')
            and a.visibility_class = 'PUBLIC'
        )
      )::int as media_review_count,
      count(*) filter (where review.verification_order_line_id is not null)::int as verified_review_count,
      now()
    from reviews.reviews review
    join reviews.review_revisions revision on revision.id = review.published_revision_id
    where review.organization_id = ${org}
      and review.product_id = ${productId}::uuid
      and review.lifecycle_status = 'ACTIVE'
      and review.visibility_status = 'VISIBLE'
      and revision.moderation_status = 'APPROVED'
    on conflict (organization_id, product_id) do update set
      rating_count = excluded.rating_count,
      rating_sum = excluded.rating_sum,
      rating_1_count = excluded.rating_1_count,
      rating_2_count = excluded.rating_2_count,
      rating_3_count = excluded.rating_3_count,
      rating_4_count = excluded.rating_4_count,
      rating_5_count = excluded.rating_5_count,
      text_review_count = excluded.text_review_count,
      media_review_count = excluded.media_review_count,
      verified_review_count = excluded.verified_review_count,
      updated_at = now()
  `.execute(db);
}

/**
 * Verifies if an order line or customer is eligible to submit a review for a product.
 * Returns eligibility fact, order context, variant snapshot, and any existing review ID.
 */
export async function checkReviewEligibility(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    orderLineId?: string | undefined;
    accessToken?: string | undefined;
    customerId?: string | undefined;
    productId?: string | undefined;
  },
): Promise<{
  eligible: boolean;
  reason?: string;
  existingReviewId?: string;
  orderLineId?: string;
  orderId?: string;
  orderNumber?: string;
  productId?: string;
  productTitle?: string;
  variantId?: string | null;
  variantLabel?: string | null;
  customerId?: string;
}> {
  let resolvedCustomerId = input.customerId;
  let resolvedOrderLineId = input.orderLineId;
  let resolvedProductId = input.productId;

  if (input.accessToken) {
    const tokenRow = await sql<{
      customer_id: string;
      order_line_id: string;
      product_id: string;
      used_at: string | null;
      revoked_at: string | null;
      expires_at: string | null;
    }>`
      select customer_id::text, order_line_id::text, product_id::text,
        used_at::text, revoked_at::text, expires_at::text
      from reviews.review_access_tokens
      where organization_id = ${input.organizationId}
        and token_hash = ${hash(input.accessToken)}
    `.execute(db);
    const token = tokenRow.rows[0];
    if (!token) return { eligible: false, reason: 'INVALID_TOKEN' };
    if (token.revoked_at) return { eligible: false, reason: 'REVOKED_TOKEN' };
    if (token.expires_at && new Date(token.expires_at) <= new Date()) {
      return { eligible: false, reason: 'EXPIRED_TOKEN' };
    }
    resolvedCustomerId = token.customer_id;
    resolvedOrderLineId = token.order_line_id;
    resolvedProductId = token.product_id;
  }

  if (resolvedOrderLineId) {
    const lineRow = await sql<{
      customer_id: string;
      product_id: string;
      order_id: string;
      order_number: string;
      product_title: string;
      variant_id: string | null;
      sku_snapshot: string | null;
      option_snapshot: unknown;
      fulfillment_status: string | null;
      delivery_outcome: string | null;
      order_status: string;
    }>`
      select
        o.customer_id::text,
        l.product_id::text,
        o.id::text as order_id,
        o.order_number,
        coalesce(l.product_title_snapshot, p.title) as product_title,
        l.variant_id::text,
        l.sku_snapshot,
        l.option_snapshot,
        f.status as fulfillment_status,
        d.outcome_status as delivery_outcome,
        o.order_status as order_status
      from orders.order_lines l
      join orders.orders o on o.id = l.order_id and o.organization_id = l.organization_id
      left join catalog.products p on p.id = l.product_id and p.organization_id = l.organization_id
      left join fulfillment.fulfillment_lines fl on fl.order_line_id = l.id and fl.organization_id = l.organization_id
      left join fulfillment.fulfillments f on f.id = fl.fulfillment_id and f.organization_id = l.organization_id
      left join delivery.deliveries d on d.fulfillment_id = f.id and d.organization_id = l.organization_id
      where l.organization_id = ${input.organizationId}
        and l.id = ${resolvedOrderLineId}::uuid
      limit 1
    `.execute(db);
    const line = lineRow.rows[0];
    if (!line) return { eligible: false, reason: 'ORDER_LINE_NOT_FOUND' };
    if (line.order_status === 'CANCELLED') {
      return { eligible: false, reason: 'ORDER_CANCELLED' };
    }

    const isQualified =
      line.delivery_outcome === 'DELIVERED' ||
      line.fulfillment_status === 'DISPATCHED';

    if (!isQualified) {
      return { eligible: false, reason: 'NOT_DELIVERED' };
    }

    resolvedCustomerId = line.customer_id;
    resolvedProductId = line.product_id;

    // Check duplicate active review
    const existing = await sql<{ id: string }>`
      select id::text from reviews.reviews
      where organization_id = ${input.organizationId}
        and customer_id = ${resolvedCustomerId}::uuid
        and product_id = ${resolvedProductId}::uuid
        and lifecycle_status = 'ACTIVE'
      limit 1
    `.execute(db);
    if (existing.rows[0]) {
      return {
        eligible: false,
        reason: 'ALREADY_REVIEWED',
        existingReviewId: existing.rows[0].id,
        orderLineId: resolvedOrderLineId,
        orderId: line.order_id,
        orderNumber: line.order_number,
        productId: resolvedProductId,
        productTitle: line.product_title,
        variantId: line.variant_id,
        variantLabel: formatVariantLabel(line.option_snapshot, line.sku_snapshot),
        customerId: resolvedCustomerId,
      };
    }

    return {
      eligible: true,
      orderLineId: resolvedOrderLineId,
      orderId: line.order_id,
      orderNumber: line.order_number,
      productId: resolvedProductId,
      productTitle: line.product_title,
      variantId: line.variant_id,
      variantLabel: formatVariantLabel(line.option_snapshot, line.sku_snapshot),
      customerId: resolvedCustomerId,
    };
  }

  if (resolvedCustomerId && resolvedProductId) {
    const existing = await sql<{ id: string }>`
      select id::text from reviews.reviews
      where organization_id = ${input.organizationId}
        and customer_id = ${resolvedCustomerId}::uuid
        and product_id = ${resolvedProductId}::uuid
        and lifecycle_status = 'ACTIVE'
      limit 1
    `.execute(db);
    if (existing.rows[0]) {
      return {
        eligible: false,
        reason: 'ALREADY_REVIEWED',
        existingReviewId: existing.rows[0].id,
      };
    }

    // Check if customer has any qualifying order line for this product
    const qualifying = await sql<{
      order_line_id: string;
      order_id: string;
      order_number: string;
      product_title: string;
      variant_id: string | null;
      sku_snapshot: string | null;
      option_snapshot: unknown;
    }>`
      select
        l.id::text as order_line_id,
        o.id::text as order_id,
        o.order_number,
        coalesce(l.product_title_snapshot, p.title) as product_title,
        l.variant_id::text,
        l.sku_snapshot,
        l.option_snapshot
      from orders.order_lines l
      join orders.orders o on o.id = l.order_id and o.organization_id = l.organization_id
      left join catalog.products p on p.id = l.product_id and p.organization_id = l.organization_id
      left join fulfillment.fulfillment_lines fl on fl.order_line_id = l.id and fl.organization_id = l.organization_id
      left join fulfillment.fulfillments f on f.id = fl.fulfillment_id and f.organization_id = l.organization_id
      left join delivery.deliveries d on d.fulfillment_id = f.id and d.organization_id = l.organization_id
      where l.organization_id = ${input.organizationId}
        and o.customer_id = ${resolvedCustomerId}::uuid
        and l.product_id = ${resolvedProductId}::uuid
        and o.order_status <> 'CANCELLED'
        and (f.status = 'DISPATCHED' or d.outcome_status = 'DELIVERED')
      order by o.created_at desc
      limit 1
    `.execute(db);
    const row = qualifying.rows[0];
    if (!row) {
      return { eligible: false, reason: 'NO_QUALIFYING_PURCHASE' };
    }
    return {
      eligible: true,
      orderLineId: row.order_line_id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      productId: resolvedProductId,
      productTitle: row.product_title,
      variantId: row.variant_id,
      variantLabel: formatVariantLabel(row.option_snapshot, row.sku_snapshot),
      customerId: resolvedCustomerId,
    };
  }

  return { eligible: false, reason: 'INSUFFICIENT_CRITERIA' };
}

/**
 * Creates or retrieves a scoped secure review access token and invitation for an eligible order line.
 */
export async function createReviewAccess(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    orderLineId: string;
    channel?: 'EMAIL' | 'SMS' | 'MANUAL';
  },
): Promise<{ token: string; productId: string; customerId: string; expiresAt: string }> {
  const eligibility = await checkReviewEligibility(db, {
    organizationId: input.organizationId,
    orderLineId: input.orderLineId,
  });
  if (!eligibility.eligible) {
    throw new ReviewDomainError(
      eligibility.reason === 'ALREADY_REVIEWED' ? 'CONFLICT' : 'NOT_FOUND',
      eligibility.reason === 'ALREADY_REVIEWED'
        ? 'Customer has already submitted an active Review for this Product.'
        : 'No fulfilled purchase is currently eligible for a Review.',
    );
  }

  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hash(rawToken);

  const inserted = await sql<{
    expires_at: string;
  }>`
    insert into reviews.review_access_tokens (
      organization_id, customer_id, order_line_id, product_id,
      token_hash, expires_at, invitation_sent_at, invitation_channel
    ) values (
      ${input.organizationId},
      ${eligibility.customerId!}::uuid,
      ${input.orderLineId}::uuid,
      ${eligibility.productId!}::uuid,
      ${tokenHash},
      now() + interval '30 days',
      now(),
      ${input.channel ?? 'MANUAL'}
    )
    returning expires_at::text
  `.execute(db);

  return {
    token: rawToken,
    productId: eligibility.productId!,
    customerId: eligibility.customerId!,
    expiresAt: inserted.rows[0]!.expires_at,
  };
}

/**
 * Customer submits a new Review for a Product tied to their verified purchase.
 * Idempotent: safe against double-click retries.
 */
export async function submitReview(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    accessToken: string;
    rating: number;
    title?: string | undefined;
    body?: string | undefined;
    publicDisplayName?: string | undefined;
    customDisplayName?: string | undefined;
    mediaAssetIds?: string[] | undefined;
    idempotencyKey: string;
  },
): Promise<{ id: string; revisionId: string }> {
  return db.transaction().execute(async (tx) => {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new ReviewDomainError('VALIDATION_FAILED', 'Rating must be an integer from 1 to 5.');
    }

    const tokenRow = await sql<{
      customer_id: string;
      product_id: string;
      order_line_id: string;
    }>`
      select customer_id::text, product_id::text, order_line_id::text
      from reviews.review_access_tokens
      where organization_id = ${input.organizationId}
        and token_hash = ${hash(input.accessToken)}
        and revoked_at is null
        and (expires_at is null or expires_at > now())
      for update
    `.execute(tx);
    const token = tokenRow.rows[0];
    if (!token) {
      throw new ReviewDomainError('FORBIDDEN', 'Review access credential is invalid or expired.');
    }

    const claimed = await claim(tx, input.organizationId, input.idempotencyKey, {
      organizationId: input.organizationId,
      rating: input.rating,
      title: input.title,
      body: input.body,
      mediaAssetIds: input.mediaAssetIds,
      tokenFingerprint: hash(input.accessToken).slice(0, 16),
    });
    if (!claimed.created) {
      throw new ReviewDomainError('CONFLICT', 'Review submission already processed.');
    }

    // Verify at most one active review
    const duplicate = await sql<{ id: string }>`
      select id::text from reviews.reviews
      where organization_id = ${input.organizationId}
        and customer_id = ${token.customer_id}::uuid
        and product_id = ${token.product_id}::uuid
        and lifecycle_status = 'ACTIVE'
      for update
    `.execute(tx);
    if (duplicate.rows[0]) {
      throw new ReviewDomainError(
        'CONFLICT',
        'Customer already has an active Review for this Product.',
      );
    }

    // Retrieve order line variant snapshot
    const lineRow = await sql<{
      variant_id: string | null;
      sku_snapshot: string | null;
      option_snapshot: unknown;
    }>`
      select variant_id::text, sku_snapshot, option_snapshot
      from orders.order_lines
      where organization_id = ${input.organizationId}
        and id = ${token.order_line_id}::uuid
    `.execute(tx);
    const line = lineRow.rows[0];
    const variantLabel = line ? formatVariantLabel(line.option_snapshot, line.sku_snapshot) : null;

    // Resolve safe public author display name
    let displayName = sanitizeReviewText(input.publicDisplayName, 50);
    if (!displayName) {
      const customer = await sql<{ display_name: string | null }>`
        select display_name from customers.customers
        where organization_id = ${input.organizationId} and id = ${token.customer_id}::uuid
      `.execute(tx);
      displayName = formatSafeAuthorName(customer.rows[0]?.display_name);
    }

    const sanitizedTitle = sanitizeReviewText(input.title, 160);
    const sanitizedBody = sanitizeReviewText(input.body, 5000);

    const review = await sql<{ id: string }>`
      insert into reviews.reviews (
        organization_id, product_id, customer_id, verification_order_line_id,
        purchased_variant_id, purchased_variant_label, source,
        lifecycle_status, visibility_status
      ) values (
        ${input.organizationId},
        ${token.product_id}::uuid,
        ${token.customer_id}::uuid,
        ${token.order_line_id}::uuid,
        ${line?.variant_id ? sql`${line.variant_id}::uuid` : null},
        ${variantLabel},
        'CUSTOMER',
        'ACTIVE',
        'HIDDEN'
      )
      returning id::text
    `.execute(tx);
    const id = review.rows[0]?.id;
    if (!id) throw new Error('Review record could not be created.');

    const revision = await sql<{ id: string }>`
      insert into reviews.review_revisions (
        organization_id, review_id, revision_number,
        rating, title, body, public_display_name,
        moderation_status
      ) values (
        ${input.organizationId},
        ${id}::uuid,
        1,
        ${input.rating},
        ${sanitizedTitle},
        ${sanitizedBody},
        ${displayName},
        'PENDING'
      )
      returning id::text
    `.execute(tx);
    const revisionId = revision.rows[0]?.id;
    if (!revisionId) throw new Error('Review revision could not be created.');

    await attachOwnedReviewMedia(tx, {
      organizationId: input.organizationId,
      accessToken: input.accessToken,
      revisionId,
      ...(input.mediaAssetIds ? { mediaAssetIds: input.mediaAssetIds } : {}),
    });

    // Mark token as consumed
    await sql`
      update reviews.review_access_tokens
      set used_at = now()
      where organization_id = ${input.organizationId}
        and token_hash = ${hash(input.accessToken)}
    `.execute(tx);

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'reviews.review.submitted', 1, 'reviews.review',
        ${id}::uuid, 1, ${JSON.stringify({ reviewId: id, revisionId, productId: token.product_id })}::jsonb, now()
      )
    `.execute(tx);

    return { id, revisionId };
  });
}

/**
 * Customer edits their existing Review. Creates a new pending revision.
 * Invariant REV-INV-019: Previously approved revision remains public until this revision is approved.
 */
export async function submitReviewRevision(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    accessToken: string;
    rating: number;
    title?: string | undefined;
    body?: string | undefined;
    publicDisplayName?: string | undefined;
    customDisplayName?: string | undefined;
    mediaAssetIds?: string[] | undefined;
  },
): Promise<{ reviewId: string; revisionId: string }> {
  return db.transaction().execute(async (tx) => {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new ReviewDomainError('VALIDATION_FAILED', 'Rating must be an integer from 1 to 5.');
    }

    const tokenRow = await sql<{
      customer_id: string;
      product_id: string;
    }>`
      select customer_id::text, product_id::text
      from reviews.review_access_tokens
      where organization_id = ${input.organizationId}
        and token_hash = ${hash(input.accessToken)}
        and revoked_at is null
        and (expires_at is null or expires_at > now())
      for update
    `.execute(tx);
    const token = tokenRow.rows[0];
    if (!token) {
      throw new ReviewDomainError('FORBIDDEN', 'Review access credential is invalid or expired.');
    }

    const review = await sql<{
      id: string;
      version: number;
    }>`
      select id::text, version::int
      from reviews.reviews
      where organization_id = ${input.organizationId}
        and customer_id = ${token.customer_id}::uuid
        and product_id = ${token.product_id}::uuid
        and lifecycle_status = 'ACTIVE'
      for update
    `.execute(tx);
    const current = review.rows[0];
    if (!current) {
      throw new ReviewDomainError('NOT_FOUND', 'No active Review is available to revise.');
    }

    const maxRev = await sql<{ max_rev: number }>`
      select coalesce(max(revision_number), 0)::int as max_rev
      from reviews.review_revisions
      where organization_id = ${input.organizationId} and review_id = ${current.id}::uuid
    `.execute(tx);
    const nextRevisionNumber = (maxRev.rows[0]?.max_rev ?? 0) + 1;

    let displayName = sanitizeReviewText(input.publicDisplayName, 50);
    if (!displayName) {
      const customer = await sql<{ display_name: string | null }>`
        select display_name from customers.customers
        where organization_id = ${input.organizationId} and id = ${token.customer_id}::uuid
      `.execute(tx);
      displayName = formatSafeAuthorName(customer.rows[0]?.display_name);
    }

    const sanitizedTitle = sanitizeReviewText(input.title, 160);
    const sanitizedBody = sanitizeReviewText(input.body, 5000);

    const revision = await sql<{ id: string }>`
      insert into reviews.review_revisions (
        organization_id, review_id, revision_number,
        rating, title, body, public_display_name,
        moderation_status
      ) values (
        ${input.organizationId},
        ${current.id}::uuid,
        ${nextRevisionNumber},
        ${input.rating},
        ${sanitizedTitle},
        ${sanitizedBody},
        ${displayName},
        'PENDING'
      )
      returning id::text
    `.execute(tx);
    const revisionId = revision.rows[0]?.id;
    if (!revisionId) throw new Error('Review revision could not be created.');

    await attachOwnedReviewMedia(tx, {
      organizationId: input.organizationId,
      accessToken: input.accessToken,
      revisionId,
      ...(input.mediaAssetIds ? { mediaAssetIds: input.mediaAssetIds } : {}),
    });

    await sql`
      update reviews.reviews
      set updated_at = now(), version = version + 1
      where organization_id = ${input.organizationId} and id = ${current.id}::uuid
    `.execute(tx);

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'reviews.review.revision_submitted', 1, 'reviews.review',
        ${current.id}::uuid, ${nextRevisionNumber},
        ${JSON.stringify({ reviewId: current.id, revisionId, productId: token.product_id })}::jsonb,
        now()
      )
    `.execute(tx);

    return { reviewId: current.id, revisionId };
  });
}

/**
 * Customer or operator withdraws/removes their active review.
 * Invariant REV-INV-015: Removed reviews immediately stop contributing to rating aggregates.
 */
export async function withdrawReview(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    reviewId: string;
    actorId?: string | undefined;
    accessToken?: string | undefined;
    reason?: string | undefined;
  },
): Promise<{ reviewId: string }> {
  return db.transaction().execute(async (tx) => {
    let authorized = false;

    if (input.accessToken) {
      const token = await sql<{ customer_id: string; product_id: string }>`
        select customer_id::text, product_id::text
        from reviews.review_access_tokens
        where organization_id = ${input.organizationId}
          and token_hash = ${hash(input.accessToken)}
          and revoked_at is null
      `.execute(tx);
      if (token.rows[0]) {
        const match = await sql<{ id: string }>`
          select id::text from reviews.reviews
          where organization_id = ${input.organizationId}
            and id = ${input.reviewId}::uuid
            and customer_id = ${token.rows[0].customer_id}::uuid
            and product_id = ${token.rows[0].product_id}::uuid
        `.execute(tx);
        if (match.rows[0]) authorized = true;
      }
    } else if (input.actorId) {
      authorized = true;
    }

    if (!authorized) {
      throw new ReviewDomainError('FORBIDDEN', 'Not authorized to withdraw this Review.');
    }

    const review = await sql<{ product_id: string }>`
      update reviews.reviews
      set lifecycle_status = 'REMOVED',
          visibility_status = 'HIDDEN',
          withdrawn_at = now(),
          updated_at = now(),
          version = version + 1
      where organization_id = ${input.organizationId}
        and id = ${input.reviewId}::uuid
        and lifecycle_status = 'ACTIVE'
      returning product_id::text
    `.execute(tx);
    const row = review.rows[0];
    if (!row) throw new ReviewDomainError('NOT_FOUND', 'Active Review was not found.');

    await rebuild(tx, input.organizationId, row.product_id);

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: input.actorId ? 'USER' : 'SYSTEM',
      actorId: input.actorId ?? 'system',
      action: 'reviews.review.withdrawn',
      targetType: 'reviews.review',
      targetId: input.reviewId,
      ...(input.reason ? { reason: input.reason } : {}),
    });

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'reviews.review.removed', 1, 'reviews.review',
        ${input.reviewId}::uuid, 1,
        ${JSON.stringify({ reviewId: input.reviewId, productId: row.product_id })}::jsonb,
        now()
      )
    `.execute(tx);

    return { reviewId: input.reviewId };
  });
}

/**
 * Moderates a review revision or toggles review publication visibility.
 * Invariant REV-INV-025: Negative sentiment alone is never a valid moderation reason.
 */
export async function moderateReview(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    reviewId: string;
    revisionId: string;
    decision: 'APPROVE' | 'REJECT' | 'HIDE' | 'RESTORE';
    reason?: string | undefined;
    internalNote?: string | undefined;
  },
): Promise<{ reviewId: string }> {
  return db.transaction().execute(async (tx) => {
    if (input.reason === 'NEGATIVE_REVIEW') {
      throw new ReviewDomainError(
        'VALIDATION_FAILED',
        'Negative sentiment is never a moderation rejection reason.',
      );
    }

    const reviewRow = await sql<{ product_id: string }>`
      select product_id::text from reviews.reviews
      where organization_id = ${input.organizationId} and id = ${input.reviewId}::uuid
      for update
    `.execute(tx);
    const review = reviewRow.rows[0];
    if (!review) throw new ReviewDomainError('NOT_FOUND', 'Review was not found.');

    if (input.decision === 'APPROVE') {
      const changed = await sql<{ id: string }>`
        update reviews.review_revisions
        set moderation_status = 'APPROVED',
            moderated_at = now(),
            moderated_by = ${input.actorId}::uuid,
            moderation_reason = ${input.reason ?? null},
            internal_note = ${input.internalNote ?? null}
        where organization_id = ${input.organizationId}
          and id = ${input.revisionId}::uuid
          and review_id = ${input.reviewId}::uuid
        returning id::text
      `.execute(tx);
      if (!changed.rows[0]) {
        throw new ReviewDomainError('NOT_FOUND', 'Review revision was not found.');
      }

      // Publish attached media assets
      await sql`
        update media.media_assets asset
        set visibility_class = 'PUBLIC', updated_at = now(), version = version + 1
        from reviews.review_media media
        where media.review_revision_id = ${input.revisionId}::uuid
          and media.organization_id = ${input.organizationId}
          and asset.organization_id = media.organization_id
          and asset.id = media.media_asset_id
          and asset.visibility_class <> 'PUBLIC'
      `.execute(tx);

      // Make revision active and review visible
      await sql`
        update reviews.reviews
        set published_revision_id = ${input.revisionId}::uuid,
            visibility_status = 'VISIBLE',
            updated_at = now(),
            version = version + 1
        where organization_id = ${input.organizationId}
          and id = ${input.reviewId}::uuid
      `.execute(tx);
    } else if (input.decision === 'REJECT') {
      if (!input.reason) {
        throw new ReviewDomainError('VALIDATION_FAILED', 'A rejection reason is required.');
      }
      const changed = await sql<{ id: string }>`
        update reviews.review_revisions
        set moderation_status = 'REJECTED',
            moderated_at = now(),
            moderated_by = ${input.actorId}::uuid,
            moderation_reason = ${input.reason},
            internal_note = ${input.internalNote ?? null}
        where organization_id = ${input.organizationId}
          and id = ${input.revisionId}::uuid
          and review_id = ${input.reviewId}::uuid
        returning id::text
      `.execute(tx);
      if (!changed.rows[0]) {
        throw new ReviewDomainError('NOT_FOUND', 'Review revision was not found.');
      }
    } else if (input.decision === 'HIDE') {
      if (!input.reason) {
        throw new ReviewDomainError('VALIDATION_FAILED', 'A reason is required to hide a Review.');
      }
      await sql`
        update reviews.reviews
        set visibility_status = 'HIDDEN',
            updated_at = now(),
            version = version + 1
        where organization_id = ${input.organizationId}
          and id = ${input.reviewId}::uuid
      `.execute(tx);
    } else if (input.decision === 'RESTORE') {
      await sql`
        update reviews.reviews
        set visibility_status = 'VISIBLE',
            updated_at = now(),
            version = version + 1
        where organization_id = ${input.organizationId}
          and id = ${input.reviewId}::uuid
      `.execute(tx);
    }

    // Always rebuild rating summary projection reliably
    await rebuild(tx, input.organizationId, review.product_id);

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: `reviews.review.${input.decision.toLowerCase()}`,
      targetType: 'reviews.review',
      targetId: input.reviewId,
      ...(input.reason ? { reason: input.reason } : {}),
      metadata: {
        revisionId: input.revisionId,
        decision: input.decision,
        ...(input.internalNote ? { internalNote: input.internalNote } : {}),
      },
    });

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId},
        ${`reviews.review.${input.decision.toLowerCase()}`},
        1, 'reviews.review',
        ${input.reviewId}::uuid, 1,
        ${JSON.stringify({ reviewId: input.reviewId, revisionId: input.revisionId, decision: input.decision })}::jsonb,
        now()
      )
    `.execute(tx);

    return { reviewId: input.reviewId };
  });
}

/**
 * Creates or updates the official Maevelle merchant response to a customer review.
 * Invariant REV-INV-021: Merchant response is separate from customer review content.
 */
export async function upsertMerchantResponse(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    reviewId: string;
    body: string;
  },
): Promise<{ id: string }> {
  const sanitized = sanitizeReviewText(input.body, 3000);
  if (!sanitized) {
    throw new ReviewDomainError('VALIDATION_FAILED', 'Response body is required.');
  }

  return db.transaction().execute(async (tx) => {
    const review = await sql<{ id: string }>`
      select id::text from reviews.reviews
      where id = ${input.reviewId}::uuid
        and organization_id = ${input.organizationId}
        and lifecycle_status = 'ACTIVE'
      for update
    `.execute(tx);
    if (!review.rows[0]) throw new ReviewDomainError('NOT_FOUND', 'Review was not found.');

    const response = await sql<{ id: string }>`
      insert into reviews.merchant_responses (
        organization_id, review_id, body, created_by, status
      ) values (
        ${input.organizationId}, ${input.reviewId}::uuid, ${sanitized}, ${input.actorId}::uuid, 'VISIBLE'
      )
      on conflict (review_id) do update set
        body = excluded.body,
        status = 'VISIBLE',
        updated_at = now(),
        version = reviews.merchant_responses.version + 1
      returning id::text
    `.execute(tx);

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'reviews.merchant_response.upsert',
      targetType: 'reviews.review',
      targetId: input.reviewId,
    });

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'reviews.merchant_response.upserted', 1, 'reviews.review',
        ${input.reviewId}::uuid, 1,
        ${JSON.stringify({ reviewId: input.reviewId, responseId: response.rows[0]?.id })}::jsonb,
        now()
      )
    `.execute(tx);

    return { id: response.rows[0]!.id };
  });
}

/**
 * Public Product Reviews query supporting server-side pagination, sorting, and rating filters.
 * Returns only approved, visible reviews with privacy-safe author names and public media.
 */
export async function listPublicReviews(
  db: Kysely<DatabaseSchema>,
  inputOrOrg:
    | string
    | {
        organizationId: string;
        productId: string;
        page?: number | undefined;
        pageSize?: number | undefined;
        rating?: number | undefined;
        withMedia?: boolean | undefined;
        verifiedOnly?: boolean | undefined;
        sort?: 'NEWEST' | 'RATING_DESC' | 'RATING_ASC' | 'WITH_PHOTOS' | undefined;
      },
  productIdOrOptions?:
    | string
    | {
        page?: number | undefined;
        pageSize?: number | undefined;
        rating?: number | undefined;
        withMedia?: boolean | undefined;
        verifiedOnly?: boolean | undefined;
        sort?: 'NEWEST' | 'RATING_DESC' | 'RATING_ASC' | 'WITH_PHOTOS' | undefined;
      }
    | undefined,
  options?: {
    page?: number | undefined;
    pageSize?: number | undefined;
    rating?: number | undefined;
    withMedia?: boolean | undefined;
    verifiedOnly?: boolean | undefined;
    sort?: 'NEWEST' | 'RATING_DESC' | 'RATING_ASC' | 'WITH_PHOTOS' | undefined;
  } | undefined,
) {
  const input =
    typeof inputOrOrg === 'string'
      ? {
          organizationId: inputOrOrg,
          productId: productIdOrOptions as string,
          page: options?.page,
          pageSize: options?.pageSize,
          rating: options?.rating,
          withMedia: options?.withMedia,
          verifiedOnly: options?.verifiedOnly,
          sort: options?.sort,
        }
      : inputOrOrg;
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 10));
  const offset = (page - 1) * pageSize;

  const baseFilter = sql`
    review.organization_id = ${input.organizationId}
    and review.product_id = ${input.productId}::uuid
    and review.lifecycle_status = 'ACTIVE'
    and review.visibility_status = 'VISIBLE'
    and revision.moderation_status = 'APPROVED'
    ${input.rating ? sql`and revision.rating = ${input.rating}` : sql``}
    ${input.verifiedOnly ? sql`and review.verification_order_line_id is not null` : sql``}
    ${
      input.withMedia
        ? sql`and exists (
            select 1 from reviews.review_media rm
            join media.media_assets a on a.id = rm.media_asset_id
            where rm.review_revision_id = revision.id
              and a.status in ('READY', 'ARCHIVED')
              and a.visibility_class = 'PUBLIC'
          )`
        : sql``
    }
  `;

  const totalResult = await sql<{ count: number }>`
    select count(*)::int as count
    from reviews.reviews review
    join reviews.review_revisions revision on revision.id = review.published_revision_id
    where ${baseFilter}
  `.execute(db);
  const total = totalResult.rows[0]?.count ?? 0;

  const sortOrder =
    input.sort === 'RATING_DESC'
      ? sql`revision.rating desc, review.created_at desc`
      : input.sort === 'RATING_ASC'
        ? sql`revision.rating asc, review.created_at desc`
        : input.sort === 'WITH_PHOTOS'
          ? sql`(select count(*) from reviews.review_media rm where rm.review_revision_id = revision.id) desc, review.created_at desc`
          : sql`review.created_at desc`;

  const rows = await sql<{
    id: string;
    rating: number;
    title: string | null;
    body: string | null;
    public_display_name: string;
    purchased_variant_id: string | null;
    purchased_variant_label: string | null;
    verified_purchase: boolean;
    submitted_at: string;
    published_at: string | null;
    merchant_response_body: string | null;
    merchant_response_created_at: string | null;
    merchant_response_updated_at: string | null;
    media_json: unknown;
  }>`
    select
      review.id::text,
      revision.rating,
      revision.title,
      revision.body,
      revision.public_display_name,
      review.purchased_variant_id::text,
      review.purchased_variant_label,
      (review.verification_order_line_id is not null) as verified_purchase,
      revision.submitted_at::text,
      revision.moderated_at::text as published_at,
      response.body as merchant_response_body,
      response.created_at::text as merchant_response_created_at,
      response.updated_at::text as merchant_response_updated_at,
      coalesce(
        (
          select json_agg(
            json_build_object(
              'assetId', asset.id::text,
              'mediaType', media.media_type,
              'position', media.position,
              'url', '/api/media/public/' || asset.id::text,
              'thumbnailUrl', '/api/media/public/' || asset.id::text || '?rendition=card'
            ) order by media.position, media.created_at
          )
          from reviews.review_media media
          join media.media_assets asset on asset.id = media.media_asset_id
          where media.review_revision_id = revision.id
            and media.organization_id = review.organization_id
            and asset.status in ('READY', 'ARCHIVED')
            and asset.visibility_class = 'PUBLIC'
        ),
        '[]'::json
      ) as media_json
    from reviews.reviews review
    join reviews.review_revisions revision on revision.id = review.published_revision_id
    left join reviews.merchant_responses response
      on response.review_id = review.id
      and response.organization_id = review.organization_id
      and response.status = 'VISIBLE'
    where ${baseFilter}
    order by ${sortOrder}
    limit ${pageSize} offset ${offset}
  `.execute(db);

  const items = rows.rows.map((row) => {
    const mediaItems = Array.isArray(row.media_json) ? (row.media_json as any[]) : [];
    return {
      id: row.id,
      rating: row.rating,
      title: row.title,
      body: row.body,
      publicDisplayName: row.public_display_name,
      public_display_name: row.public_display_name,
      verifiedPurchase: Boolean(row.verified_purchase),
      verified_purchase: Boolean(row.verified_purchase),
      purchasedVariant: row.purchased_variant_label
        ? { variantId: row.purchased_variant_id, label: row.purchased_variant_label }
        : null,
      purchased_variant_label: row.purchased_variant_label,
      media: mediaItems,
      media_asset_ids: mediaItems.map((m) => m.assetId),
      merchantResponse: row.merchant_response_body
        ? {
            body: row.merchant_response_body,
            status: 'VISIBLE' as const,
            respondedBy: 'Maevelle',
            createdAt: row.merchant_response_created_at ?? '',
            updatedAt: row.merchant_response_updated_at ?? '',
          }
        : null,
      merchant_response: row.merchant_response_body,
      submittedAt: row.submitted_at,
      submitted_at: row.submitted_at,
      publishedAt: row.published_at,
      published_at: row.published_at,
    };
  });

  return Object.assign([...items], {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  });
}

/**
 * Retrieves the authoritative rating summary for a product including percentages.
 */
export async function getRatingSummary(
  db: Kysely<DatabaseSchema>,
  org: string,
  productId: string,
): Promise<{
  productId: string;
  product_id?: string;
  ratingCount: number;
  rating_count?: number;
  ratingSum: number;
  rating_sum?: number;
  averageRating: string | null;
  average_rating?: string | null;
  formattedAverage: string | null;
  formatted_average?: string | null;
  rating1Count: number;
  rating_1_count?: number;
  rating2Count: number;
  rating_2_count?: number;
  rating3Count: number;
  rating_3_count?: number;
  rating4Count: number;
  rating_4_count?: number;
  rating5Count: number;
  rating_5_count?: number;
  textReviewCount: number;
  text_review_count?: number;
  mediaReviewCount: number;
  media_review_count?: number;
  verifiedReviewCount: number;
  verified_review_count?: number;
  distributionPercentages: {
    star1: number;
    star2: number;
    star3: number;
    star4: number;
    star5: number;
  };
  updatedAt: string;
  updated_at?: string;
} | undefined> {
  const row = await sql<{
    rating_count: number;
    rating_sum: number;
    rating_1_count: number;
    rating_2_count: number;
    rating_3_count: number;
    rating_4_count: number;
    rating_5_count: number;
    text_review_count: number;
    media_review_count: number;
    verified_review_count: number;
    average_rating: string | null;
    updated_at: string;
  }>`
    select
      rating_count, rating_sum,
      rating_1_count, rating_2_count, rating_3_count, rating_4_count, rating_5_count,
      text_review_count, media_review_count, verified_review_count,
      case when rating_count = 0 then null
           else (rating_sum::numeric / rating_count)::numeric(10,4)::text
      end as average_rating,
      updated_at::text
    from reviews.product_rating_summary
    where organization_id = ${org} and product_id = ${productId}::uuid
  `.execute(db);

  const r = row.rows[0];
  if (!r) return undefined;

  const count = r.rating_count;
  const pct = (val: number) => (count > 0 ? Math.round((val / count) * 100) : 0);
  const avg = r.average_rating ? Number(r.average_rating).toFixed(1) : null;

  return {
    productId,
    product_id: productId,
    ratingCount: r.rating_count,
    rating_count: r.rating_count,
    ratingSum: r.rating_sum,
    rating_sum: r.rating_sum,
    averageRating: r.average_rating,
    average_rating: r.average_rating,
    formattedAverage: avg,
    formatted_average: avg,
    rating1Count: r.rating_1_count,
    rating_1_count: r.rating_1_count,
    rating2Count: r.rating_2_count,
    rating_2_count: r.rating_2_count,
    rating3Count: r.rating_3_count,
    rating_3_count: r.rating_3_count,
    rating4Count: r.rating_4_count,
    rating_4_count: r.rating_4_count,
    rating5Count: r.rating_5_count,
    rating_5_count: r.rating_5_count,
    textReviewCount: r.text_review_count,
    text_review_count: r.text_review_count,
    mediaReviewCount: r.media_review_count,
    media_review_count: r.media_review_count,
    verifiedReviewCount: r.verified_review_count,
    verified_review_count: r.verified_review_count,
    distributionPercentages: {
      star1: pct(r.rating_1_count),
      star2: pct(r.rating_2_count),
      star3: pct(r.rating_3_count),
      star4: pct(r.rating_4_count),
      star5: pct(r.rating_5_count),
    },
    updatedAt: r.updated_at,
    updated_at: r.updated_at,
  };
}

export async function rebuildRatingSummary(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
) {
  await rebuild(db, organizationId, productId);
  return getRatingSummary(db, organizationId, productId);
}

/**
 * Tenant-scoped operational worklist for Admin moderation queue and review triage.
 */
export async function listAdminReviews(
  db: Kysely<DatabaseSchema>,
  inputOrOrg:
    | string
    | {
        organizationId: string;
        queue?: 'ALL' | 'PENDING' | 'VISIBLE' | 'REJECTED' | 'HIDDEN' | 'NEEDS_RESPONSE' | 'MEDIA' | undefined;
        rating?: number | undefined;
        search?: string | undefined;
        page?: number | undefined;
        pageSize?: number | undefined;
        sort?: 'NEWEST' | 'OLDEST' | 'RATING_DESC' | 'RATING_ASC' | undefined;
      },
  options?: {
    queue?: 'ALL' | 'PENDING' | 'VISIBLE' | 'REJECTED' | 'HIDDEN' | 'NEEDS_RESPONSE' | 'MEDIA' | undefined;
    rating?: number | undefined;
    search?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    sort?: 'NEWEST' | 'OLDEST' | 'RATING_DESC' | 'RATING_ASC' | undefined;
  } | undefined,
) {
  const input =
    typeof inputOrOrg === 'string'
      ? {
          organizationId: inputOrOrg,
          queue: options?.queue,
          rating: options?.rating,
          search: options?.search,
          page: options?.page,
          pageSize: options?.pageSize,
          sort: options?.sort,
        }
      : inputOrOrg;
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const searchTerm = input.search?.trim().toLowerCase() ?? '';

  const queueCondition =
    input.queue === 'VISIBLE'
      ? sql`review.visibility_status = 'VISIBLE'`
      : input.queue === 'REJECTED'
        ? sql`revision.moderation_status = 'REJECTED'`
        : input.queue === 'HIDDEN'
          ? sql`review.visibility_status = 'HIDDEN' and revision.moderation_status <> 'PENDING'`
          : input.queue === 'NEEDS_RESPONSE'
            ? sql`revision.moderation_status = 'APPROVED' and response.id is null`
            : input.queue === 'MEDIA'
              ? sql`exists (select 1 from reviews.review_media rm where rm.review_revision_id = revision.id)`
              : input.queue === 'ALL'
                ? sql`true`
                : sql`revision.moderation_status = 'PENDING'`;

  const searchCondition = searchTerm
    ? sql`and (
        lower(product.title) like ${`%${searchTerm}%`}
        or lower(customer.customer_number) like ${`%${searchTerm}%`}
        or lower(customer.display_name) like ${`%${searchTerm}%`}
        or lower(revision.public_display_name) like ${`%${searchTerm}%`}
        or lower(coalesce(revision.title, '')) like ${`%${searchTerm}%`}
        or lower(coalesce(revision.body, '')) like ${`%${searchTerm}%`}
      )`
    : sql``;

  const ratingCondition = input.rating ? sql`and revision.rating = ${input.rating}` : sql``;

  // Aggregate counts for admin queue tabs
  const countsRow = await sql<{
    pending: number;
    visible: number;
    rejected: number;
    hidden: number;
    needs_response: number;
    with_media: number;
    total: number;
  }>`
    select
      count(*) filter (where revision.moderation_status = 'PENDING')::int as pending,
      count(*) filter (where review.visibility_status = 'VISIBLE')::int as visible,
      count(*) filter (where revision.moderation_status = 'REJECTED')::int as rejected,
      count(*) filter (where review.visibility_status = 'HIDDEN' and revision.moderation_status <> 'PENDING')::int as hidden,
      count(*) filter (where revision.moderation_status = 'APPROVED' and response.id is null)::int as needs_response,
      count(*) filter (where exists (select 1 from reviews.review_media rm where rm.review_revision_id = revision.id))::int as with_media,
      count(*)::int as total
    from reviews.reviews review
    join lateral (
      select r.* from reviews.review_revisions r
      where r.review_id = review.id
      order by r.revision_number desc
      limit 1
    ) revision on true
    left join reviews.merchant_responses response
      on response.review_id = review.id and response.organization_id = review.organization_id
    where review.organization_id = ${input.organizationId}
      and review.lifecycle_status = 'ACTIVE'
  `.execute(db);
  const counts = countsRow.rows[0] ?? {
    pending: 0,
    visible: 0,
    rejected: 0,
    hidden: 0,
    needs_response: 0,
    with_media: 0,
    total: 0,
  };

  const totalFiltered = await sql<{ count: number }>`
    select count(*)::int as count
    from reviews.reviews review
    join lateral (
      select r.* from reviews.review_revisions r
      where r.review_id = review.id
      order by r.revision_number desc
      limit 1
    ) revision on true
    join catalog.products product
      on product.id = review.product_id and product.organization_id = review.organization_id
    join customers.customers customer
      on customer.id = review.customer_id and customer.organization_id = review.organization_id
    left join reviews.merchant_responses response
      on response.review_id = review.id and response.organization_id = review.organization_id
    where review.organization_id = ${input.organizationId}
      and review.lifecycle_status = 'ACTIVE'
      and ${queueCondition}
      ${ratingCondition}
      ${searchCondition}
  `.execute(db);
  const total = totalFiltered.rows[0]?.count ?? 0;

  const sortOrder =
    input.sort === 'OLDEST'
      ? sql`revision.submitted_at asc`
      : input.sort === 'RATING_DESC'
        ? sql`revision.rating desc, revision.submitted_at desc`
        : input.sort === 'RATING_ASC'
          ? sql`revision.rating asc, revision.submitted_at desc`
          : sql`revision.submitted_at desc`;

  const rows = await sql<{
    id: string;
    product_id: string;
    product_title: string;
    revision_id: string;
    revision_number: number;
    rating: number;
    title: string | null;
    body: string | null;
    public_display_name: string;
    customer_id: string;
    customer_number: string;
    customer_name: string;
    moderation_status: string;
    moderation_reason: string | null;
    visibility_status: string;
    lifecycle_status: string;
    verified_purchase: boolean;
    purchased_variant_label: string | null;
    order_number: string | null;
    media_count: number;
    merchant_response: string | null;
    submitted_at: string;
    moderated_at: string | null;
  }>`
    select
      review.id::text,
      review.product_id::text,
      product.title as product_title,
      revision.id::text as revision_id,
      revision.revision_number,
      revision.rating,
      revision.title,
      revision.body,
      revision.public_display_name,
      customer.id::text as customer_id,
      customer.customer_number,
      customer.display_name as customer_name,
      revision.moderation_status,
      revision.moderation_reason,
      review.visibility_status,
      review.lifecycle_status,
      (review.verification_order_line_id is not null) as verified_purchase,
      review.purchased_variant_label,
      o.order_number,
      (select count(*)::int from reviews.review_media rm where rm.review_revision_id = revision.id) as media_count,
      response.body as merchant_response,
      revision.submitted_at::text,
      revision.moderated_at::text
    from reviews.reviews review
    join lateral (
      select r.* from reviews.review_revisions r
      where r.review_id = review.id
      order by r.revision_number desc
      limit 1
    ) revision on true
    join catalog.products product
      on product.id = review.product_id and product.organization_id = review.organization_id
    join customers.customers customer
      on customer.id = review.customer_id and customer.organization_id = review.organization_id
    left join orders.order_lines ol on ol.id = review.verification_order_line_id
    left join orders.orders o on o.id = ol.order_id
    left join reviews.merchant_responses response
      on response.review_id = review.id and response.organization_id = review.organization_id
    where review.organization_id = ${input.organizationId}
      and review.lifecycle_status = 'ACTIVE'
      and ${queueCondition}
      ${ratingCondition}
      ${searchCondition}
    order by ${sortOrder}
    limit ${pageSize} offset ${offset}
  `.execute(db);

  const items = rows.rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    product_id: r.product_id,
    productTitle: r.product_title,
    product_title: r.product_title,
    revisionId: r.revision_id,
    revision_id: r.revision_id,
    revisionNumber: r.revision_number,
    revision_number: r.revision_number,
    rating: r.rating,
    title: r.title,
    body: r.body,
    publicDisplayName: r.public_display_name,
    public_display_name: r.public_display_name,
    customerId: r.customer_id,
    customer_id: r.customer_id,
    customerNumber: r.customer_number,
    customer_number: r.customer_number,
    customerName: r.customer_name ?? r.public_display_name,
    customer_name: r.customer_name ?? r.public_display_name,
    moderationStatus: r.moderation_status,
    moderation_status: r.moderation_status,
    moderationReason: r.moderation_reason,
    moderation_reason: r.moderation_reason,
    visibilityStatus: r.visibility_status,
    visibility_status: r.visibility_status,
    lifecycleStatus: r.lifecycle_status,
    lifecycle_status: r.lifecycle_status,
    verifiedPurchase: Boolean(r.verified_purchase),
    verified_purchase: Boolean(r.verified_purchase),
    purchasedVariantLabel: r.purchased_variant_label,
    purchased_variant_label: r.purchased_variant_label,
    orderNumber: r.order_number,
    order_number: r.order_number,
    mediaCount: r.media_count,
    media_count: r.media_count,
    merchantResponse: r.merchant_response,
    merchant_response: r.merchant_response,
    submittedAt: r.submitted_at,
    submitted_at: r.submitted_at,
    moderatedAt: r.moderated_at,
    moderated_at: r.moderated_at,
  }));

  const countsObj = {
    pending: counts.pending,
    visible: counts.visible,
    rejected: counts.rejected,
    hidden: counts.hidden,
    needsResponse: counts.needs_response,
    withMedia: counts.with_media,
    total: counts.total,
  };

  return Object.assign([...items], {
    items,
    counts: countsObj,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  });
}

/**
 * Detailed operator view for an individual review, including customer, order, returns, revisions, and media.
 */
export async function getAdminReviewDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  reviewId: string,
) {
  const root = await sql<{
    id: string;
    product_id: string;
    product_title: string;
    product_handle: string;
    customer_id: string;
    customer_number: string;
    customer_display_name: string | null;
    verification_order_line_id: string | null;
    purchased_variant_id: string | null;
    purchased_variant_label: string | null;
    source: string;
    lifecycle_status: string;
    visibility_status: string;
    published_revision_id: string | null;
    created_at: string;
    updated_at: string;
    order_id: string | null;
    order_number: string | null;
    sku_snapshot: string | null;
    ordered_at: string | null;
    fulfillment_status: string | null;
    delivery_outcome: string | null;
    has_return: boolean;
    has_refund: boolean;
  }>`
    select
      review.id::text,
      review.product_id::text,
      product.title as product_title,
      product.handle as product_handle,
      customer.id::text as customer_id,
      customer.customer_number,
      customer.display_name as customer_display_name,
      review.verification_order_line_id::text,
      review.purchased_variant_id::text,
      review.purchased_variant_label,
      review.source,
      review.lifecycle_status,
      review.visibility_status,
      review.published_revision_id::text,
      review.created_at::text,
      review.updated_at::text,
      o.id::text as order_id,
      o.order_number,
      ol.sku_snapshot,
      o.created_at::text as ordered_at,
      f.status as fulfillment_status,
      d.outcome_status as delivery_outcome,
      exists(select 1 from returns.return_cases rc where rc.order_id = o.id) as has_return,
      exists(select 1 from payments.refund_allocations ra where ra.order_line_id = ol.id) as has_refund
    from reviews.reviews review
    join catalog.products product
      on product.id = review.product_id and product.organization_id = review.organization_id
    join customers.customers customer
      on customer.id = review.customer_id and customer.organization_id = review.organization_id
    left join orders.order_lines ol on ol.id = review.verification_order_line_id
    left join orders.orders o on o.id = ol.order_id
    left join fulfillment.fulfillment_lines fl on fl.order_line_id = ol.id
    left join fulfillment.fulfillments f on f.id = fl.fulfillment_id
    left join delivery.deliveries d on d.fulfillment_id = f.id
    where review.organization_id = ${organizationId} and review.id = ${reviewId}::uuid
  `.execute(db);

  const row = root.rows[0];
  if (!row) return undefined;

  // Fetch revisions
  const revisions = await sql<{
    id: string;
    revision_number: number;
    rating: number;
    title: string | null;
    body: string | null;
    public_display_name: string;
    moderation_status: string;
    moderation_reason: string | null;
    internal_note: string | null;
    submitted_at: string;
    moderated_at: string | null;
    moderator_name: string | null;
  }>`
    select
      rev.id::text,
      rev.revision_number,
      rev.rating,
      rev.title,
      rev.body,
      rev.public_display_name,
      rev.moderation_status,
      rev.moderation_reason,
      rev.internal_note,
      rev.submitted_at::text,
      rev.moderated_at::text,
      u.name as moderator_name
    from reviews.review_revisions rev
    left join iam.users u on u.id = rev.moderated_by
    where rev.organization_id = ${organizationId} and rev.review_id = ${reviewId}::uuid
    order by rev.revision_number desc
  `.execute(db);

  const currentRevision = revisions.rows[0]!;

  // Fetch media for latest revision
  const media = await sql<{
    asset_id: string;
    media_type: 'IMAGE' | 'VIDEO';
    position: number;
    url: string;
    thumbnail_url: string;
  }>`
    select
      asset.id::text as asset_id,
      rm.media_type,
      rm.position,
      '/api/media/public/' || asset.id::text as url,
      '/api/media/public/' || asset.id::text || '?rendition=card' as thumbnail_url
    from reviews.review_media rm
    join media.media_assets asset on asset.id = rm.media_asset_id
    where rm.organization_id = ${organizationId}
      and rm.review_revision_id = ${currentRevision.id}::uuid
    order by rm.position, rm.created_at
  `.execute(db);

  // Fetch merchant response
  const response = await sql<{
    body: string;
    status: 'VISIBLE' | 'HIDDEN';
    created_at: string;
    updated_at: string;
    user_name: string | null;
  }>`
    select mr.body, mr.status, mr.created_at::text, mr.updated_at::text, u.name as user_name
    from reviews.merchant_responses mr
    left join iam.users u on u.id = mr.created_by
    where mr.organization_id = ${organizationId} and mr.review_id = ${reviewId}::uuid
  `.execute(db);
  const resp = response.rows[0];

  return {
    id: row.id,
    productId: row.product_id,
    productTitle: row.product_title,
    productHandle: row.product_handle,
    customer: {
      id: row.customer_id,
      customerNumber: row.customer_number,
      displayName: row.customer_display_name,
    },
    order: row.order_id
      ? {
          orderId: row.order_id,
          orderNumber: row.order_number ?? '',
          orderLineId: row.verification_order_line_id ?? '',
          skuSnapshot: row.sku_snapshot,
          orderedAt: row.ordered_at ?? '',
          fulfillmentStatus: row.fulfillment_status,
          deliveryOutcome: row.delivery_outcome,
          hasReturn: Boolean(row.has_return),
          hasRefund: Boolean(row.has_refund),
        }
      : null,
    purchasedVariant: {
      variantId: row.purchased_variant_id,
      label: row.purchased_variant_label,
    },
    verifiedPurchase: row.verification_order_line_id !== null,
    source: row.source,
    lifecycleStatus: row.lifecycle_status,
    visibilityStatus: row.visibility_status,
    publishedRevisionId: row.published_revision_id,
    currentRevision: {
      id: currentRevision.id,
      revisionNumber: currentRevision.revision_number,
      rating: currentRevision.rating,
      title: currentRevision.title,
      body: currentRevision.body,
      publicDisplayName: currentRevision.public_display_name,
      moderationStatus: currentRevision.moderation_status,
      moderationReason: currentRevision.moderation_reason,
      internalNote: currentRevision.internal_note,
      submittedAt: currentRevision.submitted_at,
      moderatedAt: currentRevision.moderated_at,
      moderatedByActorName: currentRevision.moderator_name,
    },
    revisions: revisions.rows.map((r) => ({
      id: r.id,
      revisionNumber: r.revision_number,
      rating: r.rating,
      title: r.title,
      body: r.body,
      publicDisplayName: r.public_display_name,
      moderationStatus: r.moderation_status,
      moderationReason: r.moderation_reason,
      submittedAt: r.submitted_at,
      moderatedAt: r.moderated_at,
    })),
    media: media.rows.map((m) => ({
      assetId: m.asset_id,
      mediaType: m.media_type,
      position: m.position,
      url: m.url,
      thumbnailUrl: m.thumbnail_url,
    })),
    merchantResponse: resp
      ? {
          body: resp.body,
          status: resp.status,
          respondedBy: resp.user_name ?? 'Maevelle',
          createdAt: resp.created_at,
          updatedAt: resp.updated_at,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Returns review history for an individual Customer record (for Customer Admin workspace).
 */
export async function getCustomerReviewHistory(
  db: Kysely<DatabaseSchema>,
  inputOrOrg:
    | string
    | {
        organizationId: string;
        customerId: string;
        page?: number | undefined;
        pageSize?: number | undefined;
      },
  customerIdOrOptions?:
    | string
    | { page?: number | undefined; pageSize?: number | undefined }
    | undefined,
  options?: { page?: number | undefined; pageSize?: number | undefined } | undefined,
) {
  const input =
    typeof inputOrOrg === 'string'
      ? {
          organizationId: inputOrOrg,
          customerId: customerIdOrOptions as string,
          page: options?.page,
          pageSize: options?.pageSize,
        }
      : inputOrOrg;
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 10));
  const offset = (page - 1) * pageSize;

  const metricsRow = await sql<{
    total_submitted: number;
    total_approved: number;
    total_pending: number;
    total_rejected: number;
    avg_rating: string | null;
  }>`
    select
      count(*)::int as total_submitted,
      count(*) filter (where revision.moderation_status = 'APPROVED')::int as total_approved,
      count(*) filter (where revision.moderation_status = 'PENDING')::int as total_pending,
      count(*) filter (where revision.moderation_status = 'REJECTED')::int as total_rejected,
      case when count(*) = 0 then null
           else (avg(revision.rating))::numeric(10,2)::text
      end as avg_rating
    from reviews.reviews review
    join lateral (
      select r.* from reviews.review_revisions r
      where r.review_id = review.id
      order by r.revision_number desc
      limit 1
    ) revision on true
    where review.organization_id = ${input.organizationId}
      and review.customer_id = ${input.customerId}::uuid
      and review.lifecycle_status = 'ACTIVE'
  `.execute(db);
  const metrics = metricsRow.rows[0] ?? {
    total_submitted: 0,
    total_approved: 0,
    total_pending: 0,
    total_rejected: 0,
    avg_rating: null,
  };

  const total = metrics.total_submitted;

  const rows = await sql<{
    review_id: string;
    product_id: string;
    product_title: string;
    product_handle: string;
    rating: number;
    title: string | null;
    body: string | null;
    lifecycle_status: string;
    visibility_status: string;
    moderation_status: string;
    moderation_reason: string | null;
    verified_purchase: boolean;
    purchased_variant_label: string | null;
    media_count: number;
    has_merchant_response: boolean;
    submitted_at: string;
    moderated_at: string | null;
  }>`
    select
      review.id::text as review_id,
      review.product_id::text,
      product.title as product_title,
      product.handle as product_handle,
      revision.rating,
      revision.title,
      revision.body,
      review.lifecycle_status,
      review.visibility_status,
      revision.moderation_status,
      revision.moderation_reason,
      (review.verification_order_line_id is not null) as verified_purchase,
      review.purchased_variant_label,
      (select count(*)::int from reviews.review_media rm where rm.review_revision_id = revision.id) as media_count,
      exists(select 1 from reviews.merchant_responses mr where mr.review_id = review.id) as has_merchant_response,
      revision.submitted_at::text,
      revision.moderated_at::text
    from reviews.reviews review
    join lateral (
      select r.* from reviews.review_revisions r
      where r.review_id = review.id
      order by r.revision_number desc
      limit 1
    ) revision on true
    join catalog.products product
      on product.id = review.product_id and product.organization_id = review.organization_id
    where review.organization_id = ${input.organizationId}
      and review.customer_id = ${input.customerId}::uuid
      and review.lifecycle_status = 'ACTIVE'
    order by revision.submitted_at desc
    limit ${pageSize} offset ${offset}
  `.execute(db);

  const reviewList = rows.rows.map((r) => ({
    reviewId: r.review_id,
    productId: r.product_id,
    productTitle: r.product_title,
    productHandle: r.product_handle,
    rating: r.rating,
    title: r.title,
    body: r.body,
    lifecycleStatus: r.lifecycle_status,
    visibilityStatus: r.visibility_status,
    moderationStatus: r.moderation_status,
    moderationReason: r.moderation_reason,
    verifiedPurchase: Boolean(r.verified_purchase),
    purchasedVariantLabel: r.purchased_variant_label,
    mediaCount: r.media_count,
    hasMerchantResponse: Boolean(r.has_merchant_response),
    submittedAt: r.submitted_at,
    moderatedAt: r.moderated_at,
  }));

  return {
    reviews: reviewList,
    items: reviewList,
    metrics: {
      totalSubmitted: metrics.total_submitted,
      totalApproved: metrics.total_approved,
      totalPending: metrics.total_pending,
      totalRejected: metrics.total_rejected,
      averageRatingGiven: metrics.avg_rating ? Number(metrics.avg_rating) : null,
    },
    pagination: {
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}

/**
 * Returns review state for every order line in an order.
 * Powers future Customer dashboard "Write a review" links without client-side searching.
 */
export async function getOrderLinesReviewState(
  db: Kysely<DatabaseSchema>,
  inputOrOrg: string | { organizationId: string; orderId: string },
  orderIdParam?: string,
) {
  const input =
    typeof inputOrOrg === 'string'
      ? { organizationId: inputOrOrg, orderId: orderIdParam! }
      : inputOrOrg;
  const lines = await sql<{
    order_line_id: string;
    product_id: string;
    product_title: string;
    variant_id: string | null;
    sku_snapshot: string | null;
    option_snapshot: unknown;
    fulfillment_status: string | null;
    delivery_outcome: string | null;
    review_id: string | null;
    review_rating: number | null;
    review_status: string | null;
    token: string | null;
  }>`
    select
      l.id::text as order_line_id,
      l.product_id::text,
      coalesce(l.product_title_snapshot, p.title) as product_title,
      l.variant_id::text,
      l.sku_snapshot,
      l.option_snapshot,
      f.status as fulfillment_status,
      d.outcome_status as delivery_outcome,
      r.id::text as review_id,
      rev.rating as review_rating,
      rev.moderation_status as review_status,
      t.token_hash as token
    from orders.order_lines l
    join orders.orders o on o.id = l.order_id and o.organization_id = l.organization_id
    left join catalog.products p on p.id = l.product_id and p.organization_id = l.organization_id
    left join fulfillment.fulfillment_lines fl on fl.order_line_id = l.id
    left join fulfillment.fulfillments f on f.id = fl.fulfillment_id
    left join delivery.deliveries d on d.fulfillment_id = f.id
    left join reviews.reviews r
      on r.verification_order_line_id = l.id
      and r.organization_id = l.organization_id
      and r.lifecycle_status = 'ACTIVE'
    left join reviews.review_revisions rev on rev.id = r.published_revision_id
    left join reviews.review_access_tokens t
      on t.order_line_id = l.id
      and t.organization_id = l.organization_id
      and t.revoked_at is null
      and (t.expires_at is null or t.expires_at > now())
      and t.used_at is null
    where l.organization_id = ${input.organizationId}
      and l.order_id = ${input.orderId}::uuid
    order by l.created_at asc
  `.execute(db);

  return lines.rows.map((row) => {
    const isDeliveredOrDispatched =
      row.delivery_outcome === 'DELIVERED' || row.fulfillment_status === 'DISPATCHED';
    const isEligible = isDeliveredOrDispatched && !row.review_id;

    return {
      orderLineId: row.order_line_id,
      productId: row.product_id,
      productTitle: row.product_title,
      variantId: row.variant_id,
      variantLabel: formatVariantLabel(row.option_snapshot, row.sku_snapshot),
      isDeliveredOrDispatched,
      isEligible,
      reviewSubmitted: Boolean(row.review_id),
      reviewId: row.review_id ?? undefined,
      reviewRating: row.review_rating ?? undefined,
      reviewStatus: row.review_status ?? undefined,
    };
  });
}

/**
 * Diagnostic and integrity auditor for Reviews domain.
 */
export async function verifyReviewIntegrity(db: Kysely<DatabaseSchema>, org: string): Promise<string[]> {
  const issues: string[] = [];

  const duplicate = await sql`
    select 1 from reviews.reviews
    where organization_id = ${org} and lifecycle_status = 'ACTIVE'
    group by customer_id, product_id having count(*) > 1
    limit 1
  `.execute(db);
  if (duplicate.rows[0]) issues.push('ACTIVE_DUPLICATE_REVIEW');

  const drift = await sql`
    select 1 from reviews.product_rating_summary s
    where s.organization_id = ${org}
      and s.rating_count <> (
        select count(*) from reviews.reviews r
        join reviews.review_revisions rev on rev.id = r.published_revision_id
        where r.organization_id = s.organization_id
          and r.product_id = s.product_id
          and r.lifecycle_status = 'ACTIVE'
          and r.visibility_status = 'VISIBLE'
          and rev.moderation_status = 'APPROVED'
      )
    limit 1
  `.execute(db);
  if (drift.rows[0]) issues.push('RATING_SUMMARY_DRIFT');

  return issues;
}

/**
 * Automatically creates review invitations for delivered orders that have not yet received an invitation.
 * Idempotent: checks invitation_sent_at and existing active reviews.
 */
export async function dispatchPostDeliveryReviewInvitations(
  db: Kysely<DatabaseSchema>,
  options?: {
    organizationId?: string | undefined;
    limit?: number | undefined;
    delayHours?: number | undefined;
  },
): Promise<{ processed: number; created: number }> {
  const limit = Math.min(100, Math.max(1, options?.limit ?? 25));
  const delayHours = Math.max(0, options?.delayHours ?? 24);

  const eligibleCandidates = await sql<{
    organization_id: string;
    order_line_id: string;
    order_id: string;
    order_number: string;
    customer_id: string;
    product_id: string;
    product_title: string;
  }>`
    select
      l.organization_id,
      l.id::text as order_line_id,
      o.id::text as order_id,
      o.order_number,
      o.customer_id::text,
      l.product_id::text,
      coalesce(l.product_title_snapshot, p.title) as product_title
    from orders.order_lines l
    join orders.orders o on o.id = l.order_id and o.organization_id = l.organization_id
    left join catalog.products p on p.id = l.product_id and p.organization_id = l.organization_id
    left join fulfillment.fulfillment_lines fl on fl.order_line_id = l.id and fl.organization_id = l.organization_id
    left join fulfillment.fulfillments f on f.id = fl.fulfillment_id and f.organization_id = l.organization_id
    left join delivery.deliveries d on d.fulfillment_id = f.id and d.organization_id = l.organization_id
    where o.order_status <> 'CANCELLED'
      ${options?.organizationId ? sql`and l.organization_id = ${options.organizationId}` : sql``}
      and (d.outcome_status = 'DELIVERED' or f.status = 'DISPATCHED')
      and coalesce(d.delivered_at, f.dispatched_at, f.updated_at) <= now() - (${delayHours} || ' hours')::interval
      and not exists (
        select 1 from reviews.review_access_tokens rat
        where rat.organization_id = l.organization_id
          and rat.order_line_id = l.id
      )
      and not exists (
        select 1 from reviews.reviews r
        where r.organization_id = l.organization_id
          and r.customer_id = o.customer_id
          and r.product_id = l.product_id
          and r.lifecycle_status = 'ACTIVE'
      )
    order by o.created_at asc
    limit ${limit}
  `.execute(db);

  let created = 0;
  for (const candidate of eligibleCandidates.rows) {
    try {
      const access = await createReviewAccess(db, {
        organizationId: candidate.organization_id,
        orderLineId: candidate.order_line_id,
        channel: 'EMAIL',
      });

      await sql`
        insert into platform.outbox_events (
          organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
        ) values (
          ${candidate.organization_id}, 'reviews.invitation.dispatched', 1, 'reviews.review_invitation',
          ${candidate.order_line_id}::uuid, 1,
          ${JSON.stringify({
            orderLineId: candidate.order_line_id,
            orderId: candidate.order_id,
            orderNumber: candidate.order_number,
            customerId: candidate.customer_id,
            productId: candidate.product_id,
            productTitle: candidate.product_title,
            token: access.token,
            expiresAt: access.expiresAt,
          })}::jsonb,
          now()
        )
      `.execute(db);

      created++;
    } catch {
      // Skip if individual line fails eligibility or token generation race
    }
  }

  return { processed: eligibleCandidates.rows.length, created };
}
