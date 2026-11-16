'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface SetQueryParamsOptions {
  readonly scroll?: boolean;
  readonly replace?: boolean;
  readonly resetPage?: boolean;
}

/**
 * Synchronizes URL search parameters cleanly via `router.replace` (by default)
 * without polluting browser history on filter changes or mutating window.location directly.
 */
export function useQueryParamsSync() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();

  const setParams = useCallback(
    (
      updates: Record<string, string | number | boolean | null | undefined>,
      options: SetQueryParamsOptions = {},
    ) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '');

      if (options.resetPage) {
        next.delete('page');
      }

      for (const [key, rawValue] of Object.entries(updates)) {
        if (rawValue === undefined || rawValue === null || rawValue === '') {
          next.delete(key);
        } else {
          next.set(key, String(rawValue));
        }
      }

      const qs = next.toString();
      const target = qs ? `${pathname}?${qs}` : pathname;
      const scroll = options.scroll ?? false;

      if (options.replace === false) {
        router.push(target, { scroll });
      } else {
        router.replace(target, { scroll });
      }
    },
    [pathname, router, searchParams],
  );

  return {
    searchParams,
    setParams,
  };
}
