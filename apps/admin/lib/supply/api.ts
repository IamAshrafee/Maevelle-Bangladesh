import { formatMoney, formatQuantity, subtractDecimals } from '@/lib/format/numbers';

export async function supplyRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body !== undefined && !headers['content-type'] && !headers['Content-Type']) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string } | string;
  };
  if (!response.ok) {
    const error = body.error;
    throw new Error(
      typeof error === 'string' ? error : (error?.message ?? 'This action could not be completed.'),
    );
  }
  return body;
}

export const formatSupplyNumber = (value: string) =>
  formatQuantity(value);

export const formatSupplyMoney = (value: string, currency: string) =>
  formatMoney(value, currency);

export const formatSupplyDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(new Date(value))
    : 'Not set';

export const remainingSupplyQuantity = (allocated: string, received: string) =>
  subtractDecimals(allocated, received);
