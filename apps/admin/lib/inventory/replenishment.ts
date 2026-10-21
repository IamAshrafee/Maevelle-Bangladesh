import type {
  ReplenishmentPolicyDto,
  ReplenishmentPolicyInput,
  ReplenishmentPolicyListDto,
  ReplenishmentRecommendationListDto,
} from '@maevelle/contracts';

import { inventoryRequest } from './api';

export interface ReplenishmentQuery {
  readonly search?: string;
  readonly locationId?: string;
  readonly attentionOnly?: boolean;
  readonly page?: number;
  readonly limit?: number;
}

function queryString(input: ReplenishmentQuery): string {
  const params = new URLSearchParams();
  if (input.search) params.set('search', input.search);
  if (input.locationId) params.set('locationId', input.locationId);
  if (input.attentionOnly !== undefined)
    params.set('attentionOnly', String(input.attentionOnly));
  if (input.page) params.set('page', String(input.page));
  if (input.limit) params.set('limit', String(input.limit));
  return params.toString();
}

export async function listReplenishmentRecommendations(
  input: ReplenishmentQuery,
  signal?: AbortSignal,
): Promise<ReplenishmentRecommendationListDto> {
  const query = queryString(input);
  const response = await inventoryRequest<{ data: ReplenishmentRecommendationListDto }>(
    `/inventory/replenishment-recommendations${query ? `?${query}` : ''}`,
    signal ? { signal } : undefined,
  );
  return response.data;
}

export async function listReplenishmentPolicies(
  input: Omit<ReplenishmentQuery, 'attentionOnly'> & { readonly inventoryItemId?: string },
  signal?: AbortSignal,
): Promise<ReplenishmentPolicyListDto> {
  const query = new URLSearchParams(queryString(input));
  if (input.inventoryItemId) query.set('inventoryItemId', input.inventoryItemId);
  const response = await inventoryRequest<{ data: ReplenishmentPolicyListDto }>(
    `/inventory/replenishment-policies${query.size ? `?${query.toString()}` : ''}`,
    signal ? { signal } : undefined,
  );
  return response.data;
}

export async function saveReplenishmentPolicy(
  input: ReplenishmentPolicyInput,
): Promise<ReplenishmentPolicyDto> {
  const response = await inventoryRequest<{ data: ReplenishmentPolicyDto }>(
    '/inventory/replenishment-policies',
    {
      method: 'PUT',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function resetReplenishmentPolicy(
  policyId: string,
  expectedVersion: number,
): Promise<void> {
  await inventoryRequest(`/inventory/replenishment-policies/${encodeURIComponent(policyId)}`, {
    method: 'DELETE',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ expectedVersion }),
  });
}
