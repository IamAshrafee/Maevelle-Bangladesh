'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, Tag } from 'lucide-react';
import type {
  AssetAcquisitionSourceDto,
  AssetCategoryDto,
  AssetListItemDto,
  AssetOptionsDto,
  AssetSummaryDto,
  PaginatedResultDto,
} from '@maevelle/contracts';
import { useAdminCapability } from '@/components/admin-capabilities';
import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '@/components/operational-worklist';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchApiData } from '@/lib/api';
import { AssetStats } from './console/asset-stats';
import { AssetFilters } from './console/asset-filters';
import { AssetTable } from './console/asset-table';
import { AssetRegisterDialog } from './console/asset-register-dialog';
import { AssetCategoriesDialog } from './console/asset-categories-dialog';
import type { AssetFilterState } from './types';

const initialFilters: AssetFilterState = {
  search: '',
  status: 'ALL',
  condition: 'ALL',
  categoryId: '',
  locationId: '',
  custodianId: '',
  page: 1,
};

export function AssetConsole() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const canView = useAdminCapability('assets.view');
  const canManage = useAdminCapability('assets.manage');
  const canLifecycle = useAdminCapability('assets.lifecycle.manage');

  const [items, setItems] = useState<readonly AssetListItemDto[]>([]);
  const [summary, setSummary] = useState<AssetSummaryDto>();
  const [options, setOptions] = useState<AssetOptionsDto>();
  const [categories, setCategories] = useState<readonly AssetCategoryDto[]>([]);
  const [filters, setFilters] = useState<AssetFilterState>(initialFilters);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    totalItems: 0,
    totalPages: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Dialog triggers
  const [createOpen, setCreateOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  // Pre-fill parameters for creation
  const [registrationPreFill, setRegistrationPreFill] = useState<{
    source?: AssetAcquisitionSourceDto | undefined;
    expenseId?: string | undefined;
    purchaseId?: string | undefined;
    cost?: string | undefined;
    currency?: string | undefined;
    name?: string | undefined;
    description?: string | undefined;
  }>({});

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');

    try {
      const query = new URLSearchParams({
        page: String(filters.page),
        pageSize: '25',
      });
      if (filters.search.trim()) query.set('search', filters.search.trim());
      if (filters.status !== 'ALL') query.set('status', filters.status);
      if (filters.condition !== 'ALL') query.set('condition', filters.condition);
      if (filters.categoryId) query.set('categoryId', filters.categoryId);
      if (filters.locationId) query.set('locationId', filters.locationId);
      if (filters.custodianId) query.set('custodianId', filters.custodianId);

      const [list, nextSummary, nextOptions, nextCategories] = await Promise.all([
        fetchApiData<PaginatedResultDto<AssetListItemDto>>(`/admin/assets?${query}`),
        fetchApiData<AssetSummaryDto>('/admin/assets/summary'),
        fetchApiData<AssetOptionsDto>('/admin/assets/options'),
        fetchApiData<readonly AssetCategoryDto[]>('/admin/assets/categories'),
      ]);

      setItems(list.items);
      setPagination(list.pagination);
      setSummary(nextSummary);
      setOptions(nextOptions);
      setCategories(nextCategories);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assets could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [filters, canView]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), filters.search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, filters.search]);

  // Handle URL creation triggers from Finance or Procurement cross-links
  useEffect(() => {
    if (searchParams.get('create') === 'asset' && canManage) {
      const rawSource = searchParams.get('source');
      const validSource: AssetAcquisitionSourceDto | undefined =
        rawSource && ['EXISTING', 'EXPENSE', 'PURCHASE', 'GIFT'].includes(rawSource)
          ? (rawSource as AssetAcquisitionSourceDto)
          : undefined;

      setRegistrationPreFill({
        source: validSource,
        expenseId: searchParams.get('expenseId') ?? undefined,
        purchaseId: searchParams.get('purchaseId') ?? undefined,
        cost: searchParams.get('cost') ?? undefined,
        currency: searchParams.get('currency') ?? undefined,
        name: searchParams.get('name') ?? undefined,
        description: searchParams.get('description') ?? undefined,
      });
      setCreateOpen(true);
    }
  }, [canManage, searchParams]);

  if (!canView) {
    return (
      <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          You do not have permission to view asset management. Please contact your organization
          administrator.
        </OperationalFeedback>
        <Button nativeButton={false} render={<Link href="/" />}>
          <ArrowLeft className="size-4 mr-1.5" />
          Back to Dashboard
        </Button>
      </main>
    );
  }

  function handleRowQuickAction(
    action: 'assign' | 'move' | 'maintenance' | 'sale' | 'dispose',
    item: AssetListItemDto,
  ) {
    router.push(`/assets/${item.id}?action=${action}`);
  }

  return (
    <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <Breadcrumb items={[{ label: 'Operations', href: '/' }, { label: 'Assets' }]} />

      <OperationalPageHeader
        eyebrow="Business Operations"
        title="Asset Management"
        description="Track durable business property, physical custody, location, condition, maintenance history, private documents, and financial provenance without distorting saleable Inventory."
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
                <Tag className="size-4 mr-1.5" />
                <span>Manage Categories</span>
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4 mr-1.5" />
                <span>Register Asset</span>
              </Button>
            </div>
          ) : undefined
        }
      />

      {feedback ? <OperationalFeedback>{feedback}</OperationalFeedback> : null}
      {error ? <OperationalFeedback tone="danger">{error}</OperationalFeedback> : null}

      {/* Interactive Summary Stats Cards */}
      <AssetStats
        summary={summary}
        activeStatus={filters.status}
        onSelectStatus={(newStatus) =>
          setFilters((prev) => ({ ...prev, status: newStatus, page: 1 }))
        }
      />

      {/* Multi-attribute Filter & Search Bar */}
      <AssetFilters
        filters={filters}
        options={options}
        onChange={setFilters}
        onRefresh={() => void load()}
      />

      {/* Main Table or Empty State */}
      {loading ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : items.length === 0 ? (
        <OperationalEmptyState
          title="No Assets Match This View"
          description={
            filters.status !== 'ALL' ||
            filters.search ||
            filters.categoryId ||
            filters.locationId ||
            filters.custodianId
              ? 'Try clearing your filters or searching with a different term.'
              : 'Register existing company property without fabricating an expense, or link new acquisitions directly to Finance Expenses or Procurement Purchases.'
          }
          action={
            canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4 mr-1.5" />
                <span>Register Asset</span>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <AssetTable
          items={items}
          canManage={canManage}
          canLifecycle={canLifecycle}
          pagination={pagination}
          onPageChange={(newPage) => setFilters((prev) => ({ ...prev, page: newPage }))}
          onQuickAction={handleRowQuickAction}
        />
      )}

      {/* Registration Modal with Multi-Mode Acquisition */}
      <AssetRegisterDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        options={options}
        initialSource={registrationPreFill.source}
        initialExpenseId={registrationPreFill.expenseId}
        initialPurchaseId={registrationPreFill.purchaseId}
        initialCost={registrationPreFill.cost}
        initialCurrency={registrationPreFill.currency}
        initialName={registrationPreFill.name}
        initialDescription={registrationPreFill.description}
        onCreated={(newId) => {
          setFeedback('Asset registered successfully.');
          void load();
          router.push(`/assets/${newId}`);
        }}
      />

      {/* Category Management Modal */}
      <AssetCategoriesDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={categories}
        onChanged={() => void load()}
      />
    </main>
  );
}
