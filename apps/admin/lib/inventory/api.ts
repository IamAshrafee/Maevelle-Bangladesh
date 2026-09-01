export async function inventoryRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const adminPath = path.startsWith('/admin') ? path : `/admin${path}`;
  const response = await fetch(`/api${adminPath}`, {
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
      typeof error === 'string' ? error : (error?.message ?? 'This inventory action could not be completed.'),
    );
  }
  return body;
}

export const formatInventoryNumber = (value: string | number) =>
  new Intl.NumberFormat('en-BD').format(Number(value));

export const formatInventoryDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Not set';

export const calculateAvailableQuantity = (sellable: string, reserved: string) =>
  Math.max(0, Number(sellable) - Number(reserved)).toString();
