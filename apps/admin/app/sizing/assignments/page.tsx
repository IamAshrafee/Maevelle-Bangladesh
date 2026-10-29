'use client';

import type {
  AdminSizingWorkspaceDto,
  CategoryGuideAssignmentPreviewDto,
  CategorySizeGuideDefaultDto,
  SizeGuideSummaryDto,
} from '@maevelle/contracts';
import { ExternalLink, Link2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { StatusBadge } from '@/components/status-badge';
import { useAdminCapability } from '@/components/admin-capabilities';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PagePanel,
  PageSection,
} from '@/components/ui/page-shell';
import {
  applyCategoryDefaultSizeGuide,
  fetchCategorySizeGuideDefaults,
  fetchSizeGuides,
  fetchSizingWorkspace,
  previewCategoryDefaultSizeGuide,
} from '@/lib/sizing/api';

export default function SizingAssignmentsPage() {
  const canManageAssignmentsCapability = useAdminCapability('sizing.assignments.manage');
  const canManageLegacy = useAdminCapability('sizing.manage');
  const canManageAssignments = canManageAssignmentsCapability || canManageLegacy;
  const [categories, setCategories] = useState<readonly CategorySizeGuideDefaultDto[]>([]);
  const [guides, setGuides] = useState<readonly SizeGuideSummaryDto[]>([]);
  const [workspace, setWorkspace] = useState<AdminSizingWorkspaceDto | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [assignmentPreview, setAssignmentPreview] =
    useState<CategoryGuideAssignmentPreviewDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [categoryResult, guideResult, workspaceResult] = await Promise.all([
        fetchCategorySizeGuideDefaults({ page: 1, pageSize: 100, mappingStatus: 'ALL' }),
        fetchSizeGuides({ page: 1, pageSize: 100, status: 'ACTIVE' }),
        fetchSizingWorkspace(),
      ]);
      setCategories(categoryResult.items);
      setGuides(guideResult.items.filter((guide) => guide.hasPublishedRevision));
      setWorkspace(workspaceResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load sizing assignments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return categories;
    return categories.filter((category) =>
      `${category.categoryName} ${category.categoryPath}`.toLocaleLowerCase().includes(query),
    );
  }, [categories, search]);

  async function previewCategoryGuide(categoryId: string, sizeGuideId: string) {
    setSavingCategoryId(categoryId);
    setFeedback('');
    setError('');
    try {
      setAssignmentPreview(await previewCategoryDefaultSizeGuide(categoryId, sizeGuideId || null));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not preview the Category guide.');
    } finally {
      setSavingCategoryId(null);
    }
  }

  async function applyCategoryGuide() {
    if (!assignmentPreview) return;
    setSavingCategoryId(assignmentPreview.category.id);
    setError('');
    try {
      await applyCategoryDefaultSizeGuide(assignmentPreview.previewToken);
      setAssignmentPreview(null);
      setFeedback('Category default updated from the reviewed impact preview.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not apply the Category guide.');
    } finally {
      setSavingCategoryId(null);
    }
  }

  const directAssignments =
    workspace?.productConfigurations.filter((item) => item.sizeGuideId) ?? [];
  const guideById = new Map(guides.map((guide) => [guide.id, guide]));

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Fit & Sizing"
        title="Guide Assignments"
        description="Set reusable Category defaults and inspect deliberate Product overrides. Products inherit only from their primary Category."
        actions={
          <RefreshButton
            loading={loading}
            onRefresh={() => void load()}
            tooltip="Refresh guide assignments"
          />
        }
      />

      {feedback ? (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
        >
          {feedback}
        </p>
      ) : null}
      {loading ? <LoadingState message="Loading effective guide assignments…" /> : null}
      {!loading && error ? (
        <ErrorState
          title="Could not load assignments"
          message={error}
          onRetry={() => void load()}
        />
      ) : null}

      {!loading && !error ? (
        <>
          <PageSection
            title="Primary Category defaults"
            description="Every Product in a Category inherits its published guide unless the Product has a direct override."
            actions={
              <Input
                aria-label="Search Categories"
                placeholder="Search Categories…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full sm:w-64"
              />
            }
          >
            {filteredCategories.length === 0 ? (
              <EmptyState
                title="No Categories found"
                description="Try another search or create a Category before assigning a guide."
              />
            ) : (
              <div className="grid gap-3">
                {filteredCategories.map((category) => (
                  <PagePanel key={category.categoryId} className="p-4 shadow-none">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-foreground">{category.categoryName}</h2>
                          <StatusBadge
                            status={
                              category.hasPublishedGuide
                                ? 'PUBLISHED'
                                : category.sizeGuideId
                                  ? 'UNAVAILABLE'
                                  : 'NOT_ASSIGNED'
                            }
                            tone={
                              category.hasPublishedGuide
                                ? 'success'
                                : category.sizeGuideId
                                  ? 'danger'
                                  : 'neutral'
                            }
                          />
                        </div>
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {category.categoryPath}
                        </p>
                      </div>
                      <NativeSelect
                        aria-label={`Default guide for ${category.categoryName}`}
                        value={category.sizeGuideId ?? ''}
                        disabled={!canManageAssignments || savingCategoryId === category.categoryId}
                        onChange={(event) =>
                          void previewCategoryGuide(category.categoryId, event.target.value)
                        }
                      >
                        <option value="">No Category guide</option>
                        {guides.map((guide) => (
                          <option key={guide.id} value={guide.id}>
                            {guide.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </PagePanel>
                ))}
              </div>
            )}
          </PageSection>

          <PageSection
            title="Direct Product assignments"
            description="These Products intentionally override their primary Category. Change or remove an override from the Product context."
          >
            {directAssignments.length === 0 ? (
              <EmptyState
                icon={Link2}
                title="No direct Product overrides"
                description="Products currently inherit their primary Category guide or have no guide."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {directAssignments.map((assignment) => (
                  <PagePanel key={assignment.productId} className="p-4 shadow-none">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-foreground">
                          {assignment.productTitle}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {guideById.get(assignment.sizeGuideId!)?.name ?? 'Assigned guide'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        render={<Link href={`/products/${assignment.productId}`} />}
                      >
                        Open <ExternalLink aria-hidden="true" />
                      </Button>
                    </div>
                  </PagePanel>
                ))}
              </div>
            )}
          </PageSection>
        </>
      ) : null}

      <Dialog
        open={Boolean(assignmentPreview)}
        onOpenChange={(open) => !open && setAssignmentPreview(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Category guide change</DialogTitle>
            <DialogDescription>
              Confirm the customer-guide outcome before changing {assignmentPreview?.category.name}.
              This preview is version-bound and cannot be applied after the Category or guide
              changes.
            </DialogDescription>
          </DialogHeader>
          {assignmentPreview ? (
            <div className="space-y-5">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">Effective Category default</p>
                <p className="mt-1 font-semibold text-foreground">
                  {assignmentPreview.category.currentGuideName ?? 'No guide'}
                  <span className="mx-2 text-muted-foreground">→</span>
                  {assignmentPreview.nextGuide?.name ?? 'No guide'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ['Products', assignmentPreview.totalProducts],
                  ['Will inherit', assignmentPreview.inheritingProducts],
                  ['Direct unchanged', assignmentPreview.directAssignmentsUnaffected],
                  ['No-guide unchanged', assignmentPreview.explicitNoGuideUnaffected],
                  ['Conflicts', assignmentPreview.compatibilityConflicts],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-border p-3">
                    <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {assignmentPreview.compatibilityConflicts > 0 ? (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                  This guide is incompatible with one or more inheriting Product size systems. The
                  change is blocked until those Products are resolved.
                </p>
              ) : null}
              {assignmentPreview.sampleProducts.length > 0 ? (
                <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                  {assignmentPreview.sampleProducts.map((product) => (
                    <div
                      key={product.productId}
                      className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0"
                    >
                      <Link
                        href={`/products/${product.productId}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {product.productTitle}
                      </Link>
                      <StatusBadge
                        status={product.compatible ? product.outcome : 'CONFLICT'}
                        tone={product.compatible ? 'neutral' : 'danger'}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setAssignmentPreview(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={
                    savingCategoryId === assignmentPreview.category.id ||
                    assignmentPreview.compatibilityConflicts > 0
                  }
                  onClick={() => void applyCategoryGuide()}
                >
                  Apply reviewed change
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}
