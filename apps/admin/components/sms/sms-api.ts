import type { ApiEnvelope } from '@maevelle/contracts';

export async function fetchSmsApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => undefined)) as
    ApiEnvelope<T> | { error?: { message?: string } } | undefined;
  if (!response.ok)
    throw new Error(
      payload && 'error' in payload
        ? (payload.error?.message ?? 'SMS operation failed.')
        : 'SMS operation failed.',
    );
  return (payload as ApiEnvelope<T>).data;
}

export function smsStatusTone(status: string) {
  if (status === 'DELIVERED') return 'bg-emerald-100 text-emerald-800';
  if (['FAILED', 'REJECTED', 'UNDELIVERABLE', 'EXPIRED'].includes(status))
    return 'bg-red-100 text-red-800';
  if (['ACCEPTED', 'QUEUED', 'PROCESSING', 'DELIVERY_DELAYED'].includes(status))
    return 'bg-amber-100 text-amber-800';
  if (['SUPPRESSED', 'SKIPPED_NO_PHONE', 'NOT_APPLICABLE', 'PENDING_MANUAL'].includes(status))
    return 'bg-slate-100 text-slate-700';
  return 'bg-purple-100 text-purple-800';
}
