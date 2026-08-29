'use client';

import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Grid2X2,
  Image,
  PackageSearch,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Tags,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useDeferredValue, useEffect, useRef, useState } from 'react';

import type {
  ApiEnvelope,
  CatalogCategoryChoiceDto,
  CatalogProductUpdateDto,
  CatalogProductWorkItemDto,
  CatalogProductWorklistDto,
  CatalogProductSummaryDto,
  CatalogProductWorkspaceDto,
  CatalogVocabularyItemDto,
  CatalogVocabularyListDto,
} from '@maevelle/contracts';

import {
  catalogContentFromWorkspace,
  catalogContentPayload,
  isCatalogContentDirty,
  mergeCatalogContent,
  useCurrentCatalogContentConflicts,
  type CatalogContentConflict,
  type CatalogContentValues,
} from '@/components/catalog-content-state';
import { CatalogContentEditor } from '@/components/catalog-content-editor';
import { ProductTypeManager } from '@/components/catalog-product-types/product-type-manager';
import {
  catalogOverviewFromWorkspace,
  isCatalogOverviewDirty,
  mergeCatalogOverview,
  type CatalogOverviewConflict,
  type CatalogOverviewField,
  type CatalogOverviewValues,
} from '@/components/catalog-overview-state';
import {
  areCatalogAttributesDirty,
  areCatalogCategoriesDirty,
  areCatalogVocabularyDirty,
  catalogOrganizationFromWorkspace,
  isCatalogOrganizationDirty,
  mergeCatalogOrganization,
  useCurrentCatalogOrganizationConflicts,
  type CatalogOrganizationConflict,
  type CatalogOrganizationValues,
} from '@/components/catalog-organization-state';
import { StatusBadge } from '@/components/status-badge';
import { Stats, StatsCard, StatsTitle, StatsValue } from '@/components/ui/stats';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProductType {
  id: string;
  code: string;
  name: string;
}

const productStatuses = ['ALL', 'DRAFT', 'ACTIVE', 'PUBLISHED', 'ARCHIVED'] as const;
const readinessStates = ['ALL', 'READY', 'BLOCKED', 'ATTENTION'] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function allowedUrlValue(value: string | null, allowed: readonly string[]): string {
  return value && allowed.includes(value) ? value : 'ALL';
}

