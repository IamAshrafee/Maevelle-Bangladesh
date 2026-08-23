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
  }
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
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
async function rebuild(db: Kysely<DatabaseSchema>, org: string, productId: string) {
  await sql`insert into reviews.product_rating_summary(organization_id,product_id,rating_count,rating_sum,rating_1_count,rating_2_count,rating_3_count,rating_4_count,rating_5_count,text_review_count,media_review_count,updated_at) select ${org},${productId}::uuid,count(*)::int,coalesce(sum(rating),0)::int,count(*)filter(where rating=1)::int,count(*)filter(where rating=2)::int,count(*)filter(where rating=3)::int,count(*)filter(where rating=4)::int,count(*)filter(where rating=5)::int,count(*)filter(where body is not null and length(trim(body))>0)::int,count(*)filter(where exists(select 1 from reviews.review_media rm join media.media_assets a on a.id=rm.media_asset_id where rm.review_revision_id=revision.id and a.status='READY' and a.visibility_class='PUBLIC'))::int,now() from reviews.reviews review join reviews.review_revisions revision on revision.id=review.published_revision_id where review.organization_id=${org} and review.product_id=${productId}::uuid and review.lifecycle_status='ACTIVE' and review.visibility_status='VISIBLE' and revision.moderation_status='APPROVED' on conflict(organization_id,product_id) do update set rating_count=excluded.rating_count,rating_sum=excluded.rating_sum,rating_1_count=excluded.rating_1_count,rating_2_count=excluded.rating_2_count,rating_3_count=excluded.rating_3_count,rating_4_count=excluded.rating_4_count,rating_5_count=excluded.rating_5_count,text_review_count=excluded.text_review_count,media_review_count=excluded.media_review_count,updated_at=now()`.execute(
    db,
  );
}
export async function createReviewAccess(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; orderLineId: string },
) {
  const evidence = await sql<{
    customer_id: string;
    product_id: string;
  }>`select o.customer_id,l.product_id from orders.order_lines l join orders.orders o on o.id=l.order_id join fulfillment.fulfillment_lines fl on fl.order_line_id=l.id join fulfillment.fulfillments f on f.id=fl.fulfillment_id where l.organization_id=${input.organizationId} and l.id=${input.orderLineId} and o.customer_id is not null and l.product_id is not null and f.status='DISPATCHED' limit 1`.execute(
    db,
  );
  const e = evidence.rows[0];
  if (!e)
    throw new ReviewDomainError('NOT_FOUND', 'No fulfilled purchase is eligible for a Review.');
  const token = randomBytes(32).toString('base64url');
  await sql`insert into reviews.review_access_tokens(organization_id,customer_id,order_line_id,product_id,token_hash) values(${input.organizationId},${e.customer_id}::uuid,${input.orderLineId}::uuid,${e.product_id}::uuid,${hash(token)})`.execute(
    db,
  );
  return { token, productId: e.product_id };
}
export async function submitReview(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    accessToken: string;
    rating: number;
    title?: string;
    body?: string;
    mediaAssetIds?: string[];
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
      throw new ReviewDomainError('VALIDATION_FAILED', 'Rating must be an integer from 1 to 5.');
    const access = await sql<{
      customer_id: string;
      product_id: string;
      order_line_id: string;
    }>`select customer_id,product_id,order_line_id from reviews.review_access_tokens where organization_id=${input.organizationId} and token_hash=${hash(input.accessToken)} and revoked_at is null and (expires_at is null or expires_at>now()) for update`.execute(
      tx,
    );
    const a = access.rows[0];
    if (!a)
      throw new ReviewDomainError('FORBIDDEN', 'Review access credential is invalid or expired.');
    const c = await claim(tx, input.organizationId, input.idempotencyKey, {
      ...input,
      accessToken: '[REDACTED]',
    });
    if (!c.created) throw new ReviewDomainError('CONFLICT', 'Review submission already processed.');
    const dup =
      await sql`select id from reviews.reviews where organization_id=${input.organizationId} and customer_id=${a.customer_id}::uuid and product_id=${a.product_id}::uuid and lifecycle_status='ACTIVE' for update`.execute(
        tx,
      );
    if (dup.rows[0])
      throw new ReviewDomainError(
        'CONFLICT',
        'Customer already has an active Review for this Product.',
      );
    const review = await sql<{
      id: string;
    }>`insert into reviews.reviews(organization_id,product_id,customer_id,verification_order_line_id) values(${input.organizationId},${a.product_id}::uuid,${a.customer_id}::uuid,${a.order_line_id}::uuid) returning id`.execute(
      tx,
    );
    const id = review.rows[0]?.id;
    if (!id) throw new Error('Review was not created.');
    const revision = await sql<{
      id: string;
    }>`insert into reviews.review_revisions(organization_id,review_id,revision_number,rating,title,body,public_display_name) values(${input.organizationId},${id}::uuid,1,${input.rating},${input.title ?? null},${input.body ?? null},'Verified customer') returning id`.execute(
      tx,
    );
    for (const assetId of input.mediaAssetIds ?? [])
      await sql`insert into reviews.review_media(organization_id,review_revision_id,media_asset_id) select ${input.organizationId},${revision.rows[0]?.id}::uuid,asset.id from media.media_assets asset where asset.organization_id=${input.organizationId} and asset.id=${assetId}::uuid`.execute(
        tx,
      );
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)values(${input.organizationId},'reviews.review.submitted',1,'reviews.review',${id}::uuid,1,${JSON.stringify({ reviewId: id })}::jsonb,now())`.execute(
      tx,
    );
    return { id, revisionId: revision.rows[0]?.id };
  });
}

/** A new guest revision remains pending while the last published revision stays public. */
export async function submitReviewRevision(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    accessToken: string;
    rating: number;
    title?: string;
    body?: string;
    mediaAssetIds?: string[];
  },
) {
  return db.transaction().execute(async (tx) => {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
      throw new ReviewDomainError('VALIDATION_FAILED', 'Rating must be an integer from 1 to 5.');
    const access = await sql<{
      customer_id: string;
      product_id: string;
    }>`select customer_id,product_id from reviews.review_access_tokens where organization_id=${input.organizationId} and token_hash=${hash(input.accessToken)} and revoked_at is null and (expires_at is null or expires_at>now()) for update`.execute(
      tx,
    );
    const credential = access.rows[0];
    if (!credential)
      throw new ReviewDomainError('FORBIDDEN', 'Review access credential is invalid or expired.');
    const review = await sql<{
      id: string;
    }>`select id from reviews.reviews where organization_id=${input.organizationId} and customer_id=${credential.customer_id}::uuid and product_id=${credential.product_id}::uuid and lifecycle_status='ACTIVE' for update`.execute(
      tx,
    );
    const current = review.rows[0];
    if (!current)
      throw new ReviewDomainError('NOT_FOUND', 'No active Review is available to revise.');
    const revisionNumber = await sql<{
      revision_number: number;
    }>`select coalesce(max(revision_number),0)::int as revision_number from reviews.review_revisions where review_id=${current.id}::uuid`.execute(
      tx,
    );
    const nextRevisionNumber = (revisionNumber.rows[0]?.revision_number ?? 0) + 1;
    const revision = await sql<{
      id: string;
    }>`insert into reviews.review_revisions(organization_id,review_id,revision_number,rating,title,body,public_display_name) values(${input.organizationId},${current.id}::uuid,${nextRevisionNumber},${input.rating},${input.title ?? null},${input.body ?? null},'Verified customer') returning id`.execute(
      tx,
    );
    const revisionId = revision.rows[0]?.id;
    if (!revisionId) throw new Error('Review revision was not created.');
    for (const assetId of input.mediaAssetIds ?? [])
      await sql`insert into reviews.review_media(organization_id,review_revision_id,media_asset_id) select ${input.organizationId},${revisionId}::uuid,asset.id from media.media_assets asset where asset.organization_id=${input.organizationId} and asset.id=${assetId}::uuid`.execute(
        tx,
      );
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values(${input.organizationId},'reviews.review.revision_submitted',1,'reviews.review',${current.id}::uuid,${nextRevisionNumber},${JSON.stringify({ reviewId: current.id, revisionId })}::jsonb,now())`.execute(
      tx,
    );
    return { reviewId: current.id, revisionId };
  });
}
export async function moderateReview(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    reviewId: string;
    revisionId: string;
    decision: 'APPROVE' | 'REJECT' | 'HIDE' | 'RESTORE';
    reason?: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    if (input.reason === 'NEGATIVE_REVIEW')
      throw new ReviewDomainError(
        'VALIDATION_FAILED',
        'Negative sentiment is never a moderation reason.',
      );
    const row = await sql<{
      product_id: string;
    }>`select product_id from reviews.reviews where organization_id=${input.organizationId} and id=${input.reviewId} for update`.execute(
      tx,
    );
    if (!row.rows[0]) throw new ReviewDomainError('NOT_FOUND', 'Review was not found.');
    if (input.decision === 'APPROVE') {
      const changed = await sql<{
        id: string;
      }>`update reviews.review_revisions set moderation_status='APPROVED',moderated_at=now(),moderated_by=${input.actorId}::uuid,moderation_reason=${input.reason ?? null} where organization_id=${input.organizationId} and id=${input.revisionId}::uuid and review_id=${input.reviewId}::uuid returning id`.execute(
        tx,
      );
      if (!changed.rows[0])
        throw new ReviewDomainError('NOT_FOUND', 'Review revision was not found.');
      await sql`update reviews.reviews set published_revision_id=${input.revisionId}::uuid,visibility_status='VISIBLE',version=version+1,updated_at=now() where id=${input.reviewId}::uuid`.execute(
        tx,
      );
    } else if (input.decision === 'REJECT') {
      const changed = await sql<{
        id: string;
      }>`update reviews.review_revisions set moderation_status='REJECTED',moderated_at=now(),moderated_by=${input.actorId}::uuid,moderation_reason=${input.reason ?? null} where organization_id=${input.organizationId} and id=${input.revisionId}::uuid and review_id=${input.reviewId}::uuid returning id`.execute(
        tx,
      );
      if (!changed.rows[0])
        throw new ReviewDomainError('NOT_FOUND', 'Review revision was not found.');
    } else
      await sql`update reviews.reviews set visibility_status=${input.decision === 'HIDE' ? 'HIDDEN' : 'VISIBLE'},version=version+1,updated_at=now() where id=${input.reviewId}::uuid`.execute(
        tx,
      );
    await rebuild(tx, input.organizationId, row.rows[0].product_id);
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: `reviews.review.${input.decision.toLowerCase()}`,
      targetType: 'reviews.review',
      targetId: input.reviewId,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    });
    return { reviewId: input.reviewId };
  });
}

