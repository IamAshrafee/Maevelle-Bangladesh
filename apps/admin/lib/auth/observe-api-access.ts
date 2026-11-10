/** Observe access failures across existing transports without retrying any business request. */
export function observeAdminApiAccess(onRejected: (status: number) => void): () => void {
  const previous = window.fetch;
  const observed: typeof window.fetch = async (input, init) => {
    const response = await previous(input, init);
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      window.location.origin,
    );
    if (
      url.origin === window.location.origin &&
      url.pathname.startsWith('/api/admin/') &&
      url.pathname !== '/api/admin/context' &&
      [401, 403, 503].includes(response.status)
    ) {
      onRejected(response.status);
    }
    return response;
  };
  window.fetch = observed;
  return () => {
    if (window.fetch === observed) window.fetch = previous;
  };
}
