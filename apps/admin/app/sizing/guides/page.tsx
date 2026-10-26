'use client';

import {
  Archive,
  BookTemplate,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  TableProperties,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import type {
  FitGuideKindDto,
  PaginationDto,
  SizeGuideSummaryDto,
  SizeSystemDto,
  SizingDomainDto,
  SizingSubjectTypeDto,
} from '@maevelle/contracts';

import {
  archiveSizeGuide,
  createSizeGuide,
  createSizeGuideRow,
  fetchSizeGuides,
  fetchSizingWorkspace,
  restoreSizeGuide,
} from '@/lib/sizing/api';
import { SIZING_TEMPLATE_PRESETS } from '@/lib/sizing/presets';

import {
  AdminPage,
  EmptyState,
  LoadingState,
  PageHeader,
  PagePanel,
} from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { useAdminCapability } from '@/components/admin-capabilities';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Feedback = { message: string; tone: 'success' | 'warning' | 'destructive' } | null;

const EMPTY_PAGINATION: PaginationDto = { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 };

function SizeGuidesListContent() {
  const canManageGuidesCapability = useAdminCapability('sizing.guides.manage');
  const canManageLegacy = useAdminCapability('sizing.manage');
  const canManageGuides = canManageGuidesCapability || canManageLegacy;
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldOpenCreate = searchParams.get('create') === 'true';

  const [guides, setGuides] = useState<readonly SizeGuideSummaryDto[]>([]);
  const [domains, setDomains] = useState<readonly SizingDomainDto[]>([]);
  const [systems, setSystems] = useState<readonly SizeSystemDto[]>([]);
  const [pagination, setPagination] = useState<PaginationDto>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED' | 'ALL'>('ACTIVE');
  const [domainId, setDomainId] = useState('ALL');
  const [kind, setKind] = useState<FitGuideKindDto | 'ALL'>('ALL');
  const [publication, setPublication] = useState<
    'PUBLISHED' | 'WORKING_CHANGES' | 'DRAFT_ONLY' | 'ALL'
  >('ALL');
  const [sort, setSort] = useState<'UPDATED_DESC' | 'USAGE_DESC' | 'NAME_ASC'>('UPDATED_DESC');
  const [page, setPage] = useState(1);

  // Create Modals
  const [showCreateModal, setShowCreateModal] = useState(shouldOpenCreate);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);

  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createDomainId, setCreateDomainId] = useState('');
  const [createSystemId, setCreateSystemId] = useState('');
  const [createKind, setCreateKind] = useState<FitGuideKindDto>('CUSTOM_FIT_GUIDE');
  const [createMeasurementBasis, setCreateMeasurementBasis] =
    useState<SizingSubjectTypeDto>('PRODUCT');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [guideData, workspace] = await Promise.all([
        fetchSizeGuides({
          page,
          pageSize: 25,
          status,
          ...(domainId !== 'ALL' ? { domainId } : {}),
          kind,
          publication,
          sort,
          ...(search ? { search } : {}),
        }),
        fetchSizingWorkspace(),
      ]);
      setGuides(guideData.items);
      setPagination(guideData.pagination);
      setDomains(workspace.domains);
      setSystems(workspace.systems);
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Failed to load size guides.',
        tone: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [domainId, kind, page, publication, search, sort, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeDomains = useMemo(() => domains.filter((d) => d.status === 'ACTIVE'), [domains]);
  const createSystems = useMemo(
    () => systems.filter((s) => s.status === 'ACTIVE' && s.sizingDomainId === createDomainId),
    [createDomainId, systems],
  );

  function submitSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function openCreate() {
    const firstDomain = activeDomains[0]?.id ?? '';
    setCreateName('');
    setCreateDescription('');
    setCreateDomainId(firstDomain);
    setCreateSystemId('');
    setCreateKind('CUSTOM_FIT_GUIDE');
    setCreateMeasurementBasis(
      activeDomains.find((domain) => domain.id === firstDomain)?.subjectType ?? 'PRODUCT',
    );
    setCreateError('');
    setShowCreateModal(true);
  }

  async function handleCreateGuide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createName.trim() || !createDomainId) {
      setCreateError('Guide name and sizing domain are required.');
      return;
    }

    setCreateBusy(true);
    setCreateError('');
    try {
      const description = createDescription.trim();
      const created = await createSizeGuide({
        name: createName.trim(),
        sizingDomainId: createDomainId,
        kind: createKind,
        measurementBasis: createMeasurementBasis,
        ...(description ? { description } : {}),
        ...(createSystemId ? { sizeSystemId: createSystemId } : {}),
      });
      setShowCreateModal(false);
      router.push(`/sizing/guides/${created.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create size guide.');
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleCreateFromPreset(presetId: string) {
    const preset = SIZING_TEMPLATE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setTemplateBusy(true);
    setFeedback(null);

    try {
      // Find matching domain or use first active
      const matchedDomain =
        domains.find(
          (d) =>
            d.code === preset.domainCode ||
            d.name.toLowerCase().includes(preset.domainName.toLowerCase()),
        ) ?? activeDomains[0];

      if (!matchedDomain) {
        throw new Error(
          'Please create at least one active sizing domain before generating guides.',
        );
      }

      // Check if a matching system exists
      const matchedSystem = systems.find(
        (s) => s.sizingDomainId === matchedDomain.id && s.code === preset.sizeSystemCode,
      );

      const created = await createSizeGuide({
        name: preset.name,
        description: `Starting structure for ${preset.name}. Enter the supplier or Product measurements manually before publishing.`,
        kind: preset.category.toLowerCase().includes('footwear')
          ? 'FOOTWEAR_SIZE_CHART'
          : preset.subjectType === 'GARMENT'
            ? 'APPAREL_SIZE_CHART'
            : 'WEARABLE_FIT_GUIDE',
        measurementBasis: preset.subjectType,
        sizingDomainId: matchedDomain.id,
        ...(matchedSystem ? { sizeSystemId: matchedSystem.id } : {}),
      });

      // Add sample rows if revision was created
      if (created.revisionId && preset.standardSizes.length > 0) {
        let position = 0;
        for (const size of preset.standardSizes) {
          await createSizeGuideRow(created.revisionId, {
            expectedVersion: position,
            displayLabel: size.label,
            position,
          });
          position += 1;
        }
      }

      setShowTemplateModal(false);
      setFeedback({ message: `Guide "${preset.name}" created from preset.`, tone: 'success' });
      router.push(`/sizing/guides/${created.id}`);
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Failed to create guide from preset.',
        tone: 'destructive',
      });
    } finally {
      setTemplateBusy(false);
    }
  }

  async function toggleGuide(guide: SizeGuideSummaryDto) {
    const isRestoring = guide.status === 'ARCHIVED';
    if (
      !isRestoring &&
      !window.confirm(
        `Archive "${guide.name}"? Attached products will lose their direct guide link.`,
      )
    )
      return;

    setBusyId(guide.id);
    setFeedback(null);
    try {
      if (isRestoring) await restoreSizeGuide(guide.id);
      else await archiveSizeGuide(guide.id);
      setFeedback({
        message: `Size guide ${isRestoring ? 'restored' : 'archived'} successfully.`,
        tone: 'success',
      });
      await load();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Action failed.',
        tone: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Fit & Sizing"
        title="Fit & Size Guides"
        description="Create reusable customer guides, enter authentic measurements, preview the experience, publish safely, and see where each guide is used."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplateModal(true)}
              disabled={!canManageGuides}
              className="min-h-10 sm:min-h-9 touch-manipulation gap-1.5"
            >
              <BookTemplate className="size-3.5" />
              <span>Use Template Preset</span>
            </Button>
            <Button
              size="sm"
              onClick={openCreate}
              disabled={!canManageGuides || activeDomains.length === 0}
              className="min-h-10 sm:min-h-9 touch-manipulation gap-1.5"
            >
              <Plus className="size-4" />
              <span>Create Guide</span>
            </Button>
          </div>
        }
      />

      {feedback ? (
        <div
          role="status"
          className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm animate-in fade-in duration-150 ${
            feedback.tone === 'success'
              ? 'border-success/30 bg-success-subtle text-success'
              : 'border-destructive/30 bg-destructive-subtle text-destructive'
          }`}
        >
          <span>{feedback.message}</span>
        </div>
      ) : null}

      {/* Filter and Search Bar */}
      <PagePanel className="space-y-3 border-border p-4">
        <div className="space-y-3">
          <form onSubmit={submitSearch} className="flex w-full gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search guides by title or description…"
                className="h-9 pl-9 text-xs"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm" className="h-9 text-xs">
              Search
            </Button>
          </form>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <NativeSelect
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as typeof status);
              }}
              className="h-9 text-xs bg-card min-w-32"
            >
              <option value="ACTIVE">Active Guides</option>
              <option value="ARCHIVED">Archived Guides</option>
              <option value="ALL">All Statuses</option>
            </NativeSelect>

            <NativeSelect
              value={kind}
              onChange={(event) => {
                setPage(1);
                setKind(event.target.value as FitGuideKindDto | 'ALL');
              }}
              className="h-9 min-w-40 bg-card text-xs"
              aria-label="Guide kind"
            >
              <option value="ALL">All guide types</option>
              <option value="APPAREL_SIZE_CHART">Apparel charts</option>
              <option value="FOOTWEAR_SIZE_CHART">Footwear charts</option>
              <option value="WEARABLE_FIT_GUIDE">Wearable fit guides</option>
              <option value="CUSTOM_FIT_GUIDE">Custom guides</option>
            </NativeSelect>

            <NativeSelect
              value={publication}
              onChange={(event) => {
                setPage(1);
                setPublication(event.target.value as typeof publication);
              }}
              className="h-9 min-w-40 bg-card text-xs"
              aria-label="Publication state"
            >
              <option value="ALL">All publication states</option>
              <option value="PUBLISHED">Published</option>
              <option value="WORKING_CHANGES">Working changes</option>
              <option value="DRAFT_ONLY">Draft only</option>
            </NativeSelect>

            <NativeSelect
              value={sort}
              onChange={(event) => {
                setPage(1);
                setSort(event.target.value as typeof sort);
              }}
              className="h-9 min-w-40 bg-card text-xs"
              aria-label="Sort guides"
            >
              <option value="UPDATED_DESC">Recently updated</option>
              <option value="USAGE_DESC">Most used</option>
              <option value="NAME_ASC">Name</option>
            </NativeSelect>

            <NativeSelect
              value={domainId}
              onChange={(e) => {
                setPage(1);
                setDomainId(e.target.value);
              }}
              className="h-9 text-xs bg-card min-w-36"
            >
              <option value="ALL">All Domains</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </PagePanel>

      {/* Guide List / Empty / Loading */}
      {loading ? (
        <LoadingState message="Loading size guides library…" />
      ) : guides.length === 0 ? (
        <EmptyState
          icon={TableProperties}
          title="No size guides found"
          description={
            search
              ? `No guides matched "${search}".`
              : 'Create your first measurement guide or start from a standard apparel template.'
          }
          action={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowTemplateModal(true)}
                disabled={!canManageGuides}
              >
                Choose Template
              </Button>
              <Button
                size="sm"
                onClick={openCreate}
                disabled={!canManageGuides || activeDomains.length === 0}
              >
                Create Custom Guide
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Desktop Table */}
          <div className="hidden xl:block">
            <PagePanel className="p-0 border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 font-semibold text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-4 py-3">Guide Name</th>
                      <th className="px-4 py-3">Domain / System</th>
                      <th className="px-4 py-3">Publication State</th>
                      <th className="px-4 py-3">Catalog Usage</th>
                      <th className="px-4 py-3">Last Updated</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {guides.map((guide) => {
                      const isBusy = busyId === guide.id;

                      return (
                        <tr key={guide.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <Link
                              href={`/sizing/guides/${guide.id}`}
                              className="font-semibold text-foreground text-sm hover:text-primary hover:underline block truncate max-w-xs"
                            >
                              {guide.name}
                            </Link>
                            {guide.description ? (
                              <p className="mt-0.5 text-[11px] text-muted-foreground truncate max-w-sm">
                                {guide.description}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">
                              {guide.sizingDomainName}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              <span>{guide.kind.replaceAll('_', ' ').toLowerCase()}</span>
                              <span> · {guide.measurementBasis.toLowerCase()}</span>
                              <span> · </span>
                              {guide.sizeSystemName ? (
                                <span className="font-mono">{guide.sizeSystemName}</span>
                              ) : (
                                <span className="italic">Unbound custom chart</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {guide.hasPublishedRevision ? (
                                <Badge
                                  variant="secondary"
                                  className="bg-success-subtle text-success text-[10px] font-medium"
                                >
                                  {guide.hasWorkingRevision
                                    ? 'Published · Working changes'
                                    : 'Published'}
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="bg-warning-subtle text-warning text-[10px] font-medium"
                                >
                                  Draft Only
                                </Badge>
                              )}
                              <StatusBadge status={guide.status} />
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-muted-foreground tabular-nums">
                            <div>
                              {guide.productCount} product{guide.productCount === 1 ? '' : 's'}
                            </div>
                            <div className="text-[10px]">
                              {guide.categoryCount} categor{guide.categoryCount === 1 ? 'y' : 'ies'}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground tabular-nums">
                            {new Date(guide.updatedAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                render={<Link href={`/sizing/guides/${guide.id}`} />}
                                className="h-8 text-xs px-2.5"
                              >
                                Open Guide
                              </Button>
                              {guide.status === 'ACTIVE' ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={!canManageGuides || isBusy}
                                  onClick={() => void toggleGuide(guide)}
                                  className="size-8 p-0 text-muted-foreground hover:text-destructive"
                                  title="Archive guide"
                                >
                                  <Archive className="size-3.5" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={!canManageGuides || isBusy}
                                  onClick={() => void toggleGuide(guide)}
                                  className="size-8 p-0 text-success"
                                  title="Restore guide"
                                >
                                  <RotateCcw className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </PagePanel>
          </div>

          {/* Mobile Card Stack (< sm) */}
          <div className="space-y-3 xl:hidden">
            {guides.map((guide) => (
              <PagePanel key={guide.id} className="p-4 border-border flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/sizing/guides/${guide.id}`}
                      className="font-semibold text-foreground text-sm hover:text-primary block truncate"
                    >
                      {guide.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {guide.sizingDomainName} · {guide.sizeSystemName ?? 'Unbound chart'}
                    </p>
                  </div>
                  <StatusBadge status={guide.status} />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2.5">
                  <div className="flex items-center gap-2">
                    {guide.hasPublishedRevision ? (
                      <Badge
                        variant="secondary"
                        className="bg-success-subtle text-success text-[10px]"
                      >
                        {guide.hasWorkingRevision ? 'Published · Changes' : 'Published'}
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="bg-warning-subtle text-warning text-[10px]"
                      >
                        Draft
                      </Badge>
                    )}
                    <span className="font-mono text-[11px]">
                      {guide.productCount} prod · {guide.categoryCount} cat
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={`/sizing/guides/${guide.id}`} />}
                    className="min-h-9 text-xs px-3"
                  >
                    Open Guide
                  </Button>
                </div>
              </PagePanel>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
            <span>
              Page {pagination.page} of {Math.max(pagination.totalPages, 1)} ·{' '}
              {pagination.totalItems} total guides
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-9 sm:min-h-8 text-xs gap-1"
              >
                <ChevronLeft className="size-3.5" />
                <span>Previous</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  pagination.totalPages === 0 || pagination.page >= pagination.totalPages || loading
                }
                onClick={() => setPage((p) => p + 1)}
                className="min-h-9 sm:min-h-8 text-xs gap-1"
              >
                <span>Next</span>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CUSTOM GUIDE CREATION */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Size Guide</DialogTitle>
            <DialogDescription className="text-xs">
              A blank chart draft will be created. You can define size rows and measurements in the
              studio.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateGuide} className="space-y-4 pt-2">
            {createError ? (
              <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                {createError}
              </div>
            ) : null}

            <label className="block text-xs font-medium text-foreground">
              Guide Title
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
                placeholder="e.g. Women's Standard Lawn Kurti, Men's Slim Panjabi"
                className="mt-1 h-9 text-xs"
              />
            </label>

            <label className="block text-xs font-medium text-foreground">
              Guide type
              <NativeSelect
                value={createKind}
                onChange={(event) => setCreateKind(event.target.value as FitGuideKindDto)}
                className="mt-1 h-9 bg-card text-xs"
              >
                <option value="APPAREL_SIZE_CHART">Apparel size chart</option>
                <option value="FOOTWEAR_SIZE_CHART">Footwear size chart</option>
                <option value="WEARABLE_FIT_GUIDE">Wearable fit guide</option>
                <option value="CUSTOM_FIT_GUIDE">Custom fit guide</option>
              </NativeSelect>
            </label>

            <label className="block text-xs font-medium text-foreground">
              Sizing Domain
              <NativeSelect
                value={createDomainId}
                onChange={(e) => {
                  setCreateDomainId(e.target.value);
                  setCreateSystemId('');
                  setCreateMeasurementBasis(
                    activeDomains.find((domain) => domain.id === e.target.value)?.subjectType ??
                      'PRODUCT',
                  );
                }}
                required
                className="mt-1 h-9 text-xs bg-card"
              >
                <option value="" disabled>
                  Choose a sizing domain
                </option>
                {activeDomains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.subjectType})
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="block text-xs font-medium text-foreground">
              Measurements describe
              <NativeSelect
                value={createMeasurementBasis}
                onChange={(event) =>
                  setCreateMeasurementBasis(event.target.value as SizingSubjectTypeDto)
                }
                className="mt-1 h-9 bg-card text-xs"
              >
                <option value="BODY">The customer&apos;s body</option>
                <option value="GARMENT">The physical garment</option>
                <option value="PRODUCT">The wearable Product</option>
              </NativeSelect>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                This wording is shown to customers and is independent from the technical domain.
              </span>
            </label>

            <label className="block text-xs font-medium text-foreground">
              Canonical Size System{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
              <NativeSelect
                value={createSystemId}
                onChange={(e) => setCreateSystemId(e.target.value)}
                className="mt-1 h-9 text-xs bg-card"
              >
                <option value="">No system binding (Unbound custom chart)</option>
                {createSystems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.regionCode ? `· ${s.regionCode}` : ''}
                  </option>
                ))}
              </NativeSelect>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Bind a system when your rows map to canonical definitions (e.g. S/M/L, 38/40/42).
              </span>
            </label>

            <label className="block text-xs font-medium text-foreground">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
              <textarea
                rows={2}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Who should use this guide and for which apparel types?"
                className="mt-1 w-full rounded-md border border-input bg-card p-2 text-xs outline-none focus:border-ring"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createBusy || !createName.trim() || !createDomainId}
              >
                {createBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                <span>Create & Open Guide</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: USE TEMPLATE PRESET */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span>Standard Apparel Sizing Presets</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Start from useful row and column suggestions. Presets never invent Product or supplier
              measurements.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            {SIZING_TEMPLATE_PRESETS.map((preset) => (
              <div
                key={preset.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between gap-3 hover:border-primary/50 transition-colors shadow-2xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {preset.category}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      Unit: {preset.defaultUnit}
                    </Badge>
                  </div>
                  <h4 className="mt-2 text-sm font-semibold text-foreground">{preset.name}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Includes {preset.standardSizes.length} standard sizes (
                    {preset.standardSizes.map((s) => s.label).join(', ')})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {preset.standardMeasurements.map((m) => (
                      <span
                        key={m.code}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {m.name}
                      </span>
                    ))}
                  </div>
                </div>

                <Button
                  size="sm"
                  disabled={templateBusy}
                  onClick={() => void handleCreateFromPreset(preset.id)}
                  className="w-full text-xs min-h-9 gap-1"
                >
                  {templateBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  <span>Generate from Preset</span>
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}

export default function SizeGuidesListPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading size guides studio..." />}>
      <SizeGuidesListContent />
    </Suspense>
  );
}
