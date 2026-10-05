import 'server-only';

import { cache } from 'react';

import type {
  ProductRatingSummaryDto,
  PublicReviewDto,
  PublicSizeGuideDto,
  StorefrontCategoryDto,
  StorefrontContextDto,
  StorefrontProductDto,
  StorefrontSearchResultDto,
  StorefrontSearchSortDto,
} from '@maevelle/contracts';

import { requestStorefrontApi, StorefrontApiError } from '@/lib/api/server/http';

export interface StorefrontSearchQuery {
  readonly query?: string;
  readonly categoryId?: string;
  readonly minimumPrice?: string;
  readonly maximumPrice?: string;
  readonly availability?: 'IN_STOCK' | 'OUT_OF_STOCK';
  readonly sort?: StorefrontSearchSortDto;
  readonly page?: number;
}

function catalogTag(organizationId: string): string {
  return `storefront:catalog:${organizationId}`;
}

export const loadPublicStorefrontContext = cache(async (): Promise<StorefrontContextDto> =>
  requestStorefrontApi<StorefrontContextDto>('/storefront/v1/context', {
    cache: 'force-cache',
    next: { revalidate: 300, tags: ['storefront:context'] },
  }),
);

export const loadPublicCategories = cache(
  async (organizationId: string): Promise<readonly StorefrontCategoryDto[]> =>
    requestStorefrontApi<readonly StorefrontCategoryDto[]>(
      `/storefront/v1/categories?organizationId=${encodeURIComponent(organizationId)}`,
      {
        cache: 'force-cache',
        next: { revalidate: 300, tags: [catalogTag(organizationId)] },
      },
    ),
);

export async function searchPublicCatalog(
  organizationId: string,
  query: StorefrontSearchQuery = {},
): Promise<StorefrontSearchResultDto> {
  const parameters = new URLSearchParams({ organizationId });
  if (query.query) parameters.set('q', query.query);
  if (query.categoryId) parameters.set('categoryId', query.categoryId);
  if (query.minimumPrice) parameters.set('minimumPrice', query.minimumPrice);
  if (query.maximumPrice) parameters.set('maximumPrice', query.maximumPrice);
  if (query.availability) parameters.set('availability', query.availability);
  if (query.sort) parameters.set('sort', query.sort);
  if (query.page) parameters.set('page', String(query.page));

  return requestStorefrontApi<StorefrontSearchResultDto>(
    `/storefront/v1/search?${parameters.toString()}`,
    {
      cache: 'force-cache',
      next: { revalidate: 60, tags: [catalogTag(organizationId)] },
    },
  );
}

export const loadPublicProduct = cache(
  async (handle: string): Promise<StorefrontProductDto | undefined> => {
    const context = await loadPublicStorefrontContext();
    try {
      return await requestStorefrontApi<StorefrontProductDto>(
        `/storefront/v1/products/${encodeURIComponent(handle)}?organizationId=${encodeURIComponent(context.organizationId)}&currency=${encodeURIComponent(context.currency)}`,
        { cache: 'no-store' },
      );
    } catch (error) {
      if (error instanceof StorefrontApiError && error.status === 404) return undefined;
      throw error;
    }
  },
);

export const loadPublicSizeGuide = cache(
  async (handle: string, organizationId: string): Promise<PublicSizeGuideDto | null> => {
    try {
      return await requestStorefrontApi<PublicSizeGuideDto | null>(
        `/storefront/v1/products/${encodeURIComponent(handle)}/size-guide?organizationId=${encodeURIComponent(organizationId)}`,
        {
          cache: 'force-cache',
          next: { revalidate: 300, tags: [catalogTag(organizationId)] },
        },
      );
    } catch {
      // Fit guidance is important but optional; the purchasable product remains usable without it.
      return null;
    }
  },
);

export const loadPublicProductReviews = cache(
  async (
    productId: string,
    organizationId: string,
    pageSize = 5,
  ): Promise<
    { reviews: readonly PublicReviewDto[]; summary?: ProductRatingSummaryDto } | undefined
  > => {
    try {
      return await requestStorefrontApi<{
        reviews: readonly PublicReviewDto[];
        summary?: ProductRatingSummaryDto;
      }>(
        `/products/${encodeURIComponent(productId)}/reviews?organizationId=${encodeURIComponent(organizationId)}&pageSize=${pageSize}&sort=NEWEST`,
        { cache: 'no-store' },
      );
    } catch {
      // Reviews are an optional enhancement and must not make the product route unavailable.
      return undefined;
    }
  },
);