class ApiRequestError extends Error {
  public constructor(
    message: string,
    public readonly code: string | undefined,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new ApiRequestError(
      detail ?? 'The requested catalog operation could not be completed.',
      code,
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

export function CatalogConsole() {
  const [products, setProducts] = useState<readonly CatalogProductWorkItemDto[]>([]);
  const [types, setTypes] = useState<readonly ProductType[]>([]);
  const [categories, setCategories] = useState<readonly CatalogCategoryChoiceDto[]>([]);
  const [vocabularyChoices, setVocabularyChoices] = useState<{
    readonly tags: readonly CatalogVocabularyItemDto[];
    readonly occasions: readonly CatalogVocabularyItemDto[];
    readonly collections: readonly CatalogVocabularyItemDto[];
  }>({ tags: [], occasions: [], collections: [] });
  const [message, setMessage] = useState('Loading Products…');
  const [typeId, setTypeId] = useState('');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [readiness, setReadiness] = useState('ALL');
  const [page, setPage] = useState(1);
  const [urlReady, setUrlReady] = useState(false);
  const [worklist, setWorklist] = useState<CatalogProductWorklistDto>({
    items: [],
    pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
    summary: { total: 0, published: 0, drafts: 0, archived: 0 },
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [createDirty, setCreateDirty] = useState(false);
  const [createCategoryIds, setCreateCategoryIds] = useState<readonly string[]>([]);
  const [createPrimaryCategoryId, setCreatePrimaryCategoryId] = useState('');
  const [createVocabulary, setCreateVocabulary] = useState<{
    readonly tagIds: readonly string[];
    readonly occasionIds: readonly string[];
    readonly collectionIds: readonly string[];
  }>({ tagIds: [], occasionIds: [], collectionIds: [] });
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const createDrawerRef = useRef<HTMLElement>(null);
  const createWasOpen = useRef(false);
  const [selected, setSelected] = useState<CatalogProductSummaryDto>();
  const [workspace, setWorkspace] = useState<CatalogProductWorkspaceDto>();
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [overviewBaseline, setOverviewBaseline] = useState<CatalogOverviewValues>();
  const [overviewDraft, setOverviewDraft] = useState<CatalogOverviewValues>();
  const [overviewConflicts, setOverviewConflicts] = useState<
    Partial<Record<CatalogOverviewField, CatalogOverviewConflict>>
  >({});
  const [overviewError, setOverviewError] = useState('');
  const [organizationBaseline, setOrganizationBaseline] = useState<CatalogOrganizationValues>();
  const [organizationDraft, setOrganizationDraft] = useState<CatalogOrganizationValues>();
  const [organizationConflicts, setOrganizationConflicts] = useState<
    readonly CatalogOrganizationConflict[]
  >([]);
  const [organizationError, setOrganizationError] = useState('');
  const [contentBaseline, setContentBaseline] = useState<CatalogContentValues>();
  const [contentDraft, setContentDraft] = useState<CatalogContentValues>();
  const [contentConflicts, setContentConflicts] = useState<readonly CatalogContentConflict[]>([]);
  const [contentError, setContentError] = useState('');
  const [contentDialogDirty, setContentDialogDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const overviewDirty = isCatalogOverviewDirty(overviewBaseline, overviewDraft);
  const organizationDirty = isCatalogOrganizationDirty(organizationBaseline, organizationDraft);
  const categoriesDirty = areCatalogCategoriesDirty(organizationBaseline, organizationDraft);
  const vocabularyDirty = areCatalogVocabularyDirty(organizationBaseline, organizationDraft);
  const attributesDirty = areCatalogAttributesDirty(organizationBaseline, organizationDraft);
  const contentDirty = isCatalogContentDirty(contentBaseline, contentDraft);
  const workspaceDirty = overviewDirty || organizationDirty || contentDirty || contentDialogDirty;
  const hasUnsavedChanges = workspaceDirty || createDirty;

  const loadProductTypes = async () => {
    const result = await request<ApiEnvelope<readonly ProductType[]>>(
      '/admin/catalog/product-types',
    );
    setTypes(result.data);
    setTypeId((current) =>
      result.data.some((type) => type.id === current) ? current : (result.data[0]?.id ?? ''),
    );
    if (typeFilter !== 'ALL' && !result.data.some((type) => type.id === typeFilter))
      setTypeFilter('ALL');
    return result.data;
  };

  const productTypesChanged = async () => {
    await loadProductTypes();
    if (selected) await openProductById(selected.id);
    await reload();
    setMessage('Product Type definitions updated.');
  };

  const reload = async (signal?: AbortSignal) => {
    try {
      const parameters = new URLSearchParams({
        status,
        readiness,
        page: String(page),
        pageSize: '25',
      });
      if (deferredQuery.trim()) parameters.set('q', deferredQuery.trim());
      if (typeFilter !== 'ALL') parameters.set('productTypeId', typeFilter);
      const productResult = await request<ApiEnvelope<CatalogProductWorklistDto>>(
        `/admin/catalog/product-work-items?${parameters.toString()}`,
        signal ? { signal } : undefined,
      );
      setProducts(productResult.data.items);
      setWorklist(productResult.data);
      setMessage('');
      return productResult.data.items;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return [];
      setMessage(error instanceof Error ? error.message : 'Unable to load the Product catalog.');
      return [];
    }
  };

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    setCreateOpen(parameters.get('create') === 'product');
    setQuery((parameters.get('q') ?? '').slice(0, 120));
    setStatus(allowedUrlValue(parameters.get('status'), productStatuses));
    const requestedType = parameters.get('type');
    setTypeFilter(requestedType && uuidPattern.test(requestedType) ? requestedType : 'ALL');
    setReadiness(allowedUrlValue(parameters.get('readiness'), readinessStates));
    setPage(Math.max(1, Number(parameters.get('page') ?? 1) || 1));
    void loadProductTypes().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Unable to load Product types.');
    });
    void request<ApiEnvelope<readonly CatalogCategoryChoiceDto[]>>('/admin/catalog/categories')
      .then((result) => setCategories(result.data))
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Unable to load Product categories.');
      });
    void Promise.all([
      request<ApiEnvelope<CatalogVocabularyListDto>>(
        '/admin/catalog/vocabulary/TAG?status=ACTIVE&page=1&pageSize=100',
      ),
      request<ApiEnvelope<CatalogVocabularyListDto>>(
        '/admin/catalog/vocabulary/OCCASION?status=ACTIVE&page=1&pageSize=100',
      ),
      request<ApiEnvelope<CatalogVocabularyListDto>>(
        '/admin/catalog/vocabulary/COLLECTION?status=ACTIVE&page=1&pageSize=100',
      ),
    ])
      .then(([tags, occasions, collections]) =>
        setVocabularyChoices({
          tags: tags.data.items,
          occasions: occasions.data.items,
          collections: collections.data.items,
        }),
      )
      .catch((error: unknown) => {
        setMessage(
          error instanceof Error ? error.message : 'Unable to load Product labels and occasions.',
        );
      });
    const productId = parameters.get('product');
    if (productId) {
      void openProductById(productId).finally(() => setUrlReady(true));
    } else {
      setUrlReady(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [deferredQuery, status, typeFilter, readiness, page]);

  useEffect(() => {
    if (!urlReady) return;
    const parameters = new URLSearchParams();
    if (deferredQuery.trim()) parameters.set('q', deferredQuery.trim());
    if (status !== 'ALL') parameters.set('status', status);
    if (typeFilter !== 'ALL') parameters.set('type', typeFilter);
    if (readiness !== 'ALL') parameters.set('readiness', readiness);
    if (page > 1) parameters.set('page', String(page));
    if (selected) parameters.set('product', selected.id);
    if (createOpen) parameters.set('create', 'product');
    const next = parameters.size ? `?${parameters.toString()}` : window.location.pathname;
    window.history.replaceState(null, '', next);
  }, [urlReady, deferredQuery, status, typeFilter, readiness, page, selected, createOpen]);

  useEffect(() => {
    if (createOpen) {
      createWasOpen.current = true;
      createDrawerRef.current?.focus();
    } else if (createWasOpen.current) {
      createWasOpen.current = false;
      createButtonRef.current?.focus();
    }
  }, [createOpen]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const preventDraftLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const guardInternalNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      const href = target?.getAttribute('href');
      if (!href || href.startsWith('#') || target?.getAttribute('target') === '_blank') return;
      if (!window.confirm('Leave this page and discard your unsaved Catalog changes?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', preventDraftLoss);
    document.addEventListener('click', guardInternalNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', preventDraftLoss);
      document.removeEventListener('click', guardInternalNavigation, true);
    };
  }, [hasUnsavedChanges]);

  function applyWorkspace(
    nextWorkspace: CatalogProductWorkspaceDto,
    options: {
      preserveOverview?: boolean;
      preserveOrganization?: boolean;
      preserveContent?: boolean;
    } = {},
  ) {
    const overview = catalogOverviewFromWorkspace(nextWorkspace);
    const organization = catalogOrganizationFromWorkspace(nextWorkspace);
    const content = catalogContentFromWorkspace(nextWorkspace);
    setSelected(nextWorkspace);
    setWorkspace(nextWorkspace);
    if (options.preserveOverview && overviewBaseline && overviewDraft) {
      const merged = mergeCatalogOverview(overviewBaseline, overviewDraft, overview);
      setOverviewBaseline(overview);
      setOverviewDraft(merged.draft);
      setOverviewConflicts(merged.conflicts);
    } else {
      setOverviewBaseline(overview);
      setOverviewDraft(overview);
      setOverviewConflicts({});
    }
    if (options.preserveOrganization && organizationBaseline && organizationDraft) {
      const labels = Object.fromEntries(
        nextWorkspace.organization.attributes.map((attribute) => [attribute.id, attribute.name]),
      );
      const merged = mergeCatalogOrganization(
        organizationBaseline,
        organizationDraft,
        organization,
        labels,
      );
      setOrganizationBaseline(organization);
      setOrganizationDraft(merged.draft);
      setOrganizationConflicts(merged.conflicts);
    } else {
      setOrganizationBaseline(organization);
      setOrganizationDraft(organization);
      setOrganizationConflicts([]);
    }
    if (options.preserveContent && contentBaseline && contentDraft) {
      const merged = mergeCatalogContent(contentBaseline, contentDraft, content);
      setContentBaseline(content);
      setContentDraft(merged.draft);
      setContentConflicts(merged.conflicts);
    } else {
      setContentBaseline(content);
      setContentDraft(content);
      setContentConflicts([]);
    }
    setOverviewError('');
    setOrganizationError('');
    setContentError('');
  }

  function confirmWorkspaceDiscard(): boolean {
    return (
      !workspaceDirty ||
      window.confirm('Discard your unsaved Product workspace changes? This cannot be undone.')
    );
  }

  function openCreateDrawer() {
    if (workspaceDirty) {
      setMessage('Save or discard the open Product changes before creating another Product.');
      return;
    }
    setCreateOpen(true);
  }

  function closeCreateDrawer() {
    if (
      createDirty &&
      !window.confirm('Discard this unsaved Product draft? The entered values will be lost.')
    )
      return;
    setCreateDirty(false);
    setCreateCategoryIds([]);
    setCreatePrimaryCategoryId('');
    setCreateVocabulary({ tagIds: [], occasionIds: [], collectionIds: [] });
    setCreateOpen(false);
  }

  function closeProductWorkspace() {
    if (!confirmWorkspaceDiscard()) return;
    setSelected(undefined);
    setWorkspace(undefined);
    setOverviewBaseline(undefined);
    setOverviewDraft(undefined);
    setOverviewConflicts({});
    setOverviewError('');
    setOrganizationBaseline(undefined);
    setOrganizationDraft(undefined);
    setOrganizationConflicts([]);
    setOrganizationError('');
    setContentBaseline(undefined);
    setContentDraft(undefined);
    setContentConflicts([]);
    setContentError('');
    setContentDialogDirty(false);
  }

  async function openProduct(product: CatalogProductSummaryDto) {
    if (selected?.id !== product.id && !confirmWorkspaceDiscard()) return;
    setSelected(product);
    setWorkspace(undefined);
    setWorkspaceLoading(true);
    try {
      const result = await request<ApiEnvelope<CatalogProductWorkspaceDto>>(
        `/admin/catalog/products/${product.id}`,
      );
      applyWorkspace(result.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load Product setup.');
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function openProductById(productId: string) {
    setWorkspace(undefined);
    setWorkspaceLoading(true);
    try {
      const result = await request<ApiEnvelope<CatalogProductWorkspaceDto>>(
        `/admin/catalog/products/${productId}`,
      );
      applyWorkspace(result.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load Product setup.');
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await request<ApiEnvelope<CatalogProductSummaryDto>>(
        '/admin/catalog/products',
        {
          method: 'POST',
          body: JSON.stringify({
            productTypeId: typeId,
            title: data.get('title'),
            handle: data.get('handle'),
            description: data.get('description') || undefined,
            categoryIds: createCategoryIds,
            primaryCategoryId: createPrimaryCategoryId || undefined,
            tagIds: createVocabulary.tagIds,
            occasionIds: createVocabulary.occasionIds,
            collectionIds: createVocabulary.collectionIds,
          }),
        },
      );
      event.currentTarget.reset();
      setCreateDirty(false);
      setCreateCategoryIds([]);
      setCreatePrimaryCategoryId('');
      setCreateVocabulary({ tagIds: [], occasionIds: [], collectionIds: [] });
      setCreateOpen(false);
      await reload();
      await openProduct(result.data);
      setMessage('Draft created. Complete the overview, then options and sellable Variants.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create Product.');
    } finally {
      setBusy(false);
    }
  }

  function updateOverviewField(field: CatalogOverviewField, value: string) {
    setOverviewDraft((current) => (current ? { ...current, [field]: value } : current));
    setOverviewError('');
    setOverviewConflicts((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function saveOverview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !overviewDraft || !overviewBaseline || busy) return;
    if (Object.keys(overviewConflicts).length > 0) {
      setOverviewError('Resolve the stale-field choices before saving this Product.');
      return;
    }
    const title = overviewDraft.title.trim();
    const handle = overviewDraft.handle.trim();
    if (!title) {
      setOverviewError('Product name is required.');
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) {
      setOverviewError('Storefront handle must use lowercase words separated by hyphens.');
      return;
    }
    const update: CatalogProductUpdateDto = {
      title,
      handle,
      description: overviewDraft.description.trim() || null,
      productTypeId: overviewDraft.productTypeId,
    };
    setBusy(true);
    try {
      await request<ApiEnvelope<CatalogProductSummaryDto>>(
        `/admin/catalog/products/${workspace.id}`,
        {
          method: 'PATCH',
          headers: { 'if-match': `"${workspace.version}"` },
          body: JSON.stringify(update),
        },
      );
      const refreshed = await request<ApiEnvelope<CatalogProductWorkspaceDto>>(
        `/admin/catalog/products/${workspace.id}`,
      );
      applyWorkspace(refreshed.data, { preserveOrganization: true, preserveContent: true });
      setMessage('Product overview saved. Readiness has been recalculated.');
      await reload();
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'STALE_VERSION') {
        try {
          const current = await request<ApiEnvelope<CatalogProductWorkspaceDto>>(
            `/admin/catalog/products/${workspace.id}`,
          );
          const currentOverview = catalogOverviewFromWorkspace(current.data);
          const merged = mergeCatalogOverview(overviewBaseline, overviewDraft, currentOverview);
          applyWorkspace(current.data, {
            preserveOverview: true,
            preserveOrganization: true,
            preserveContent: true,
          });
          setOverviewError('');
          const conflictCount = Object.keys(merged.conflicts).length;
          setMessage(
            conflictCount > 0
              ? `A newer Product version was loaded. Resolve ${conflictCount} conflicting field${conflictCount === 1 ? '' : 's'}; your draft is preserved.`
              : 'A newer Product version was loaded and merged with your draft. Review and save again.',
          );
        } catch (refreshError) {
          const detail =
            refreshError instanceof Error
              ? refreshError.message
              : 'The Product changed, but its latest version could not be loaded.';
          setOverviewError(detail);
          setMessage(detail);
        }
      } else {
        const detail = error instanceof Error ? error.message : 'Unable to save Product overview.';
        setOverviewError(detail);
        setMessage(detail);
      }
    } finally {
      setBusy(false);
    }
  }

  function resolveOverviewConflicts(choice: 'LOCAL' | 'CURRENT') {
    if (!overviewDraft) return;
    if (choice === 'CURRENT') {
      setOverviewDraft((draft) => {
        if (!draft) return draft;
        const next = { ...draft };
        for (const [field, conflict] of Object.entries(overviewConflicts) as [
          CatalogOverviewField,
          CatalogOverviewConflict,
        ][]) {
          next[field] = conflict.current;
        }
        return next;
      });
    }
    setOverviewConflicts({});
    setOverviewError('');
    setMessage(
      choice === 'CURRENT'
        ? 'Current saved values accepted for conflicting fields.'
        : 'Your draft values retained. Save again to apply them to the current version.',
    );
  }

  function toggleCategory(categoryId: string, checked: boolean) {
    setOrganizationDraft((current) => {
      if (!current) return current;
      const categoryIds = checked
        ? [...new Set([...current.categoryIds, categoryId])].sort()
        : current.categoryIds.filter((id) => id !== categoryId);
      return {
        ...current,
        categoryIds,
        primaryCategoryId:
          !checked && current.primaryCategoryId === categoryId ? null : current.primaryCategoryId,
      };
    });
    setOrganizationError('');
  }

  function updateAttribute(attributeId: string, value: string | boolean | null) {
    setOrganizationDraft((current) =>
      current
        ? { ...current, attributeValues: { ...current.attributeValues, [attributeId]: value } }
        : current,
    );
    setOrganizationError('');
  }

  function toggleVocabulary(
    field: 'tagIds' | 'occasionIds' | 'collectionIds',
    id: string,
    checked: boolean,
  ) {
    setOrganizationDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        [field]: checked
          ? [...new Set([...current[field], id])].sort()
          : current[field].filter((selectedId) => selectedId !== id),
      };
    });
    setOrganizationError('');
  }

  function toggleCreateCategory(categoryId: string, checked: boolean) {
    setCreateCategoryIds((current) =>
      checked
        ? [...new Set([...current, categoryId])].sort()
        : current.filter((id) => id !== categoryId),
    );
    if (!checked && createPrimaryCategoryId === categoryId) setCreatePrimaryCategoryId('');
  }

  function toggleCreateVocabulary(
    field: 'tagIds' | 'occasionIds' | 'collectionIds',
    id: string,
    checked: boolean,
  ) {
    setCreateVocabulary((current) => ({
      ...current,
      [field]: checked
        ? [...new Set([...current[field], id])].sort()
        : current[field].filter((selectedId) => selectedId !== id),
    }));
  }

  async function recoverOrganizationDraft() {
    if (
      !workspace ||
      !overviewBaseline ||
      !overviewDraft ||
      !organizationBaseline ||
      !organizationDraft
    )
      return;
    const current = await request<ApiEnvelope<CatalogProductWorkspaceDto>>(
      `/admin/catalog/products/${workspace.id}`,
    );
    const labels = Object.fromEntries(
      current.data.organization.attributes.map((attribute) => [attribute.id, attribute.name]),
    );
    const organizationMerge = mergeCatalogOrganization(
      organizationBaseline,
      organizationDraft,
      catalogOrganizationFromWorkspace(current.data),
      labels,
    );
    const overviewMerge = mergeCatalogOverview(
      overviewBaseline,
      overviewDraft,
      catalogOverviewFromWorkspace(current.data),
    );
    applyWorkspace(current.data, {
      preserveOverview: true,
      preserveOrganization: true,
      preserveContent: true,
    });
    const conflictCount =
      organizationMerge.conflicts.length + Object.keys(overviewMerge.conflicts).length;
    setMessage(
      conflictCount > 0
        ? `A newer Product version was loaded. Resolve ${conflictCount} conflicting workspace change${conflictCount === 1 ? '' : 's'}; your draft is preserved.`
        : 'A newer Product version was loaded and merged with your draft. Review and save again.',
    );
  }

  async function saveCategories(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !organizationDraft || busy || !categoriesDirty) return;
    if (organizationConflicts.length > 0) {
      setOrganizationError('Resolve the stale workspace choices before saving categories.');
      return;
    }
    setBusy(true);
    try {
      await request(`/admin/catalog/products/${workspace.id}/categories`, {
        method: 'PUT',
        headers: { 'if-match': `"${workspace.version}"` },
        body: JSON.stringify({
          categoryIds: organizationDraft.categoryIds,
          primaryCategoryId: organizationDraft.primaryCategoryId,
        }),
      });
      const refreshed = await request<ApiEnvelope<CatalogProductWorkspaceDto>>(
        `/admin/catalog/products/${workspace.id}`,
      );
      applyWorkspace(refreshed.data, {
        preserveOverview: true,
        preserveOrganization: true,
        preserveContent: true,
      });
      setMessage('Product categories saved. Your other workspace drafts were preserved.');
      await reload();
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'STALE_VERSION') {
        try {
          await recoverOrganizationDraft();
        } catch (refreshError) {
          setOrganizationError(
            refreshError instanceof Error
              ? refreshError.message
              : 'The Product changed, but its latest version could not be loaded.',
          );
        }
      } else {
        setOrganizationError(error instanceof Error ? error.message : 'Unable to save categories.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveAttributes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !organizationDraft || busy || !attributesDirty) return;
    if (organizationConflicts.length > 0) {
      setOrganizationError('Resolve the stale workspace choices before saving attributes.');
      return;
    }
    setBusy(true);
    try {
      await request(`/admin/catalog/products/${workspace.id}/attributes`, {
        method: 'PUT',
        headers: { 'if-match': `"${workspace.version}"` },
        body: JSON.stringify({
          values: workspace.organization.attributes.map((attribute) => ({
            attributeDefinitionId: attribute.id,
            value: organizationDraft.attributeValues[attribute.id] ?? null,
          })),
        }),
      });
      const refreshed = await request<ApiEnvelope<CatalogProductWorkspaceDto>>(
        `/admin/catalog/products/${workspace.id}`,
      );
      applyWorkspace(refreshed.data, {
        preserveOverview: true,
        preserveOrganization: true,
        preserveContent: true,
      });
      setMessage('Product attributes saved. Your other workspace drafts were preserved.');
      await reload();
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'STALE_VERSION') {
        try {
          await recoverOrganizationDraft();
        } catch (refreshError) {
          setOrganizationError(
            refreshError instanceof Error
              ? refreshError.message
              : 'The Product changed, but its latest version could not be loaded.',
          );
        }
      } else {
        setOrganizationError(
          error instanceof Error ? error.message : 'Unable to save Product attributes.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveVocabulary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !organizationDraft || busy || !vocabularyDirty) return;
    if (organizationConflicts.length > 0) {
      setOrganizationError('Resolve the stale workspace choices before saving product labels.');
      return;
    }
    setBusy(true);
    try {
      await request(`/admin/catalog/products/${workspace.id}/vocabulary`, {
        method: 'PUT',
        body: JSON.stringify({
          version: workspace.version,
          tagIds: organizationDraft.tagIds,
          occasionIds: organizationDraft.occasionIds,
          collectionIds: organizationDraft.collectionIds,
        }),
      });
      const refreshed = await request<ApiEnvelope<CatalogProductWorkspaceDto>>(
        `/admin/catalog/products/${workspace.id}`,
      );
      applyWorkspace(refreshed.data, {
        preserveOverview: true,
        preserveOrganization: true,
        preserveContent: true,
      });
      setMessage('Tags, occasions, and collections saved. Your other drafts were preserved.');
      await reload();
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'STALE_VERSION') {
        try {
          await recoverOrganizationDraft();
        } catch (refreshError) {
          setOrganizationError(
            refreshError instanceof Error
              ? refreshError.message
              : 'The Product changed, but its latest version could not be loaded.',
          );
        }
      } else {
        setOrganizationError(
          error instanceof Error ? error.message : 'Unable to save Product labels.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function resolveOrganizationConflicts(choice: 'LOCAL' | 'CURRENT') {
    if (!organizationDraft || !organizationBaseline) return;
    if (choice === 'CURRENT')
      setOrganizationDraft(
        useCurrentCatalogOrganizationConflicts(
          organizationDraft,
          organizationBaseline,
          organizationConflicts,
        ),
      );
    setOrganizationConflicts([]);
    setOrganizationError('');
    setMessage(
      choice === 'CURRENT'
        ? 'Current saved organization values accepted for conflicting fields.'
        : 'Your organization draft retained. Save again to apply it to the current version.',
    );
  }

  async function saveContent() {
    if (!workspace || !contentDraft || !contentBaseline || busy || !contentDirty) return;
    if (contentConflicts.length > 0) {
      setContentError('Resolve the stale customer-content choices before saving.');
      return;
    }
    setBusy(true);
    setContentError('');
    try {
      await request(`/admin/catalog/products/${workspace.id}/content`, {
        method: 'PUT',
        headers: { 'if-match': `"${workspace.version}"` },
        body: JSON.stringify(catalogContentPayload(contentDraft)),
      });
      const refreshed = await request<ApiEnvelope<CatalogProductWorkspaceDto>>(
        `/admin/catalog/products/${workspace.id}`,
      );
      applyWorkspace(refreshed.data, { preserveOverview: true, preserveOrganization: true });
      setMessage(
        'Customer information, FAQs, and search preview saved. Other drafts were preserved.',
      );
      await reload();
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'STALE_VERSION') {
        try {
          const current = await request<ApiEnvelope<CatalogProductWorkspaceDto>>(
            `/admin/catalog/products/${workspace.id}`,
          );
          const currentContent = catalogContentFromWorkspace(current.data);
          const merged = mergeCatalogContent(contentBaseline, contentDraft, currentContent);
          applyWorkspace(current.data, {
            preserveOverview: true,
            preserveOrganization: true,
            preserveContent: true,
          });
          const conflictCount = merged.conflicts.length;
          setMessage(
            conflictCount > 0
              ? `A newer Product version was loaded. Resolve ${conflictCount} conflicting customer-content section${conflictCount === 1 ? '' : 's'}; your draft is preserved.`
              : 'A newer Product version was loaded and merged with your customer-content draft. Review and save again.',
          );
        } catch (refreshError) {
          setContentError(
            refreshError instanceof Error
              ? refreshError.message
              : 'The Product changed, but its latest customer content could not be loaded.',
          );
        }
      } else {
        setContentError(
          error instanceof Error ? error.message : 'Unable to save Product customer content.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function resolveContentConflicts(choice: 'LOCAL' | 'CURRENT') {
    if (!contentDraft || !contentBaseline) return;
    if (choice === 'CURRENT')
      setContentDraft(
        useCurrentCatalogContentConflicts(contentDraft, contentBaseline, contentConflicts),
      );
    setContentConflicts([]);
    setContentError('');
    setMessage(
      choice === 'CURRENT'
        ? 'Current saved customer content accepted for conflicting sections.'
        : 'Your customer-content draft retained. Save again to apply it to the current version.',
    );
  }

  async function publication(product: CatalogProductSummaryDto) {
    if (busy) return;
    if (workspaceDirty) {
      setMessage('Save or discard Product workspace changes before changing publication.');
      return;
    }
    const action = product.publicationStatus === 'PUBLISHED' ? 'unpublish' : 'publish';
    if (
      action === 'unpublish' &&
      !window.confirm(
        `Unpublish ${product.title}? Customers will no longer be able to discover this Product.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await request(`/admin/catalog/products/${product.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ version: product.version }),
      });
      setMessage(
        action === 'publish'
          ? `${product.title} is published.`
          : `${product.title} is no longer publicly discoverable.`,
      );
      setSelected(undefined);
      setWorkspace(undefined);
      setOverviewBaseline(undefined);
      setOverviewDraft(undefined);
      setOverviewConflicts({});
      setOverviewError('');
      setOrganizationBaseline(undefined);
      setOrganizationDraft(undefined);
      setOrganizationConflicts([]);
      setOrganizationError('');
      setContentBaseline(undefined);
      setContentDraft(undefined);
      setContentConflicts([]);
      setContentError('');
      setContentDialogDirty(false);
      await reload();
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : 'Publication was rejected.'} Resolve the publishing checklist and retry.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function createAxis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    if (workspaceDirty) {
      setMessage('Save or discard Product workspace changes before adding options.');
      return;
    }
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request(`/admin/catalog/products/${selected.id}/option-axes`, {
        method: 'POST',
        body: JSON.stringify({ code: data.get('code'), name: data.get('name') }),
      });
      form.reset();
      setMessage('Option added. Add its customer-facing values next.');
      await openProduct(selected);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create option.');
    } finally {
      setBusy(false);
    }
  }

  async function createOptionValue(event: FormEvent<HTMLFormElement>, axisId: string) {
    event.preventDefault();
    if (!selected || busy) return;
    if (workspaceDirty) {
      setMessage('Save or discard Product workspace changes before adding option values.');
      return;
    }
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request(`/admin/catalog/option-axes/${axisId}/values`, {
        method: 'POST',
        body: JSON.stringify({ code: data.get('code'), displayValue: data.get('displayValue') }),
      });
      form.reset();
      setMessage('Option value added.');
      await openProduct(selected);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add option value.');
    } finally {
      setBusy(false);
    }
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !workspace || busy) return;
    if (workspaceDirty) {
      setMessage('Save or discard Product workspace changes before creating a Variant.');
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const optionValueIds = data.getAll('optionValueId').map(String);
    if (optionValueIds.length !== workspace.options.length) {
      setMessage('Choose exactly one value from every option before creating a Variant.');
      return;
    }
    setBusy(true);
    try {
      await request(`/admin/catalog/products/${selected.id}/variants`, {
        method: 'POST',
        body: JSON.stringify({ sku: data.get('sku'), optionValueIds }),
      });
      form.reset();
      setMessage('Sellable Variant created. Continue with price, media, and inventory.');
      await openProduct(selected);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create Variant.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-page products-v2">
      <header className="page-header">
        <div>
          <p className="eyebrow">Catalog / Products</p>
          <h1>Products</h1>
          <p>Build, validate, publish, and maintain the sellable catalog.</p>
        </div>
        <div className="page-actions">
          <ProductTypeManager
            disabled={workspaceDirty || createDirty}
            onChanged={productTypesChanged}
          />
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => void reload()}
          >
            <RefreshCw /> Refresh
          </button>
          <button
            ref={createButtonRef}
            className="button primary"
            type="button"
            onClick={openCreateDrawer}
          >
            <Plus /> Create Product
          </button>
        </div>
      </header>
      {message ? (
        <div className="notice notice-warning" role="status">
          <AlertTriangle /> {message}
        </div>
      ) : null}
      <Stats aria-label="Catalog summary">
        <StatsCard>
          <StatsTitle>All Products</StatsTitle>
          <StatsValue>{worklist.summary.total}</StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Published</StatsTitle>
          <StatsValue>{worklist.summary.published}</StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Drafts</StatsTitle>
          <StatsValue>{worklist.summary.drafts}</StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Product types</StatsTitle>
          <StatsValue>{types.length}</StatsValue>
        </StatsCard>
      </Stats>
      <section className="orders-filterbar" aria-label="Product filters">
        <label className="table-search">
          <Search />
          <span className="sr-only">Search Products</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            name="productSearch"
            autoComplete="off"
            placeholder="Search name, handle, SKU, or type…"
          />
        </label>
        <label className="catalog-filter-select">
          <span>Product Type</span>
          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All Product Types</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <div className="filter-chips" role="group" aria-label="Product status">
          {productStatuses.map((item) => (
            <button
              aria-pressed={status === item}
              key={item}
              type="button"
              onClick={() => {
                setStatus(item);
                setPage(1);
              }}
            >
              {item === 'ALL' ? 'All Products' : item}
            </button>
          ))}
        </div>
        <div className="filter-chips" role="group" aria-label="Product readiness">
          {readinessStates.map((item) => (
            <button
              aria-pressed={readiness === item}
              key={item}
              type="button"
              onClick={() => {
                setReadiness(item);
                setPage(1);
              }}
            >
              {item === 'ALL' ? 'Any Readiness' : item}
            </button>
          ))}
        </div>
        <span className="result-count">{worklist.pagination.totalItems} results</span>
      </section>
      <div className={`product-workspace ${selected ? 'detail-open' : ''}`}>
        <section className="panel product-list-panel">
          <div className="data-table-shell">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Type</th>
                  <th>Variants</th>
                  <th>Readiness</th>
                  <th>Catalog State</th>
                  <th>Updated</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr
                    className={selected?.id === product.id ? 'selected-row' : ''}
                    key={product.id}
                  >
                    <td>
                      <div className="product-identity">
                        <span>
                          <PackageSearch />
                        </span>
                        <div>
                          <strong>{product.title}</strong>
                          <small>
                            /{product.handle}
                            {product.skuPreview ? ` · ${product.skuPreview}` : ''}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{product.productTypeName ?? '—'}</td>
                    <td>{product.variantCount ?? 0}</td>
                    <td>
                      <div className="catalog-readiness-cell">
                        <StatusBadge status={product.readinessState} />
                        <small>
                          {product.blockerCount > 0
                            ? `${product.blockerCount} blocker${product.blockerCount === 1 ? '' : 's'}`
                            : product.warningCount > 0
                              ? `${product.warningCount} warning${product.warningCount === 1 ? '' : 's'}`
                              : 'No setup issues'}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="inline-status">
                        <StatusBadge status={product.status} />
                        <StatusBadge status={product.publicationStatus} />
                      </div>
                    </td>
                    <td>
                      {product.updatedAt
                        ? new Date(product.updatedAt).toLocaleDateString('en-BD', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td>
                      <button
                        className="row-link"
                        type="button"
                        onClick={() => void openProduct(product)}
                      >
                        Open workspace <ArrowRight />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {products.length === 0 ? (
              <div className="empty-state">
                <PackageSearch />
                <strong>No matching Products</strong>
                <p>Create a draft or clear the current filters.</p>
                <button type="button" onClick={openCreateDrawer}>
                  Create Product
                </button>
              </div>
            ) : null}
          </div>
          {worklist.pagination.totalPages > 1 ? (
            <nav className="catalog-pagination" aria-label="Product pages">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span>
                Page {worklist.pagination.page} of {worklist.pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= worklist.pagination.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </nav>
          ) : null}
        </section>
        {selected ? (
          <aside className="product-detail-panel">
            <header className="detail-header">
              <div>
                <p className="eyebrow">Product workspace</p>
                <h2>{selected.title}</h2>
                <div className="inline-status">
                  <StatusBadge status={selected.status} />
                  <StatusBadge status={selected.publicationStatus} />
                </div>
              </div>
              <button
                aria-label="Close Product workspace"
                type="button"
                onClick={closeProductWorkspace}
              >
                <X />
              </button>
            </header>
            {overviewDraft && overviewBaseline ? (
              <section className="product-overview-editor" id="overview">
                <div className="section-heading">
                  <div>
                    <h3>Product overview</h3>
                    <p>Customer identity, merchandising copy, and Catalog classification.</p>
                  </div>
                  <StatusBadge
                    status={overviewDirty ? 'UNSAVED' : `VERSION ${workspace?.version}`}
                  />
                </div>
                <form noValidate onSubmit={(event) => void saveOverview(event)}>
                  <div className="product-overview-grid">
                    <label>
                      <span>Product name</span>
                      <input
                        autoComplete="off"
                        maxLength={180}
                        required
                        value={overviewDraft.title}
                        onChange={(event) => updateOverviewField('title', event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Storefront handle</span>
                      <input
                        autoCapitalize="none"
                        autoComplete="off"
                        maxLength={160}
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        required
                        spellCheck={false}
                        value={overviewDraft.handle}
                        onChange={(event) => updateOverviewField('handle', event.target.value)}
                      />
                      <small>Lowercase words and hyphens. Old published handles redirect.</small>
                    </label>
                    <label>
                      <span>Product Type</span>
                      <select
                        required
                        value={overviewDraft.productTypeId}
                        onChange={(event) =>
                          updateOverviewField('productTypeId', event.target.value)
                        }
                      >
                        {!types.some((type) => type.id === overviewDraft.productTypeId) ? (
                          <option disabled value={overviewDraft.productTypeId}>
                            Current Product Type is unavailable — choose another
                          </option>
                        ) : null}
                        {types.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                      <small>Changing type recalculates required Catalog information.</small>
                    </label>
                    <label className="product-overview-description">
                      <span>Customer description</span>
                      <textarea
                        maxLength={5000}
                        rows={5}
                        value={overviewDraft.description}
                        onChange={(event) => updateOverviewField('description', event.target.value)}
                      />
                      <small>{overviewDraft.description.length}/5000 characters</small>
                    </label>
                  </div>
                  {overviewError ? (
                    <p className="overview-error" role="alert">
                      {overviewError}
                    </p>
                  ) : null}
                  {Object.keys(overviewConflicts).length > 0 ? (
                    <div className="overview-conflict" role="alert">
                      <strong>Another operator changed the same fields.</strong>
                      <p>Choose which values to keep. Your draft has not been discarded.</p>
                      <ul>
                        {(
                          Object.entries(overviewConflicts) as [
                            CatalogOverviewField,
                            CatalogOverviewConflict,
                          ][]
                        ).map(([field, conflict]) => (
                          <li key={field}>
                            <strong>
                              {field === 'productTypeId'
                                ? 'Product Type'
                                : field.charAt(0).toUpperCase() + field.slice(1)}
                            </strong>
                            <span>
                              Current:{' '}
                              {field === 'productTypeId'
                                ? (types.find((type) => type.id === conflict.current)?.name ??
                                  conflict.current)
                                : conflict.current || 'Empty'}
                            </span>
                            <span>
                              Your draft:{' '}
                              {field === 'productTypeId'
                                ? (types.find((type) => type.id === conflict.local)?.name ??
                                  conflict.local)
                                : conflict.local || 'Empty'}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div>
                        <button type="button" onClick={() => resolveOverviewConflicts('CURRENT')}>
                          Use current values
                        </button>
                        <button type="button" onClick={() => resolveOverviewConflicts('LOCAL')}>
                          Keep my draft
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <footer>
                    <span role="status">
                      {overviewDirty ? 'Unsaved overview changes' : 'Overview is up to date'}
                    </span>
                    <button
                      type="button"
                      disabled={!overviewDirty || busy}
                      onClick={() => {
                        setOverviewDraft(overviewBaseline);
                        setOverviewConflicts({});
                        setOverviewError('');
                        setMessage('Overview draft discarded.');
                      }}
                    >
                      Discard changes
                    </button>
                    <button
                      className="button primary"
                      type="submit"
                      disabled={!overviewDirty || busy || Object.keys(overviewConflicts).length > 0}
                    >
                      {busy ? 'Saving…' : 'Save overview'}
                    </button>
                  </footer>
                </form>
              </section>
            ) : null}
            {workspace && organizationDraft && organizationBaseline ? (
              <section className="product-organization-editor" id="organization">
                <div className="section-heading">
                  <div>
                    <h3>Product organization</h3>
                    <p>Assign discovery categories and complete this Product Type’s attributes.</p>
                  </div>
                  <StatusBadge status={organizationDirty ? 'UNSAVED' : 'UP TO DATE'} />
                </div>
                {organizationError ? (
                  <p className="overview-error" role="alert">
                    {organizationError}
                  </p>
                ) : null}
                {organizationConflicts.length > 0 ? (
                  <div className="overview-conflict" role="alert">
                    <strong>Another operator changed the same organization details.</strong>
                    <p>Choose which values to keep. Your draft has not been discarded.</p>
                    <ul>
                      {organizationConflicts.map((conflict) => (
                        <li key={conflict.key}>
                          <strong>{conflict.label}</strong>
                          <span>
                            Current:{' '}
                            {Array.isArray(conflict.current)
                              ? `${conflict.current.length} selected`
                              : String(conflict.current ?? 'Empty')}
                          </span>
                          <span>
                            Your draft:{' '}
                            {Array.isArray(conflict.local)
                              ? `${conflict.local.length} selected`
                              : String(conflict.local ?? 'Empty')}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div>
                      <button type="button" onClick={() => resolveOrganizationConflicts('CURRENT')}>
                        Use current values
                      </button>
                      <button type="button" onClick={() => resolveOrganizationConflicts('LOCAL')}>
                        Keep my draft
                      </button>
                    </div>
                  </div>
                ) : null}
                <form
                  className="organization-form"
                  onSubmit={(event) => void saveCategories(event)}
                >
                  <fieldset>
                    <legend>Categories</legend>
                    <p>
                      Choose all relevant paths. A primary category defines the main placement.{' '}
                      <Link href="/categories" title="Create or edit categories">
                        Manage categories
                      </Link>
                    </p>
                    <div className="category-choice-list">
                      {categories.map((category) => (
                        <label key={category.id}>
                          <input
                            checked={organizationDraft.categoryIds.includes(category.id)}
                            type="checkbox"
                            onChange={(event) => toggleCategory(category.id, event.target.checked)}
                          />
                          <span>{category.path}</span>
                        </label>
                      ))}
                      {categories.length === 0 ? (
                        <p>
                          No active categories are available.{' '}
                          <Link href="/categories">Create the first category</Link> before
                          assignment.
                        </p>
                      ) : null}
                    </div>
                    <label className="primary-category-field">
                      <span>Primary category</span>
                      <select
                        disabled={organizationDraft.categoryIds.length === 0}
                        value={organizationDraft.primaryCategoryId ?? ''}
                        onChange={(event) =>
                          setOrganizationDraft((current) =>
                            current
                              ? { ...current, primaryCategoryId: event.target.value || null }
                              : current,
                          )
                        }
                      >
                        <option value="">No primary category</option>
                        {categories
                          .filter((category) => organizationDraft.categoryIds.includes(category.id))
                          .map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.path}
                            </option>
                          ))}
                      </select>
                    </label>
                  </fieldset>
                  <footer>
                    <span role="status">
                      {categoriesDirty ? 'Unsaved category changes' : 'Categories are up to date'}
                    </span>
                    <button
                      type="button"
                      disabled={!categoriesDirty || busy}
                      onClick={() =>
                        setOrganizationDraft((current) =>
                          current
                            ? {
                                ...current,
                                categoryIds: organizationBaseline.categoryIds,
                                primaryCategoryId: organizationBaseline.primaryCategoryId,
                              }
                            : current,
                        )
                      }
                    >
                      Discard categories
                    </button>
                    <button
                      className="button primary"
                      type="submit"
                      disabled={!categoriesDirty || busy || organizationConflicts.length > 0}
                    >
                      {busy ? 'Saving…' : 'Save categories'}
                    </button>
                  </footer>
                </form>
                <form
                  className="organization-form"
                  onSubmit={(event) => void saveVocabulary(event)}
                >
                  <fieldset>
                    <legend>Tags, occasions, and collections</legend>
                    <p>
                      Add useful discovery and merchandising labels.{' '}
                      <Link href="/categories" title="Manage product organization values">
                        Manage available values
                      </Link>
                    </p>
                    <div className="attribute-field-grid">
                      {(
                        [
                          {
                            label: 'Tags',
                            help: 'Flexible labels, such as bestseller or hand-finished.',
                            field: 'tagIds',
                            items: vocabularyChoices.tags,
                          },
                          {
                            label: 'Occasions or events',
                            help: 'When this product is suitable, such as Wedding, Eid, or Party.',
                            field: 'occasionIds',
                            items: vocabularyChoices.occasions,
                          },
                          {
                            label: 'Collections',
                            help: 'Campaign or curated groups, such as Festive Edit.',
                            field: 'collectionIds',
                            items: vocabularyChoices.collections,
                          },
                        ] as const
                      ).map((group) => (
                        <fieldset key={group.field}>
                          <legend title={group.help}>{group.label}</legend>
                          <p>{group.help}</p>
                          <div className="category-choice-list">
                            {group.items.map((item) => (
                              <label key={item.id} title={item.description ?? group.help}>
                                <input
                                  checked={organizationDraft[group.field].includes(item.id)}
                                  type="checkbox"
                                  onChange={(event) =>
                                    toggleVocabulary(group.field, item.id, event.target.checked)
                                  }
                                />
                                <span>{item.name}</span>
                              </label>
                            ))}
                            {group.items.length === 0 ? (
                              <p>No active {group.label.toLowerCase()} are available.</p>
                            ) : null}
                          </div>
                        </fieldset>
                      ))}
                    </div>
                  </fieldset>
                  <footer>
                    <span role="status">
                      {vocabularyDirty
                        ? 'Unsaved label changes'
                        : 'Tags, occasions, and collections are up to date'}
                    </span>
                    <button
                      type="button"
                      disabled={!vocabularyDirty || busy}
                      onClick={() =>
                        setOrganizationDraft((current) =>
                          current
                            ? {
                                ...current,
                                tagIds: organizationBaseline.tagIds,
                                occasionIds: organizationBaseline.occasionIds,
                                collectionIds: organizationBaseline.collectionIds,
                              }
                            : current,
                        )
                      }
                    >
                      Discard labels
                    </button>
                    <button
                      className="button primary"
                      type="submit"
                      disabled={!vocabularyDirty || busy || organizationConflicts.length > 0}
                    >
                      {busy ? 'Saving…' : 'Save labels'}
                    </button>
                  </footer>
                </form>
                <form
                  className="organization-form"
                  onSubmit={(event) => void saveAttributes(event)}
                >
                  <fieldset>
                    <legend>Product Type attributes</legend>
                    <p>
                      Required fields are marked. These values power structured merchandising and
                      filtering.
                    </p>
                    <div className="attribute-field-grid">
                      {workspace.organization.attributes.map((attribute) => {
                        const value = organizationDraft.attributeValues[attribute.id] ?? null;
                        return (
                          <label key={attribute.id}>
                            <span>
                              {attribute.name}
                              {attribute.required ? <b aria-label="required"> *</b> : null}
                            </span>
                            {attribute.valueType === 'BOOLEAN' ? (
                              <select
                                required={attribute.required}
                                value={value === null ? '' : String(value)}
                                onChange={(event) =>
                                  updateAttribute(
                                    attribute.id,
                                    event.target.value === ''
                                      ? null
                                      : event.target.value === 'true',
                                  )
                                }
                              >
                                <option value="">Not specified</option>
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                              </select>
                            ) : attribute.valueType === 'REFERENCE' ? (
                              <select
                                required={attribute.required}
                                value={typeof value === 'string' ? value : ''}
                                onChange={(event) =>
                                  updateAttribute(attribute.id, event.target.value || null)
                                }
                              >
                                <option value="">Not specified</option>
                                {attribute.referenceOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                    {option.status === 'ARCHIVED' ? ' (archived)' : ''}
                                  </option>
                                ))}
                              </select>
                            ) : attribute.valueType === 'TEXT' ? (
                              <textarea
                                maxLength={2000}
                                required={attribute.required}
                                rows={3}
                                value={typeof value === 'string' ? value : ''}
                                onChange={(event) =>
                                  updateAttribute(attribute.id, event.target.value || null)
                                }
                              />
                            ) : (
                              <input
                                inputMode={
                                  attribute.valueType === 'DECIMAL' ? 'decimal' : undefined
                                }
                                maxLength={80}
                                required={attribute.required}
                                type={attribute.valueType === 'DATE' ? 'date' : 'text'}
                                value={typeof value === 'string' ? value : ''}
                                onChange={(event) =>
                                  updateAttribute(attribute.id, event.target.value || null)
                                }
                              />
                            )}
                            <small>
                              {attribute.valueType === 'REFERENCE'
                                ? `${attribute.referenceOptions.length} tenant-scoped selector option${attribute.referenceOptions.length === 1 ? '' : 's'}`
                                : [
                                    attribute.valueType.toLowerCase(),
                                    attribute.filterable ? 'filterable' : '',
                                    attribute.searchable ? 'searchable' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </small>
                          </label>
                        );
                      })}
                      {workspace.organization.attributes.length === 0 ? (
                        <p className="empty-inline">
                          This Product Type has no active Product attributes.
                        </p>
                      ) : null}
                    </div>
                  </fieldset>
                  <footer>
                    <span role="status">
                      {attributesDirty ? 'Unsaved attribute changes' : 'Attributes are up to date'}
                    </span>
                    <button
                      type="button"
                      disabled={!attributesDirty || busy}
                      onClick={() =>
                        setOrganizationDraft((current) =>
                          current
                            ? {
                                ...current,
                                attributeValues: organizationBaseline.attributeValues,
                              }
                            : current,
                        )
                      }
                    >
                      Discard attributes
                    </button>
                    <button
                      className="button primary"
                      type="submit"
                      disabled={!attributesDirty || busy || organizationConflicts.length > 0}
                    >
                      {busy ? 'Saving…' : 'Save attributes'}
                    </button>
                  </footer>
                </form>
              </section>
            ) : null}
            {workspace && contentDraft ? (
              <CatalogContentEditor
                busy={busy}
                conflicts={contentConflicts}
                dirty={contentDirty}
                draft={contentDraft}
                error={contentError}
                handle={overviewDraft?.handle ?? workspace.handle}
                productDescription={overviewDraft?.description ?? workspace.description ?? ''}
                productTitle={overviewDraft?.title ?? workspace.title}
                onChange={(content) => {
                  setContentDraft(content);
                  setContentError('');
                }}
                onDiscard={() => {
                  if (!contentBaseline) return;
                  setContentDraft(contentBaseline);
                  setContentConflicts([]);
                  setContentError('');
                }}
                onResolveConflicts={resolveContentConflicts}
                onSave={() => void saveContent()}
                onTransientDirtyChange={setContentDialogDirty}
              />
            ) : null}
            <section className="publish-readiness">
              <div>
                <strong>Publishing readiness</strong>
                <p>
                  {workspace?.readiness.canPublish
                    ? 'The authoritative publication gate passes. Review operational warnings before merchandising.'
                    : `${workspace?.readiness.blockerCount ?? 0} blocker${workspace?.readiness.blockerCount === 1 ? '' : 's'} must be resolved before publishing.`}
                </p>
              </div>
              <ul>
                {workspace?.readiness.checks.map((check) => (
                  <li className={check.state.toLowerCase()} key={check.code}>
                    {check.state === 'PASS' ? <CheckCircle2 /> : <AlertTriangle />}
                    <span>
                      <strong>{check.label}</strong>
                      <small>{check.message}</small>
                    </span>
                    {check.state !== 'PASS' && check.actionHref ? (
                      <Link href={check.actionHref}>Resolve</Link>
                    ) : null}
                  </li>
                ))}
              </ul>
              <button
                disabled={
                  busy ||
                  workspaceLoading ||
                  workspaceDirty ||
                  Object.keys(overviewConflicts).length > 0 ||
                  (selected.publicationStatus !== 'PUBLISHED' && !workspace?.readiness.canPublish)
                }
                type="button"
                onClick={() => void publication(selected)}
              >
                {selected.publicationStatus === 'PUBLISHED' ? <Archive /> : <CheckCircle2 />}
                {selected.publicationStatus === 'PUBLISHED'
                  ? workspaceDirty
                    ? 'Save Product changes before unpublishing'
                    : 'Unpublish Product'
                  : workspace?.readiness.canPublish
                    ? workspaceDirty
                      ? 'Save Product changes before publishing'
                      : 'Publish Product'
                    : 'Resolve blockers to publish'}
              </button>
            </section>
            <section className="variant-workspace" id="variants">
              <div className="section-heading">
                <div>
                  <h3>Options & Variants</h3>
                  <p>
                    Define customer choices, then create each sellable SKU from one value per
                    option.
                  </p>
                </div>
                <StatusBadge status={`${workspace?.variants.length ?? 0} variants`} />
              </div>
              {workspaceLoading ? (
                <p className="loading-line">Loading Product configuration…</p>
              ) : null}
              {!workspaceLoading && workspace ? (
                <>
                  <div className="option-axis-grid">
                    {workspace.options.map((axis) => (
                      <article key={axis.id}>
                        <header>
                          <strong>{axis.name}</strong>
                          <small>{axis.code}</small>
                        </header>
                        <div className="option-pills">
                          {axis.values.map((value) => (
                            <span key={value.id}>{value.label}</span>
                          ))}
                          {axis.values.length === 0 ? <em>No values yet</em> : null}
                        </div>
                        <form
                          className="inline-create-form"
                          onSubmit={(event) => void createOptionValue(event, axis.id)}
                        >
                          <input
                            aria-label={`${axis.name} display value`}
                            autoComplete="off"
                            name="displayValue"
                            placeholder="Example: Red…"
                            required
                          />
                          <input
                            aria-label={`${axis.name} value code`}
                            autoComplete="off"
                            name="code"
                            placeholder="Example: red…"
                            pattern="[a-z0-9]+(-[a-z0-9]+)*"
                            required
                          />
                          <button disabled={busy} type="submit">
                            Add Value
                          </button>
                        </form>
                      </article>
                    ))}
                  </div>
                  <details className="compact-disclosure" open={workspace.options.length === 0}>
                    <summary>Add Product option</summary>
                    <form className="inline-create-form" onSubmit={createAxis}>
                      <input
                        aria-label="Option name"
                        autoComplete="off"
                        name="name"
                        placeholder="Example: Color…"
                        required
                      />
                      <input
                        aria-label="Option code"
                        autoComplete="off"
                        name="code"
                        placeholder="Example: color…"
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        required
                      />
                      <button disabled={busy} type="submit">
                        Add Option
                      </button>
                    </form>
                  </details>
                  {workspace.options.length > 0 &&
                  workspace.options.every((axis) => axis.values.length > 0) ? (
                    <form className="variant-create-form" onSubmit={createVariant}>
                      <div>
                        <strong>Create a sellable Variant</strong>
                        <small>
                          Choose one value from every option. SKU is normalized by the server.
                        </small>
                      </div>
                      <input
                        aria-label="Variant SKU"
                        autoComplete="off"
                        name="sku"
                        placeholder="Example: DRESS-RED-M…"
                        spellCheck={false}
                        required
                      />
                      {workspace.options.map((axis) => (
                        <label key={axis.id}>
                          <span>{axis.name}</span>
                          <select name="optionValueId" required defaultValue="">
                            <option value="" disabled>
                              Choose {axis.name}
                            </option>
                            {axis.values.map((value) => (
                              <option key={value.id} value={value.id}>
                                {value.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                      <button disabled={busy} type="submit">
                        <Grid2X2 /> Create Variant
                      </button>
                    </form>
                  ) : null}
                  <div className="variant-matrix">
                    <div className="variant-matrix-row header">
                      <span>SKU</span>
                      <span>Configuration</span>
                      <span>Status</span>
                    </div>
                    {workspace.variants.map((variant) => (
                      <div className="variant-matrix-row" key={variant.id}>
                        <strong>{variant.sku}</strong>
                        <span>
                          {variant.optionValueIds
                            .map(
                              (valueId) =>
                                workspace.options
                                  .flatMap((axis) => axis.values)
                                  .find((value) => value.id === valueId)?.label ?? 'Unknown',
                            )
                            .join(' / ')}
                        </span>
                        <StatusBadge status={variant.status} />
                      </div>
                    ))}
                    {workspace.variants.length === 0 ? (
                      <div className="empty-inline">
                        No Variants yet. Create options and the first SKU.
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </section>
            <section className="product-setup-nav">
              <h3>Product setup</h3>
              <Link href="/media">
                <Image />
                <span>
                  <strong>Media</strong>
                  <small>Upload, preview, and associate images</small>
                </span>
                <ArrowRight />
              </Link>
              <Link href="/sizing">
                <Ruler />
                <span>
                  <strong>Sizing</strong>
                  <small>Size definitions and guide revisions</small>
                </span>
                <ArrowRight />
              </Link>
              <Link href="/pricing">
                <Tags />
                <span>
                  <strong>Pricing</strong>
                  <small>Authoritative Variant price lists</small>
                </span>
                <ArrowRight />
              </Link>
              <Link href="/inventory/stock">
                <Boxes />
                <span>
                  <strong>Inventory</strong>
                  <small>Warehouse stock and availability</small>
                </span>
                <ArrowRight />
              </Link>
            </section>
            <footer className="detail-actions">
              <small>
                Version {selected.version} · /{selected.handle}
              </small>
            </footer>
          </aside>
        ) : null}
      </div>
      {createOpen ? (
        <div className="drawer-backdrop" role="presentation" onMouseDown={closeCreateDrawer}>
          <aside
            ref={createDrawerRef}
            aria-label="Create Product"
            aria-modal="true"
            className="form-drawer"
            role="dialog"
            tabIndex={-1}
            onChange={() => setCreateDirty(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeCreateDrawer();
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">New catalog item</p>
                <h2>Create a draft Product</h2>
                <p>
                  Start with identity. Variants, media, pricing, sizing, and stock remain controlled
                  steps.
                </p>
              </div>
              <button aria-label="Close create Product" type="button" onClick={closeCreateDrawer}>
                <X />
              </button>
            </header>
            <form onSubmit={createProduct}>
              <div className="form-section">
                <h3>Product identity</h3>
                <Label htmlFor="product-type">Product Type</Label>
                <Select value={typeId} onValueChange={(value) => setTypeId(value ?? '')}>
                  <SelectTrigger id="product-type">
                    <SelectValue placeholder="Choose a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label htmlFor="title">Product name</Label>
                <Input
                  autoComplete="off"
                  id="title"
                  name="title"
                  required
                  placeholder="Example: Linen Wrap Dress…"
                />
                <Label htmlFor="handle">Storefront handle</Label>
                <Input
                  id="handle"
                  name="handle"
                  autoComplete="off"
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="Example: linen-wrap-dress…"
                />
                <small>
                  Lowercase letters, numbers, and hyphens. Later changes preserve redirect history.
                </small>
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  name="description"
                  autoComplete="off"
                  rows={5}
                  placeholder="Describe material, cut, use, and customer value…"
                />
              </div>
              <div className="form-section">
                <div className="section-heading">
                  <div>
                    <h3>Product organization</h3>
                    <p>Optional now. Assigning these here saves setup steps after creation.</p>
                  </div>
                  <Link
                    href="/categories"
                    title="Create categories, tags, occasions, or collections"
                  >
                    Manage values
                  </Link>
                </div>
                <details className="compact-disclosure" open>
                  <summary>Categories ({createCategoryIds.length} selected)</summary>
                  <div className="category-choice-list">
                    {categories.map((category) => (
                      <label key={category.id}>
                        <input
                          checked={createCategoryIds.includes(category.id)}
                          type="checkbox"
                          onChange={(event) =>
                            toggleCreateCategory(category.id, event.target.checked)
                          }
                        />
                        <span>{category.path}</span>
                      </label>
                    ))}
                    {categories.length === 0 ? (
                      <p>
                        No active categories yet. <Link href="/categories">Create one</Link>.
                      </p>
                    ) : null}
                  </div>
                  <Label htmlFor="create-primary-category">Primary category</Label>
                  <select
                    id="create-primary-category"
                    disabled={createCategoryIds.length === 0}
                    value={createPrimaryCategoryId}
                    onChange={(event) => setCreatePrimaryCategoryId(event.target.value)}
                  >
                    <option value="">No primary category</option>
                    {categories
                      .filter((category) => createCategoryIds.includes(category.id))
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.path}
                        </option>
                      ))}
                  </select>
                </details>
                {(
                  [
                    {
                      label: 'Tags',
                      field: 'tagIds',
                      items: vocabularyChoices.tags,
                      help: 'Flexible labels such as bestseller or hand-finished.',
                    },
                    {
                      label: 'Occasions or events',
                      field: 'occasionIds',
                      items: vocabularyChoices.occasions,
                      help: 'When the item is suitable, such as Wedding, Eid, or Party.',
                    },
                    {
                      label: 'Collections',
                      field: 'collectionIds',
                      items: vocabularyChoices.collections,
                      help: 'Campaign or curated groups, such as Festive Edit.',
                    },
                  ] as const
                ).map((group) => (
                  <details className="compact-disclosure" key={group.field}>
                    <summary>
                      {group.label} ({createVocabulary[group.field].length} selected)
                    </summary>
                    <p title={group.help}>{group.help}</p>
                    <div className="category-choice-list">
                      {group.items.map((item) => (
                        <label key={item.id} title={item.description ?? group.help}>
                          <input
                            checked={createVocabulary[group.field].includes(item.id)}
                            type="checkbox"
                            onChange={(event) =>
                              toggleCreateVocabulary(group.field, item.id, event.target.checked)
                            }
                          />
                          <span>{item.name}</span>
                        </label>
                      ))}
                      {group.items.length === 0 ? (
                        <p>No active {group.label.toLowerCase()} are available.</p>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
              <footer>
                <button type="button" onClick={closeCreateDrawer}>
                  Cancel
                </button>
                <Button type="submit" disabled={!typeId || busy}>
                  Create draft <ArrowRight />
                </Button>
              </footer>
            </form>
            <div className="type-creator">
              <p>Need a new type or structured field?</p>
              <ProductTypeManager compact disabled={createDirty} onChanged={productTypesChanged} />
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
