import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  formatSafeAuthorName,
  getCustomerReviewHistory,
  getOrderLinesReviewState,
  getRatingSummary,
  listAdminReviews,
  listPublicReviews,
  moderateReview,
  rebuildRatingSummary,
  ReviewDomainError,
  sanitizeReviewText,
  submitReview,
  submitReviewRevision,
  upsertMerchantResponse,
  verifyReviewIntegrity,
  withdrawReview,
} from './reviews.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 6,
});
afterAll(async () => database.close());

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

async function fixture(label: string) {
  const organization = await createOrganization(database.db, {
    code: `review-${label}-${crypto.randomUUID().slice(0, 8)}`,
    displayName: 'Reviews test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const type = await sql<{
    id: string;
  }>`insert into catalog.product_types(organization_id,code,name) values(${organization.id},${`review-${crypto.randomUUID().slice(0, 8)}`},'Review product') returning id`.execute(
    database.db,
  );
  const product = await sql<{
    id: string;
  }>`insert into catalog.products(organization_id,product_type_id,handle,title,status,publication_status,published_at) values(${organization.id},${type.rows[0]!.id},${`review-${crypto.randomUUID().slice(0, 8)}`},'Review product','ACTIVE','PUBLISHED',now()) returning id`.execute(
    database.db,
  );
  const customer = await sql<{
    id: string;
  }>`insert into customers.customers(organization_id,customer_number,display_name) values(${organization.id},${`CUS-${crypto.randomUUID().slice(0, 8)}`},'Verified buyer') returning id`.execute(
    database.db,
  );
  const email = `review-${crypto.randomUUID()}@example.test`;
  const user = await sql<{
    id: string;
  }>`insert into iam.users(name,email,email_normalized) values('Review moderator',${email},${email}) returning id`.execute(
    database.db,
  );
  const order = await sql<{
    id: string;
  }>`insert into orders.orders(organization_id,order_number,customer_id,currency_code,payment_method,subtotal_amount,discount_amount,total_amount) values(${organization.id},${`REV-${crypto.randomUUID().slice(0, 8)}`},${customer.rows[0]!.id}::uuid,'BDT','COD',100,0,100) returning id`.execute(
    database.db,
  );
  const line = await sql<{
    id: string;
  }>`insert into orders.order_lines(organization_id,order_id,product_id,quantity,sku_snapshot,product_title_snapshot,option_snapshot,unit_price,gross_amount,discount_amount,net_amount) values(${organization.id},${order.rows[0]!.id}::uuid,${product.rows[0]!.id}::uuid,1,'REV-SKU','Review product','[]'::jsonb,100,100,0,100) returning id`.execute(
    database.db,
  );
  const token = crypto.randomUUID();
  await sql`insert into reviews.review_access_tokens(organization_id,customer_id,order_line_id,product_id,token_hash) values(${organization.id},${customer.rows[0]!.id}::uuid,${line.rows[0]!.id}::uuid,${product.rows[0]!.id}::uuid,${tokenHash(token)})`.execute(
    database.db,
  );
  return {
    organizationId: organization.id,
    productId: product.rows[0]!.id,
    actorId: user.rows[0]!.id,
    token,
  };
}

describe('Reviews', () => {
  it('keeps customer submissions pending, preserves the published revision during an edit, and rebuilds exact ratings', async () => {
    const data = await fixture('revision');
    const privateAsset = await sql<{
      id: string;
    }>`insert into media.media_assets(
      organization_id,asset_type,visibility_class,status,original_filename,normalized_extension,
      upload_source,guest_owner_hash
    ) values (
      ${data.organizationId},'IMAGE','PRIVATE','READY','review-photo.jpg','jpg',
      'CUSTOMER_REVIEW',${tokenHash(data.token)}
    ) returning id`.execute(database.db);
    const submitted = await submitReview(database.db, {
      organizationId: data.organizationId,
      accessToken: data.token,
      rating: 1,
      title: 'Not good',
      body: 'A negative opinion is still eligible for review.',
      mediaAssetIds: [privateAsset.rows[0]!.id],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(await listPublicReviews(database.db, data.organizationId, data.productId)).toEqual([]);
    await expect(
      moderateReview(database.db, {
        organizationId: data.organizationId,
        actorId: data.actorId,
        reviewId: submitted.id,
        revisionId: submitted.revisionId!,
        decision: 'REJECT',
        reason: 'NEGATIVE_REVIEW',
      }),
    ).rejects.toBeInstanceOf(ReviewDomainError);
    await moderateReview(database.db, {
      organizationId: data.organizationId,
      actorId: data.actorId,
      reviewId: submitted.id,
      revisionId: submitted.revisionId!,
      decision: 'APPROVE',
    });
    expect(
      (await getRatingSummary(database.db, data.organizationId, data.productId))?.average_rating,
    ).toBe('1.0000');
    await submitReviewRevision(database.db, {
      organizationId: data.organizationId,
      accessToken: data.token,
      rating: 5,
      title: 'Updated opinion',
    });
    const publicReviews = await listPublicReviews(database.db, data.organizationId, data.productId);
    expect(publicReviews).toHaveLength(1);
    expect(publicReviews[0]?.rating).toBe(1);
    expect(publicReviews[0]?.media_asset_ids).toEqual([privateAsset.rows[0]!.id]);
    const adminReviews = await listAdminReviews(database.db, data.organizationId);
    expect(adminReviews).toHaveLength(1);
    expect(adminReviews[0]).toMatchObject({
      product_title: 'Review product',
      revision_number: 2,
      moderation_status: 'PENDING',
      verified_purchase: true,
    });
    await rebuildRatingSummary(database.db, data.organizationId, data.productId);
    expect(await verifyReviewIntegrity(database.db, data.organizationId)).toEqual([]);
  });

  it('only attaches ready customer uploads owned by the secure Review credential', async () => {
    const data = await fixture('media-ownership');
    const adminAsset = await sql<{ id: string }>`insert into media.media_assets(
      organization_id,asset_type,visibility_class,status,original_filename,normalized_extension,
      upload_source
    ) values (
      ${data.organizationId},'IMAGE','PUBLIC','READY','catalog.jpg','jpg','ADMIN_UPLOAD'
    ) returning id::text`.execute(database.db);

    await expect(
      submitReview(database.db, {
        organizationId: data.organizationId,
        accessToken: data.token,
        rating: 5,
        mediaAssetIds: [adminAsset.rows[0]!.id],
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('keeps review records and public aggregates tenant scoped', async () => {
    const a = await fixture('a');
    const b = await fixture('b');
    const submitted = await submitReview(database.db, {
      organizationId: b.organizationId,
      accessToken: b.token,
      rating: 5,
      idempotencyKey: crypto.randomUUID(),
    });
    await moderateReview(database.db, {
      organizationId: b.organizationId,
      actorId: b.actorId,
      reviewId: submitted.id,
      revisionId: submitted.revisionId!,
      decision: 'APPROVE',
    });
    expect(await listPublicReviews(database.db, a.organizationId, b.productId)).toEqual([]);
    expect(await listAdminReviews(database.db, a.organizationId)).toEqual([]);
    expect(await listAdminReviews(database.db, b.organizationId)).toHaveLength(1);
    await expect(
      moderateReview(database.db, {
        organizationId: a.organizationId,
        actorId: a.actorId,
        reviewId: submitted.id,
        revisionId: submitted.revisionId!,
        decision: 'HIDE',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('detects a stale aggregate and restores the projection from immutable approved facts', async () => {
    const data = await fixture('integrity');
    const submitted = await submitReview(database.db, {
      organizationId: data.organizationId,
      accessToken: data.token,
      rating: 4,
      idempotencyKey: crypto.randomUUID(),
    });
    await moderateReview(database.db, {
      organizationId: data.organizationId,
      actorId: data.actorId,
      reviewId: submitted.id,
      revisionId: submitted.revisionId!,
      decision: 'APPROVE',
    });
    await sql`update reviews.product_rating_summary set rating_count=2,rating_sum=8,rating_1_count=0,rating_2_count=0,rating_3_count=0,rating_4_count=2,rating_5_count=0 where organization_id=${data.organizationId} and product_id=${data.productId}::uuid`.execute(
      database.db,
    );
    expect(await verifyReviewIntegrity(database.db, data.organizationId)).toContain(
      'RATING_SUMMARY_DRIFT',
    );
    await rebuildRatingSummary(database.db, data.organizationId, data.productId);
    expect(await verifyReviewIntegrity(database.db, data.organizationId)).toEqual([]);
  });

  it('enforces privacy-safe author name formatting and text sanitization', () => {
    expect(formatSafeAuthorName('Nusrat Jahan')).toBe('Nusrat J.');
    expect(formatSafeAuthorName('Ashrafee')).toBe('Ashrafee');
    expect(formatSafeAuthorName(null)).toBe('Verified customer');
    expect(formatSafeAuthorName('')).toBe('Verified customer');

    const dirty = '<script>alert("hack")</script>Loved this <b>dress</b>!\x00\x08';
    expect(sanitizeReviewText(dirty, 100)).toBe('Loved this dress!');
  });

  it('enforces invariant REV-INV-009: exactly one active review per customer per product', async () => {
    const data = await fixture('single-active');
    await submitReview(database.db, {
      organizationId: data.organizationId,
      accessToken: data.token,
      rating: 5,
      title: 'First review',
      body: 'Great fit and quality.',
      idempotencyKey: crypto.randomUUID(),
    });

    // Create a second token for the same customer and product
    const secondToken = crypto.randomUUID();
    const customer = await sql<{ id: string }>`
      select customer_id::text from reviews.review_access_tokens
      where organization_id = ${data.organizationId} and token_hash = ${tokenHash(data.token)}
    `.execute(database.db);
    const line = await sql<{ id: string }>`
      select order_line_id::text from reviews.review_access_tokens
      where organization_id = ${data.organizationId} and token_hash = ${tokenHash(data.token)}
    `.execute(database.db);

    await sql`
      insert into reviews.review_access_tokens (organization_id, customer_id, order_line_id, product_id, token_hash)
      values (${data.organizationId}, ${customer.rows[0]!.id}::uuid, ${line.rows[0]!.id}::uuid, ${data.productId}::uuid, ${tokenHash(secondToken)})
    `.execute(database.db);

    // Attempting a second active review must throw CONFLICT
    await expect(
      submitReview(database.db, {
        organizationId: data.organizationId,
        accessToken: secondToken,
        rating: 4,
        title: 'Duplicate review attempt',
        body: 'Should be rejected by REV-INV-009.',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('handles customer review withdrawal, unpublishes from rating aggregates, and maintains history', async () => {
    const data = await fixture('withdrawal');
    const submitted = await submitReview(database.db, {
      organizationId: data.organizationId,
      accessToken: data.token,
      rating: 5,
      title: 'To be withdrawn',
      idempotencyKey: crypto.randomUUID(),
    });
    await moderateReview(database.db, {
      organizationId: data.organizationId,
      actorId: data.actorId,
      reviewId: submitted.id,
      revisionId: submitted.revisionId,
      decision: 'APPROVE',
    });

    const summaryBefore = await getRatingSummary(database.db, data.organizationId, data.productId);
    expect(summaryBefore?.ratingCount).toBe(1);
    expect(summaryBefore?.averageRating).toBe('5.0000');

    // Withdraw the review using customer credentials
    const withdrawn = await withdrawReview(database.db, {
      organizationId: data.organizationId,
      reviewId: submitted.id,
      accessToken: data.token,
      reason: 'Customer requested removal',
    });
    expect(withdrawn.reviewId).toBe(submitted.id);

    // Summary must immediately update to 0 ratings
    const summaryAfter = await getRatingSummary(database.db, data.organizationId, data.productId);
    expect(summaryAfter?.ratingCount).toBe(0);
    expect(summaryAfter?.averageRating).toBeNull();

    // Public listing must exclude withdrawn review
    const publicReviews = await listPublicReviews(database.db, data.organizationId, data.productId);
    expect(publicReviews).toHaveLength(0);
  });

  it('supports merchant responses and deep customer / order review queries', async () => {
    const data = await fixture('merchant-response');
    const submitted = await submitReview(database.db, {
      organizationId: data.organizationId,
      accessToken: data.token,
      rating: 4,
      title: 'Good delivery',
      body: 'Arrived nicely packaged.',
      idempotencyKey: crypto.randomUUID(),
    });
    await moderateReview(database.db, {
      organizationId: data.organizationId,
      actorId: data.actorId,
      reviewId: submitted.id,
      revisionId: submitted.revisionId,
      decision: 'APPROVE',
    });

    // Upsert merchant response
    const response = await upsertMerchantResponse(database.db, {
      organizationId: data.organizationId,
      actorId: data.actorId,
      reviewId: submitted.id,
      body: 'Thank you for your valuable feedback! We are thrilled you loved the packaging.',
    });
    expect(response.id).toBeDefined();

    // Verify public review includes the official response
    const publicReviews = await listPublicReviews(database.db, data.organizationId, data.productId);
    expect(publicReviews).toHaveLength(1);
    expect(publicReviews[0]?.merchant_response).toContain('valuable feedback');

    // Verify customer review history
    const customer = await sql<{ id: string }>`
      select customer_id::text from reviews.review_access_tokens
      where organization_id = ${data.organizationId} and token_hash = ${tokenHash(data.token)}
    `.execute(database.db);
    const history = await getCustomerReviewHistory(database.db, data.organizationId, customer.rows[0]!.id);
    expect(history.items).toHaveLength(1);
    expect(history.metrics.totalSubmitted).toBe(1);
    expect(history.metrics.averageRatingGiven).toBe(4);

    // Verify order lines review state
    const order = await sql<{ id: string }>`
      select o.id::text from orders.orders o
      join reviews.review_access_tokens rat on rat.customer_id = o.customer_id
      where rat.token_hash = ${tokenHash(data.token)}
      limit 1
    `.execute(database.db);
    const orderReviewState = await getOrderLinesReviewState(database.db, data.organizationId, order.rows[0]!.id);
    expect(orderReviewState).toHaveLength(1);
    expect(orderReviewState[0]?.reviewSubmitted).toBe(true);
    expect(orderReviewState[0]?.reviewRating).toBe(4);
  });
});
