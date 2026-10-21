import { formatQuantity, subtractDecimals } from '@/lib/format/numbers';

export class InventoryRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly requestId: string | undefined;

  constructor(input: {
    readonly message: string;
    readonly status: number;
    readonly code?: string;
    readonly requestId?: string;
  }) {
    super(input.message);
    this.name = 'InventoryRequestError';
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId;
  }
}

export function isInventoryConflictError(error: unknown): error is InventoryRequestError {
  return (
    error instanceof InventoryRequestError &&
    (error.status === 409 ||
      error.code === 'CONFLICT' ||
      error.code === 'STALE_VERSION' ||
      error.code === 'RESERVATION_CONFLICT')
  );
}

export async function inventoryRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const adminPath = path.startsWith('/admin') ? path : `/admin${path}`;
  const response = await fetch(`/api${adminPath}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: { code?: string; message?: string; requestId?: string } | string;
  };
  if (!response.ok) {
    const error = body.error;
    throw new InventoryRequestError({
      message:
        typeof error === 'string'
          ? error
          : (error?.message ?? 'This inventory action could not be completed.'),
      status: response.status,
      ...(typeof error === 'object' && error?.code ? { code: error.code } : {}),
      ...(typeof error === 'object' && error?.requestId ? { requestId: error.requestId } : {}),
    });
  }
  return body;
}

export const formatInventoryNumber = (value: string | number) => formatQuantity(value);

export const formatInventoryDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : 'Not set';

export const calculateAvailableQuantity = (sellable: string, reserved: string) =>
  subtractDecimals(sellable, reserved);
