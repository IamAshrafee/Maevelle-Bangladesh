'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { ApiEnvelope, StorefrontContextDto } from '@maevelle/contracts';

type StorefrontContextState = {
  context?: StorefrontContextDto;
  loading: boolean;
  error?: string;
};

const StorefrontContext = createContext<StorefrontContextState>({ loading: true });

export function StorefrontContextProvider({ children }: { readonly children: React.ReactNode }) {
  const [state, setState] = useState<StorefrontContextState>({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/storefront/v1/context', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('The store is temporarily unavailable.');
        const body = (await response.json()) as ApiEnvelope<StorefrontContextDto>;
        setState({ context: body.data, loading: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          loading: false,
          error: error instanceof Error ? error.message : 'The store is temporarily unavailable.',
        });
      });
    return () => controller.abort();
  }, []);
  const value = useMemo(() => state, [state]);
  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefrontContext() {
  return useContext(StorefrontContext);
}

export function notifyCartChanged() {
  window.dispatchEvent(new CustomEvent('maevelle:cart-changed'));
}
