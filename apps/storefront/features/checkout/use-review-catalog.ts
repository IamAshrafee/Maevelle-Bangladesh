'use client';
import { useEffect, useState } from 'react';
import type { StorefrontProductDto, StorefrontContextDto } from '@maevelle/contracts';
import { requestWithDeadline } from '@/lib/api/client/deadline';
import type { CatalogReferences } from './foundation-types';
export function useReviewCatalog(handles: CatalogReferences) {
  const [products, setProducts] = useState<Readonly<Record<string, StorefrontProductDto>>>({});
  const handlesKey = JSON.stringify([...new Set(Object.values(handles))].sort());
  useEffect(() => {
    const abort = new AbortController();
    const unique: string[] = JSON.parse(handlesKey);
    if (!unique.length) return;
    const result: Record<string, StorefrontProductDto> = {};
    let cursor = 0;
    const context = requestWithDeadline<StorefrontContextDto>('/api/storefront/v1/context', {
      signal: abort.signal,
    });
    async function worker() {
      while (cursor < unique.length && !abort.signal.aborted) {
        const handle = unique[cursor++]!;
        try {
          const tenant = await context;
          const product = await requestWithDeadline<StorefrontProductDto>(
            `/api/storefront/v1/products/${encodeURIComponent(handle)}?organizationId=${encodeURIComponent(tenant.organizationId)}`,
            { signal: abort.signal },
          );
          if (product?.handle === handle && Array.isArray(product.variants))
            result[handle] = product;
        } catch {
          /* Missing public product is an honest unavailable label. */
        }
      }
    }
    void context.catch(() => undefined);
    void Promise.all(Array.from({ length: Math.min(3, unique.length) }, worker)).then(() => {
      if (!abort.signal.aborted) setProducts(result);
    });
    return () => abort.abort();
  }, [handlesKey]);
  return products;
}
