'use client';
import { useEffect, useState } from 'react';
import { useAdminContext } from '../admin-capabilities';
import { fetchApiData } from '@/lib/api';
import { paymentError } from '@/lib/payments/transport';
export function usePaymentQuery<T>(path: string | null) {
  const context = useAdminContext();
  const owner = `${context.organizationId}:${context.actorId}:${context.capabilities.join(',')}:${JSON.stringify(context.scopes)}`;
  const key = `${owner}:${path}`;
  const [revision, refresh] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key: '' });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void fetchApiData<T>(path, {
      signal: controller.signal,
      headers: { 'x-organization-id': context.organizationId },
    }).then(
      (data) => {
        if (!controller.signal.aborted) setState({ key, data });
      },
      (error) => {
        if (!controller.signal.aborted) setState({ key, error: paymentError(error) });
      },
    );
    return () => controller.abort();
  }, [path, key, revision, context.organizationId]);
  return {
    data: path && state.key === key ? state.data : undefined,
    error: state.key === key ? state.error : undefined,
    loading: Boolean(path && state.key !== key),
    refresh: () => {
      setState({ key: '' });
      refresh((n) => n + 1);
    },
  };
}
export function usePaymentPermission(capability: string) {
  const c = useAdminContext();
  return (
    c.capabilities.includes(capability) &&
    !c.scopes.some((s) => s.capabilityCode === null || s.capabilityCode === capability)
  );
}
