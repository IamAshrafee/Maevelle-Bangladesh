import { cache } from 'react';
import type {
  ApiEnvelope,
  ProductRatingSummaryDto,
  PublicReviewDto,
  StorefrontContextDto,
  StorefrontProductDto,
} from '@maevelle/contracts';

const internalApiUrl = (process.env.STOREFRONT_INTERNAL_API_URL ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);

export const storefrontPublicBaseUrl = (
  process.env.STOREFRONT_BASE_URL ?? 'http://localhost:8080'
).replace(/\/$/, '');

export const loadPublicStorefrontContext = cache(
  async (): Promise<StorefrontContextDto | undefined> => {
    try {
      const contextResponse = await fetch(`${internalApiUrl}/storefront/v1/context`, {
        cache: 'no-store',
      });
      if (!contextResponse.ok) return undefined;
      return ((await contextResponse.json()) as ApiEnvelope<StorefrontContextDto>).data;
    } catch {
      return undefined;
    }
  },
);

export const loadPublicProduct = cache(
  async (handle: string): Promise<StorefrontProductDto | undefined> => {
    try {
      const context = await loadPublicStorefrontContext();
      if (!context) return undefined;
      const productResponse = await fetch(
        `${internalApiUrl}/storefront/v1/products/${encodeURIComponent(handle)}?organizationId=${encodeURIComponent(context.organizationId)}&currency=${encodeURIComponent(context.currency)}`,
        { cache: 'no-store' },
      );
      if (!productResponse.ok) return undefined;
      return ((await productResponse.json()) as ApiEnvelope<StorefrontProductDto>).data;
    } catch {
      return undefined;
    }
  },
);

export const loadPublicProductReviews = cache(
  async (
    productId: string,
    organizationId: string,
    options?: { pageSize?: number },
  ): Promise<{ reviews: readonly PublicReviewDto[]; summary?: ProductRatingSummaryDto } | undefined> => {
    try {
      const pageSize = options?.pageSize ?? 5;
      const response = await fetch(
        `${internalApiUrl}/products/${encodeURIComponent(productId)}/reviews?organizationId=${encodeURIComponent(organizationId)}&pageSize=${pageSize}&sort=NEWEST`,
        { cache: 'no-store' },
      );
      if (!response.ok) return undefined;
      const result = (await response.json()) as ApiEnvelope<{
        reviews: readonly PublicReviewDto[];
        summary?: ProductRatingSummaryDto;
      }>;
      return result.data;
    } catch {
      return undefined;
    }
  },
);