export async function upsertMerchantResponse(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; reviewId: string; body: string },
) {
  if (!input.body.trim())
    throw new ReviewDomainError('VALIDATION_FAILED', 'Response body is required.');
  return db.transaction().execute(async (tx) => {
    const review = await sql<{
      id: string;
    }>`select id from reviews.reviews where id=${input.reviewId}::uuid and organization_id=${input.organizationId} and lifecycle_status='ACTIVE' for update`.execute(
      tx,
    );
    if (!review.rows[0]) throw new ReviewDomainError('NOT_FOUND', 'Review was not found.');
    const response = await sql<{
      id: string;
    }>`insert into reviews.merchant_responses(organization_id,review_id,body,created_by) values(${input.organizationId},${input.reviewId}::uuid,${input.body.trim()},${input.actorId}::uuid) on conflict(review_id) do update set body=excluded.body,status='VISIBLE',updated_at=now(),version=reviews.merchant_responses.version+1 returning id`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'reviews.merchant_response.upsert',
      targetType: 'reviews.review',
      targetId: input.reviewId,
    });
    return { id: response.rows[0]?.id };
  });
}
export async function listPublicReviews(
  db: Kysely<DatabaseSchema>,
  org: string,
  productId: string,
) {
  return (
    await sql<{
      id: string;
      rating: number;
      title: string | null;
      body: string | null;
      public_display_name: string;
      submitted_at: string;
      media_asset_ids: string[];
      merchant_response: string | null;
    }>`select review.id,revision.rating,revision.title,revision.body,revision.public_display_name,revision.submitted_at::text,coalesce(array_agg(asset.id) filter(where asset.id is not null),'{}') as media_asset_ids,max(response.body) filter(where response.status='VISIBLE') as merchant_response from reviews.reviews review join reviews.review_revisions revision on revision.id=review.published_revision_id left join reviews.review_media media on media.review_revision_id=revision.id left join media.media_assets asset on asset.id=media.media_asset_id and asset.organization_id=review.organization_id and asset.status='READY' and asset.visibility_class='PUBLIC' left join reviews.merchant_responses response on response.review_id=review.id and response.organization_id=review.organization_id and response.status='VISIBLE' where review.organization_id=${org} and review.product_id=${productId}::uuid and review.lifecycle_status='ACTIVE' and review.visibility_status='VISIBLE' and revision.moderation_status='APPROVED' group by review.id,revision.id order by review.created_at desc`.execute(
      db,
    )
  ).rows;
}
export async function getRatingSummary(db: Kysely<DatabaseSchema>, org: string, productId: string) {
  return (
    await sql<{
      rating_count: number;
      rating_sum: number;
      rating_1_count: number;
      rating_2_count: number;
      rating_3_count: number;
      rating_4_count: number;
      rating_5_count: number;
      average_rating: string | null;
    }>`select rating_count,rating_sum,rating_1_count,rating_2_count,rating_3_count,rating_4_count,rating_5_count,case when rating_count=0 then null else (rating_sum::numeric/rating_count)::numeric(10,4)::text end as average_rating from reviews.product_rating_summary where organization_id=${org} and product_id=${productId}::uuid`.execute(
      db,
    )
  ).rows[0];
}

