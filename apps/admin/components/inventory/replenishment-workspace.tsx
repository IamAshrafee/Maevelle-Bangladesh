'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, PackagePlus, Pencil, Plus, RotateCcw } from 'lucide-react';

import type {
  ReplenishmentPolicyDto,
  ReplenishmentRecommendationDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { StatusBadge } from '@/components/status-badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  AdminPage,
  EmptyState,
  ErrorState,
  PageHeader,
  PagePanel,
  PageSection,
} from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatInventoryNumber, inventoryRequest } from '@/lib/inventory/api';
import {
  listReplenishmentPolicies,
  listReplenishmentRecommendations,
  resetReplenishmentPolicy,
} from '@/lib/inventory/replenishment';
import { ReplenishmentPolicyDialog } from './replenishment-policy-dialog';

const pageSize = 25;

function sourceLabel(source: ReplenishmentRecommendationDto['policySource']): string {
  return {
    LOCATION_POLICY: 'Location policy',
    ITEM_POLICY: 'Item policy',
    VARIANT: 'Catalog SKU',
    ORGANIZATION_DEFAULT: 'Organization default',
  }[source];
}

function RecommendationAction({ item }: { readonly item: ReplenishmentRecommendationDto }) {
  const action = item.suggestedAction;
  if (!action) return <span className="text-xs text-muted-foreground">No action needed</span>;
  const label =
    action.type === 'TRANSFER'
      ? `Transfer from ${action.sourceLocationName}`
      : action.type === 'PURCHASE'
        ? `Purchase from ${action.supplierName}`
        : 'Choose a source';
  return (
    <Button
      size="sm"
      variant={action.type === 'REVIEW_SOURCE' ? 'outline' : 'default'}
      render={<Link href={action.href} />}
    >
      {label}
      <ArrowRight className="size-4" />
    </Button>
  );
}

