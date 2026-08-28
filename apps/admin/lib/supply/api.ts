export async function supplyRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
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
  new Intl.NumberFormat('en-BD').format(Number(value));

export const formatSupplyMoney = (value: string, currency: string) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    maximumFractionDigits: 4,
  }).format(Number(value));

export const formatSupplyDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(new Date(value))
    : 'Not set';

export const remainingSupplyQuantity = (allocated: string, received: string) =>
  Math.max(0, Number(allocated) - Number(received)).toString();
