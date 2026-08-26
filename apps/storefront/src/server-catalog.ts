import { cache } from 'react';

import type { ApiEnvelope, StorefrontContextDto, StorefrontProductDto } from '@maevelle/contracts';

const internalApiUrl = (process.env.STOREFRONT_INTERNAL_API_URL ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);

export const storefrontPublicBaseUrl = (
  process.env.STOREFRONT_BASE_URL ?? 'http://localhost:8080'
).replace(/\/$/, '');

export const loadPublicProduct = cache(
  async (handle: string): Promise<StorefrontProductDto | undefined> => {
    try {
      const contextResponse = await fetch(`${internalApiUrl}/storefront/v1/context`, {
        cache: 'no-store',
      });
      if (!contextResponse.ok) return undefined;
      const context = ((await contextResponse.json()) as ApiEnvelope<StorefrontContextDto>).data;
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