export function ReplenishmentWorkspace() {
  const canManage = useAdminCapability('inventory.replenishment.manage');
  const [tab, setTab] = useState<'recommendations' | 'policies'>('recommendations');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [locationId, setLocationId] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [recommendations, setRecommendations] = useState<readonly ReplenishmentRecommendationDto[]>(
    [],
  );
  const [recommendationTotal, setRecommendationTotal] = useState(0);
  const [policies, setPolicies] = useState<readonly ReplenishmentPolicyDto[]>([]);
  const [policyTotal, setPolicyTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reload, setReload] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<ReplenishmentPolicyDto>();
  const [editingRecommendation, setEditingRecommendation] =
    useState<ReplenishmentRecommendationDto>();
  const [resetPolicy, setResetPolicy] = useState<ReplenishmentPolicyDto>();
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    inventoryRequest<{ data: readonly WarehouseLocationDto[] }>('/warehouse/locations', {
      signal: controller.signal,
    })
      .then((response) =>
        setLocations(response.data.filter((location) => location.status === 'ACTIVE')),
      )
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const request =
      tab === 'recommendations'
        ? listReplenishmentRecommendations(
            {
              ...(deferredSearch ? { search: deferredSearch } : {}),
              ...(locationId ? { locationId } : {}),
              attentionOnly,
              page,
              limit: pageSize,
            },
            controller.signal,
          ).then((result) => {
            setRecommendations(result.items);
            setRecommendationTotal(result.total);
          })
        : listReplenishmentPolicies(
            {
              ...(deferredSearch ? { search: deferredSearch } : {}),
              ...(locationId ? { locationId } : {}),
              page,
              limit: pageSize,
            },
            controller.signal,
          ).then((result) => {
            setPolicies(result.items);
            setPolicyTotal(result.total);
          });
    request
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error ? caught.message : 'Replenishment data could not be loaded.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attentionOnly, deferredSearch, locationId, page, reload, tab]);

  function openCreate() {
    setEditingPolicy(undefined);
    setEditingRecommendation(undefined);
    setDialogOpen(true);
  }

  function openEdit(policy: ReplenishmentPolicyDto) {
    setEditingPolicy(policy);
    setEditingRecommendation(undefined);
    setDialogOpen(true);
  }

  async function openRecommendationPolicy(recommendation: ReplenishmentRecommendationDto) {
    setError('');
    try {
      const result = await listReplenishmentPolicies({
        inventoryItemId: recommendation.inventoryItemId,
        limit: 100,
      });
      setEditingPolicy(
        result.items.find((policy) => policy.locationId === recommendation.locationId),
      );
      setEditingRecommendation(recommendation);
      setDialogOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The policy could not be opened.');
    }
  }

  async function confirmReset() {
    if (!resetPolicy) return;
    setResetting(true);
    try {
      await resetReplenishmentPolicy(resetPolicy.id, resetPolicy.version);
      setSuccess(
        'The override was reset. This stock position now inherits the next policy in the hierarchy.',
      );
      setResetPolicy(undefined);
      setReload((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The policy could not be reset.');
    } finally {
      setResetting(false);
    }
  }

  const total = tab === 'recommendations' ? recommendationTotal : policyTotal;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Inventory"
        title="Replenishment"
        description="Turn projected stock risk into an explainable Transfer or Purchase handoff without creating obligations automatically."
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Create policy
            </Button>
          ) : undefined
        }
      />

      {success ? (
        <div
          role="status"
          className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground"
        >
          {success}
        </div>
      ) : null}
      {error ? (
        <ErrorState message={error} onRetry={() => setReload((value) => value + 1)} />
      ) : null}

      <PagePanel className="p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)_auto] sm:items-end">
          <label className="space-y-1.5 text-sm font-medium">
            <span>Search SKU or product</span>
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search inventory…"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>Location</span>
            <NativeSelect
              className="w-full"
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
                setPage(1);
              }}
            >
              <NativeSelectOption value="">All authorized locations</NativeSelectOption>
              {locations.map((location) => (
                <NativeSelectOption key={location.id} value={location.id}>
                  {location.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <RefreshButton
            loading={loading}
            onRefresh={() => setReload((value) => value + 1)}
            tooltip="Refresh replenishment rules"
          />
        </div>
      </PagePanel>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as typeof tab);
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="mt-5">
          <PageSection
            title="Projected stock actions"
            description={`${recommendationTotal} position${recommendationTotal === 1 ? '' : 's'} match the current view.`}
            actions={
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={attentionOnly}
                  onChange={(event) => {
                    setAttentionOnly(event.target.checked);
                    setPage(1);
                  }}
                />
                Needs action only
              </label>
            }
          >
            {loading && recommendations.length === 0 ? (
              <>
                <div className="grid gap-3 md:hidden">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <PagePanel key={i} className="space-y-4 p-4 shadow-none">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-28" />
                        </div>
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Skeleton className="h-10 rounded-md" />
                        <Skeleton className="h-10 rounded-md" />
                      </div>
                    </PagePanel>
                  ))}
                </div>
                <div className="hidden md:block">
                  <Table stickyHeader density="compact">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Projected</TableHead>
                        <TableHead className="text-right">Reorder / target</TableHead>
                        <TableHead>Policy</TableHead>
                        <TableHead>Recommendation</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <div className="space-y-1.5">
                              <Skeleton className="h-4 w-36" />
                              <Skeleton className="h-3 w-24" />
                            </div>
                          </TableCell>
                          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Skeleton className="h-3 w-16" />
                              <Skeleton className="h-5 w-20 rounded-full" />
                            </div>
                          </TableCell>
                          <TableCell><Skeleton className="h-3 w-44" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto rounded-md" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : recommendations.length === 0 ? (
              <EmptyState
                icon={PackagePlus}
                title="No replenishment work in this view"
                description={
                  attentionOnly
                    ? 'Projected stock meets its resolved reorder policies.'
                    : 'No stock positions match these filters.'
                }
              />
            ) : (
              <>
                <div className={`grid gap-3 md:hidden ${loading ? 'opacity-60 transition-opacity' : ''}`}>
                  {recommendations.map((item) => (
                    <PagePanel
                      key={`${item.inventoryItemId}-${item.locationId}`}
                      className="space-y-4 p-4 shadow-none"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/inventory/stock/${item.inventoryItemId}?locationId=${item.locationId}`}
                            className="font-semibold hover:underline"
                          >
                            {item.productTitle}
                          </Link>
                          <p className="font-mono text-xs text-muted-foreground">
                            {item.sku} · {item.locationName}
                          </p>
                        </div>
                        <StatusBadge
                          status={item.status}
                          tone={
                            item.status === 'REPLENISH'
                              ? 'danger'
                              : item.status === 'BELOW_THRESHOLD'
                                ? 'warning'
                                : 'success'
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Projected</p>
                          <p className="font-mono tabular-nums font-semibold">
                            {formatInventoryNumber(item.projectedAvailable)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Suggested</p>
                          <p className="font-mono tabular-nums font-semibold">
                            {formatInventoryNumber(item.suggestedQuantity)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Policy</p>
                          <p>{sourceLabel(item.policySource)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Target</p>
                          <p className="font-mono tabular-nums">
                            {formatInventoryNumber(item.targetStock)}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.explanation}</p>
                      <div className="flex flex-wrap gap-2">
                        <RecommendationAction item={item} />
                        {canManage ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openRecommendationPolicy(item)}
                          >
                            <Pencil className="size-4" />
                            Policy
                          </Button>
                        ) : null}
                      </div>
                    </PagePanel>
                  ))}
                </div>
                <div className="hidden md:block">
                  <Table stickyHeader density="compact">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Projected</TableHead>
                        <TableHead className="text-right">Reorder / target</TableHead>
                        <TableHead>Policy</TableHead>
                        <TableHead>Recommendation</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className={loading ? 'opacity-60 transition-opacity' : undefined}>
                      {recommendations.map((item) => (
                        <TableRow key={`${item.inventoryItemId}-${item.locationId}`}>
                          <TableCell>
                            <Link
                              href={`/inventory/stock/${item.inventoryItemId}?locationId=${item.locationId}`}
                              className="font-medium hover:underline"
                            >
                              {item.productTitle}
                            </Link>
                            <p className="font-mono text-xs text-muted-foreground">{item.sku}</p>
                          </TableCell>
                          <TableCell>{item.locationName}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatInventoryNumber(item.availableToSell)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatInventoryNumber(item.projectedAvailable)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatInventoryNumber(item.reorderPoint)} /{' '}
                            {formatInventoryNumber(item.targetStock)}
                          </TableCell>
                          <TableCell>
                            <p className="text-xs">{sourceLabel(item.policySource)}</p>
                            <StatusBadge
                              status={item.status}
                              tone={
                                item.status === 'REPLENISH'
                                  ? 'danger'
                                  : item.status === 'BELOW_THRESHOLD'
                                    ? 'warning'
                                    : 'success'
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <p className="max-w-64 whitespace-normal text-xs text-muted-foreground">
                              {item.explanation}
                            </p>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <RecommendationAction item={item} />
                              {canManage ? (
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`Edit policy for ${item.sku} at ${item.locationName}`}
                                  onClick={() => void openRecommendationPolicy(item)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </PageSection>
        </TabsContent>

        <TabsContent value="policies" className="mt-5">
          <PageSection
            title="Explicit policies"
            description="Location overrides win over item policies; unconfigured items fall back to Catalog and organization settings."
          >
            {loading && policies.length === 0 ? (
              <Table stickyHeader density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="text-right">Reorder</TableHead>
                    <TableHead className="text-right">Safety</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead>Preferred source</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto rounded-md" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : policies.length === 0 ? (
              <EmptyState
                title="No explicit policies match"
                description="Stock still uses Catalog SKU reorder points and the organization default."
                action={
                  canManage ? (
                    <Button onClick={openCreate}>
                      <Plus className="size-4" />
                      Create policy
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Table stickyHeader density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="text-right">Reorder</TableHead>
                    <TableHead className="text-right">Safety</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead>Preferred source</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={loading ? 'opacity-60 transition-opacity' : undefined}>
                  {policies.map((policy) => (
                    <TableRow key={policy.id}>
                      <TableCell>
                        <p className="font-medium">{policy.productTitle}</p>
                        <p className="font-mono text-xs text-muted-foreground">{policy.sku}</p>
                      </TableCell>
                      <TableCell>
                        {policy.locationName ?? 'All locations without an override'}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatInventoryNumber(policy.reorderPoint)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatInventoryNumber(policy.safetyStock)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatInventoryNumber(policy.targetStock)}
                      </TableCell>
                      <TableCell>
                        <p>{policy.preferredSourceLocationName ?? 'No transfer source'}</p>
                        <p className="text-xs text-muted-foreground">
                          {policy.preferredSupplierName ?? 'No fallback supplier'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canManage ? (
                            <>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Edit policy for ${policy.sku}`}
                                onClick={() => openEdit(policy)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Reset policy for ${policy.sku}`}
                                onClick={() => setResetPolicy(policy)}
                              >
                                <RotateCcw className="size-4" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </PageSection>
        </TabsContent>
      </Tabs>

      {total > pageSize ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={page >= pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <ReplenishmentPolicyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        policy={editingPolicy}
        recommendation={editingRecommendation}
        onSaved={(saved) => {
          setSuccess(`Replenishment policy for ${saved.sku} was saved.`);
          setReload((value) => value + 1);
        }}
      />
      <AlertDialog
        open={Boolean(resetPolicy)}
        onOpenChange={(open) => {
          if (!open && !resetting) setResetPolicy(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset this policy?</AlertDialogTitle>
            <AlertDialogDescription>
              The item and location will immediately inherit the next policy in the hierarchy.
              Historical inventory movements are unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={resetting}
              onClick={() => void confirmReset()}
            >
              {resetting ? 'Resetting…' : 'Reset policy'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPage>
  );
}
