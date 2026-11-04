'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  CheckoutDraftDto,
  StorefrontProductDto,
  StorefrontContextDto,
} from '@maevelle/contracts';
import { requestWithDeadline } from '@/lib/api/client/deadline';
import type { CatalogReferences } from '../foundation-types';

/** Public catalog labels only; price fields are deliberately never rendered as a quote. */
export function ReviewItems({
  draft,
  handles,
}: {
  draft: CheckoutDraftDto;
  handles: CatalogReferences;
}) {
  const [products, setProducts] = useState<Readonly<Record<string, StorefrontProductDto>>>({});
  useEffect(() => {
    const abort = new AbortController();
    const unique = [
      ...new Set(
        draft.lines.map((line) => handles[line.variantId]).filter((v): v is string => Boolean(v)),
      ),
    ];
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
  }, [draft, handles]);
  return (
    <ul className="divide-y divide-border-subtle" aria-label="Selected items">
      {draft.lines.map((line, index) => {
        const handle = handles[line.variantId],
          product = handle ? products[handle] : undefined;
        const variant = product?.variants.find((v) => v.id === line.variantId);
        return (
          <li key={line.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
            <div className="min-w-0 flex-1 basis-48">
              {product ? (
                <Link
                  href={`/products/${product.handle}`}
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  {product.title}
                </Link>
              ) : (
                <p className="font-semibold">Item {index + 1} · Product details unavailable</p>
              )}
              {variant && (
                <p className="mt-1 text-sm text-on-surface-variant">SKU: {variant.sku}</p>
              )}
            </div>
            <p className="text-sm tabular-nums">
              Quantity <strong>{line.quantity}</strong>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
