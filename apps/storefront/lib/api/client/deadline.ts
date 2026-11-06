import { requestStorefrontClient, type AcceptErrorData } from './http';

/** Cancellation/timeout does not prove a server-side write rolled back. */
export async function requestWithDeadline<T>(
  path: string,
  init: RequestInit,
  acceptErrorData?: AcceptErrorData,
): Promise<T> {
  const control = new AbortController();
  const cancel = () => control.abort();
  if (init.signal?.aborted) control.abort();
  init.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 15_000);
  try {
    return await requestStorefrontClient<T>(
      path,
      { ...init, signal: control.signal },
      acceptErrorData,
    );
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', cancel);
  }
}
