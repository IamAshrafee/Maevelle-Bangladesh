'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  ApiEnvelope,
  CatalogVariantChoiceDto,
  CatalogVariantChoicePageDto,
} from '@maevelle/contracts';

import { supplyRequest } from '@/lib/supply/api';

const PAGE_SIZE = 24;

interface UseCatalogVariantChoicesOptions {
  readonly open: boolean;
  readonly initialItems?: readonly CatalogVariantChoiceDto[] | undefined;
}

export function useCatalogVariantChoices({
  open,
  initialItems = [],
}: UseCatalogVariantChoicesOptions) {
  const [query, setQueryState] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<readonly CatalogVariantChoiceDto[]>(initialItems);
  const [totalItems, setTotalItems] = useState(initialItems.length);
  const [totalPages, setTotalPages] = useState(initialItems.length ? 1 : 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setPage(1);
  }, []);

  const retry = useCallback(() => setRequestVersion((value) => value + 1), []);
  const loadMore = useCallback(() => {
    setPage((current) => (current < totalPages ? current + 1 : current));
  }, [totalPages]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError('');
        const params = new URLSearchParams({
          status: 'ACTIVE',
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (query.trim()) params.set('q', query.trim());

        void supplyRequest<ApiEnvelope<CatalogVariantChoicePageDto>>(
          `/admin/catalog/variant-choices?${params.toString()}`,
          { signal: controller.signal },
        )
          .then((response) => {
            if (controller.signal.aborted) return;
            setItems((current) =>
              page === 1
                ? response.data.items
                : [
                    ...current,
                    ...response.data.items.filter(
                      (candidate) => !current.some((item) => item.id === candidate.id),
                    ),
                  ],
            );
            setTotalItems(response.data.pagination.totalItems);
            setTotalPages(response.data.pagination.totalPages);
          })
          .catch((requestError: unknown) => {
            if (controller.signal.aborted) return;
            setError(
              requestError instanceof Error
                ? requestError.message
                : 'Catalog variants could not be loaded.',
            );
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      page === 1 ? 250 : 0,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, page, query, requestVersion]);

  return {
    query,
    setQuery,
    items,
    totalItems,
    loading,
    error,
    retry,
    hasMore: page < totalPages,
    loadMore,
  };
}
