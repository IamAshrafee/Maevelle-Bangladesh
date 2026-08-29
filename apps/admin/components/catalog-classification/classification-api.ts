import type {
  CatalogCategoryListDto,
  CatalogCategoryStatusDto,
  CatalogVocabularyKindDto,
  CatalogVocabularyListDto,
} from '@maevelle/contracts';

export class ClassificationRequestError extends Error {
  public constructor(
    message: string,
    public readonly code: string | undefined,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ClassificationRequestError';
  }
}

export async function classificationRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string } | string;
    };
    const code = typeof body.error === 'object' ? body.error.code : body.error;
    const detail = typeof body.error === 'object' ? (body.error.message ?? code) : body.error;
    throw new ClassificationRequestError(
      detail ?? 'This catalog change could not be completed.',
      code,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return ((await response.json()) as { data: T }).data;
}

function listParameters(input: {
  page: number;
  pageSize?: number;
  query?: string;
  status?: CatalogCategoryStatusDto | 'ALL';
}): URLSearchParams {
  const parameters = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize ?? 25),
  });
  if (input.query?.trim()) parameters.set('q', input.query.trim());
  if (input.status && input.status !== 'ALL') parameters.set('status', input.status);
  return parameters;
}

export function categoryListPath(input: {
  page: number;
  pageSize?: number;
  query?: string;
  status?: CatalogCategoryStatusDto | 'ALL';
}): string {
  return `/admin/catalog/category-tree?${listParameters(input).toString()}`;
}

export function vocabularyListPath(input: {
  kind: CatalogVocabularyKindDto;
  page: number;
  pageSize?: number;
  query?: string;
  status?: CatalogCategoryStatusDto | 'ALL';
}): string {
  return `/admin/catalog/vocabulary/${input.kind}?${listParameters(input).toString()}`;
}

export type ClassificationList = CatalogCategoryListDto | CatalogVocabularyListDto;

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