export async function rebuildRatingSummary(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  productId: string,
) {
  await rebuild(db, organizationId, productId);
  return getRatingSummary(db, organizationId, productId);
}
export async function listModerationQueue(db: Kysely<DatabaseSchema>, org: string) {
  return (
    await sql`select review.id,review.product_id,revision.id as revision_id,revision.rating,revision.title,revision.body,revision.submitted_at::text from reviews.reviews review join reviews.review_revisions revision on revision.review_id=review.id where review.organization_id=${org} and revision.moderation_status='PENDING' order by revision.submitted_at`.execute(
      db,
    )
  ).rows;
}
export async function verifyReviewIntegrity(db: Kysely<DatabaseSchema>, org: string) {
  const issues: string[] = [];
  const duplicate =
    await sql`select 1 from reviews.reviews where organization_id=${org} and lifecycle_status='ACTIVE' group by customer_id,product_id having count(*)>1 limit 1`.execute(
      db,
    );
  if (duplicate.rows[0]) issues.push('ACTIVE_DUPLICATE_REVIEW');
  const drift =
    await sql`select 1 from reviews.product_rating_summary s where s.organization_id=${org} and s.rating_count<>(select count(*) from reviews.reviews r where r.organization_id=s.organization_id and r.product_id=s.product_id and r.visibility_status='VISIBLE' and r.published_revision_id is not null) limit 1`.execute(
      db,
    );
  if (drift.rows[0]) issues.push('RATING_SUMMARY_DRIFT');
  return issues;
}
