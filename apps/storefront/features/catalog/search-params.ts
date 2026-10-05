import type { StorefrontAvailabilityFilterDto, StorefrontSearchSortDto } from '@maevelle/contracts';

import type { StorefrontSearchQuery } from '@/lib/api/server/catalog';

export type StorefrontSearchParams = Record<string, string | string[] | undefined>;

const moneyPattern = /^\d+(?:\.\d{1,4})?$/;
const sorts = new Set<StorefrontSearchSortDto>(['RELEVANCE', 'NEWEST', 'PRICE_ASC', 'PRICE_DESC']);
const availabilityValues = new Set<StorefrontAvailabilityFilterDto>(['IN_STOCK', 'OUT_OF_STOCK']);

export function firstParameter(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed || undefined;
}

export function parseCatalogSearchParams(
  parameters: StorefrontSearchParams,
): StorefrontSearchQuery {
  const query = firstParameter(parameters.q)?.slice(0, 120);
  const minimumPrice = firstParameter(parameters.minimumPrice);
  const maximumPrice = firstParameter(parameters.maximumPrice);
  const availability = firstParameter(parameters.availability) as
    StorefrontAvailabilityFilterDto | undefined;
  const sort = firstParameter(parameters.sort) as StorefrontSearchSortDto | undefined;
  const pageValue = Number(firstParameter(parameters.page));

  return {
    ...(query ? { query } : {}),
    ...(minimumPrice && moneyPattern.test(minimumPrice) ? { minimumPrice } : {}),
    ...(maximumPrice && moneyPattern.test(maximumPrice) ? { maximumPrice } : {}),
    ...(availability && availabilityValues.has(availability) ? { availability } : {}),
    ...(sort && sorts.has(sort) ? { sort } : {}),
    ...(Number.isInteger(pageValue) && pageValue > 1 ? { page: pageValue } : {}),
  };
}

export function catalogHref(
  pathname: string,
  query: StorefrontSearchQuery,
  overrides: Partial<Record<keyof StorefrontSearchQuery, string | number | undefined>> = {},
): string {
  const values = { ...query, ...overrides };
  const parameters = new URLSearchParams();
  if (values.query) parameters.set('q', String(values.query));
  if (values.minimumPrice) parameters.set('minimumPrice', String(values.minimumPrice));
  if (values.maximumPrice) parameters.set('maximumPrice', String(values.maximumPrice));
  if (values.availability) parameters.set('availability', String(values.availability));
  if (values.sort) parameters.set('sort', String(values.sort));
  if (values.page && Number(values.page) > 1) parameters.set('page', String(values.page));
  const suffix = parameters.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}
