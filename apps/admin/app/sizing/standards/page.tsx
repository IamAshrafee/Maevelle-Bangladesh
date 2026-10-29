'use client';

import {
  Archive,
  ArrowUpDown,
  Check,
  CheckCircle2,
  FolderTree,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Ruler,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import type {
  MeasurementDefinitionDto,
  SizeDefinitionDto,
  SizeSystemDto,
  SizingDomainDto,
  SizingMeasurementUnitDto,
  SizingSubjectTypeDto,
} from '@maevelle/contracts';

import {
  archiveMeasurementDefinition,
  archiveSizeDefinition,
  archiveSizeSystem,
  archiveSizingDomain,
  createMeasurementDefinition,
  createSizeDefinition,
  createSizeSystem,
  createSizingDomain,
  fetchSizingWorkspace,
  restoreMeasurementDefinition,
  restoreSizeDefinition,
  restoreSizeSystem,
  restoreSizingDomain,
  updateMeasurementDefinition,
  updateSizeDefinition,
  updateSizeSystem,
  updateSizingDomain,
} from '@/lib/sizing/api';

import {
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingState,
  PageActions,
  PageDescription,
  PageHeader,
  PagePanel,
  PageSection,
  PageTitle,
} from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Feedback = { message: string; tone: 'success' | 'warning' | 'destructive' } | null;

function slug(value: string | undefined | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

function SizingStandardsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') ?? 'domains';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [domains, setDomains] = useState<readonly SizingDomainDto[]>([]);
  const [systems, setSystems] = useState<readonly SizeSystemDto[]>([]);
  const [sizeDefinitions, setSizeDefinitions] = useState<readonly SizeDefinitionDto[]>([]);
  const [measurements, setMeasurements] = useState<readonly MeasurementDefinitionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Search / filters
  const [search, setSearch] = useState('');
  const [selectedDomainFilter, setSelectedDomainFilter] = useState('ALL');
  const [selectedSystemFilter, setSelectedSystemFilter] = useState('ALL');

  // Modals
  const [domainModalOpen, setDomainModalOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<SizingDomainDto | null>(null);

  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<SizeSystemDto | null>(null);
  const [systemParentDomainId, setSystemParentDomainId] = useState('');

  const [sizeModalOpen, setSizeModalOpen] = useState(false);
  const [editingSize, setEditingSize] = useState<SizeDefinitionDto | null>(null);
  const [sizeParentSystemId, setSizeParentSystemId] = useState('');

  const [measurementModalOpen, setMeasurementModalOpen] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<MeasurementDefinitionDto | null>(null);
  const [measurementParentDomainId, setMeasurementParentDomainId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchSizingWorkspace();
      setDomains(data.domains);
      setSystems(data.systems);
      setSizeDefinitions(data.sizeDefinitions);
      setMeasurements(data.measurementDefinitions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sizing standards.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeDomains = useMemo(() => domains.filter((d) => d.status === 'ACTIVE'), [domains]);
  const activeSystems = useMemo(() => systems.filter((s) => s.status === 'ACTIVE'), [systems]);

  // Tab 1: Domains & Systems hierarchy
  const visibleDomains = useMemo(() => {
    const query = search.trim().toLowerCase();
    return domains.filter((d) => {
      if (!showArchived && d.status !== 'ACTIVE') return false;
      if (!query) return true;
      return d.name.toLowerCase().includes(query) || d.code.toLowerCase().includes(query);
    });
  }, [domains, search, showArchived]);

  // Tab 2: Size Definitions
  const visibleSizes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sizeDefinitions.filter((s) => {
      if (!showArchived && s.status !== 'ACTIVE') return false;
      if (selectedSystemFilter !== 'ALL' && s.sizeSystemId !== selectedSystemFilter) return false;
      if (!query) return true;
      return s.label.toLowerCase().includes(query) || s.code.toLowerCase().includes(query);
    });
  }, [search, selectedSystemFilter, showArchived, sizeDefinitions]);

  // Tab 3: Measurement Dimensions
  const visibleMeasurements = useMemo(() => {
    const query = search.trim().toLowerCase();
    return measurements.filter((m) => {
      if (!showArchived && m.status !== 'ACTIVE') return false;
      if (selectedDomainFilter !== 'ALL' && m.sizingDomainId !== selectedDomainFilter) return false;
      if (!query) return true;
      return (
        m.name.toLowerCase().includes(query) ||
        m.code.toLowerCase().includes(query) ||
        (m.description ?? '').toLowerCase().includes(query)
      );
    });
  }, [measurements, search, selectedDomainFilter, showArchived]);

  // Actions
  async function handleToggleDomain(domain: SizingDomainDto) {
    const isRestoring = domain.status === 'ARCHIVED';
    if (!isRestoring && !window.confirm(`Archive domain "${domain.name}"? Child systems must be archived first.`)) return;

    setBusyId(domain.id);
    setFeedback(null);
    try {
      if (isRestoring) await restoreSizingDomain(domain.id);
      else await archiveSizingDomain(domain.id);
      setFeedback({ message: `Domain ${isRestoring ? 'restored' : 'archived'} successfully.`, tone: 'success' });
      await load();
    } catch (err) {
      setFeedback({ message: err instanceof Error ? err.message : 'Action failed.', tone: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleSystem(system: SizeSystemDto) {
    const isRestoring = system.status === 'ARCHIVED';
    if (!isRestoring && !window.confirm(`Archive system "${system.name}"? Product dependencies may prevent this.`)) return;

    setBusyId(system.id);
    setFeedback(null);
    try {
      if (isRestoring) await restoreSizeSystem(system.id);
      else await archiveSizeSystem(system.id);
      setFeedback({ message: `System ${isRestoring ? 'restored' : 'archived'} successfully.`, tone: 'success' });
      await load();
    } catch (err) {
      setFeedback({ message: err instanceof Error ? err.message : 'Action failed.', tone: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleSize(size: SizeDefinitionDto) {
    const isRestoring = size.status === 'ARCHIVED';
    if (!isRestoring && !window.confirm(`Archive size "${size.label}"?`)) return;

    setBusyId(size.id);
    setFeedback(null);
    try {
      if (isRestoring) await restoreSizeDefinition(size.id);
      else await archiveSizeDefinition(size.id);
      setFeedback({ message: `Size definition ${isRestoring ? 'restored' : 'archived'}.`, tone: 'success' });
      await load();
    } catch (err) {
      setFeedback({ message: err instanceof Error ? err.message : 'Action failed.', tone: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleMeasurement(m: MeasurementDefinitionDto) {
    const isRestoring = m.status === 'ARCHIVED';
    if (!isRestoring && !window.confirm(`Archive measurement "${m.name}"?`)) return;

    setBusyId(m.id);
    setFeedback(null);
    try {
      if (isRestoring) await restoreMeasurementDefinition(m.id);
      else await archiveMeasurementDefinition(m.id);
      setFeedback({ message: `Measurement column ${isRestoring ? 'restored' : 'archived'}.`, tone: 'success' });
      await load();
    } catch (err) {
      setFeedback({ message: err instanceof Error ? err.message : 'Action failed.', tone: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }

  // Submit forms
  async function handleSaveDomain(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const code = slug(String(form.get('code') ?? ''));
    const subjectType = (form.get('subjectType') as SizingSubjectTypeDto) || 'GARMENT';

    setFeedback(null);
    try {
      if (editingDomain) {
        await updateSizingDomain(editingDomain.id, { name });
        setFeedback({ message: `Domain "${name}" updated.`, tone: 'success' });
      } else {
        await createSizingDomain({ name, code, subjectType });
        setFeedback({ message: `Domain "${name}" created.`, tone: 'success' });
      }
      setDomainModalOpen(false);
      setEditingDomain(null);
      await load();
    } catch (err) {
      setFeedback({ message: err instanceof Error ? err.message : 'Failed to save domain.', tone: 'destructive' });
    }
  }

  async function handleSaveSystem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const code = slug(String(form.get('code') ?? ''));
    const regionCode = String(form.get('regionCode') ?? '').trim() || undefined;
    const sizingDomainId = String(form.get('sizingDomainId') ?? systemParentDomainId);

    setFeedback(null);
    try {
      if (editingSystem) {
        await updateSizeSystem(editingSystem.id, { name, regionCode: regionCode ?? null });
        setFeedback({ message: `Size system "${name}" updated.`, tone: 'success' });
      } else {
        await createSizeSystem({
          sizingDomainId,
          name,
          code,
          ...(regionCode ? { regionCode } : {}),
        });
        setFeedback({ message: `Size system "${name}" created.`, tone: 'success' });
      }
      setSystemModalOpen(false);
      setEditingSystem(null);
      await load();
    } catch (err) {
      setFeedback({ message: err instanceof Error ? err.message : 'Failed to save system.', tone: 'destructive' });
    }
  }

  async function handleSaveSize(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const label = String(form.get('label') ?? '').trim();
    const code = slug(String(form.get('code') ?? ''));
    const sortOrder = Number(form.get('sortOrder') ?? 0);
    const sizeSystemId = String(form.get('sizeSystemId') ?? sizeParentSystemId);

    setFeedback(null);
    try {
      if (editingSize) {
        await updateSizeDefinition(editingSize.id, { label, sortOrder });
        setFeedback({ message: `Size definition "${label}" updated.`, tone: 'success' });
      } else {
        await createSizeDefinition({ sizeSystemId, label, code, sortOrder });
        setFeedback({ message: `Size definition "${label}" created.`, tone: 'success' });
      }
      setSizeModalOpen(false);
      setEditingSize(null);
      await load();
    } catch (err) {
      setFeedback({ message: err instanceof Error ? err.message : 'Failed to save size definition.', tone: 'destructive' });
    }
  }

  async function handleSaveMeasurement(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const code = slug(String(form.get('code') ?? ''));
    const description = String(form.get('description') ?? '').trim() || undefined;
    const instructions = String(form.get('instructions') ?? '').trim() || undefined;
    const defaultUnit = (form.get('defaultUnit') as SizingMeasurementUnitDto) || 'inch';
    const subjectType = (form.get('subjectType') as SizingSubjectTypeDto) || 'GARMENT';
    const sortOrder = Number(form.get('sortOrder') ?? 0);
    const sizingDomainId = String(form.get('sizingDomainId') ?? measurementParentDomainId);

    setFeedback(null);
    try {
      if (editingMeasurement) {
        await updateMeasurementDefinition(editingMeasurement.id, {
          name,
          description: description ?? null,
          instructions: instructions ?? null,
          defaultUnit,
          sortOrder,
        });
        setFeedback({ message: `Measurement dimension "${name}" updated.`, tone: 'success' });
      } else {
        await createMeasurementDefinition({
          sizingDomainId,
          name,
          code,
          defaultUnit,
          subjectType,
          sortOrder,
          ...(description ? { description } : {}),
          ...(instructions ? { instructions } : {}),
        });
        setFeedback({ message: `Measurement dimension "${name}" created.`, tone: 'success' });
      }
      setMeasurementModalOpen(false);
      setEditingMeasurement(null);
      await load();
    } catch (err) {
      setFeedback({ message: err instanceof Error ? err.message : 'Failed to save measurement.', tone: 'destructive' });
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Standards & Schemas"
        title="Sizing Standards & Systems"
        description="Configure authoritative sizing domains, regional size standards (Alpha, EU, UK), canonical size items, and reusable measurement dimensions."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton
              loading={loading}
              onRefresh={() => void load()}
              tooltip="Refresh sizing standards"
            />
            {activeTab === 'domains' ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingDomain(null);
                  setDomainModalOpen(true);
                }}
                className="min-h-10 sm:min-h-9 touch-manipulation gap-1.5"
              >
                <Plus className="size-4" />
                <span>New Domain</span>
              </Button>
            ) : activeTab === 'sizes' ? (
              <Button
                size="sm"
                disabled={activeSystems.length === 0}
                onClick={() => {
                  setEditingSize(null);
                  setSizeParentSystemId(activeSystems[0]?.id ?? '');
                  setSizeModalOpen(true);
                }}
                className="min-h-10 sm:min-h-9 touch-manipulation gap-1.5"
              >
                <Plus className="size-4" />
                <span>New Size Definition</span>
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={activeDomains.length === 0}
                onClick={() => {
                  setEditingMeasurement(null);
                  setMeasurementParentDomainId(activeDomains[0]?.id ?? '');
                  setMeasurementModalOpen(true);
                }}
                className="min-h-10 sm:min-h-9 touch-manipulation gap-1.5"
              >
                <Plus className="size-4" />
                <span>New Dimension</span>
              </Button>
            )}
          </div>
        }
      />

      {feedback ? (
        <div
          role="status"
          className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm animate-in fade-in duration-150 ${
            feedback.tone === 'success'
              ? 'border-success/30 bg-success-subtle text-success'
              : feedback.tone === 'warning'
                ? 'border-warning/30 bg-warning-subtle text-warning'
                : 'border-destructive/30 bg-destructive-subtle text-destructive'
          }`}
        >
          {feedback.tone === 'success' ? <CheckCircle2 className="size-4 shrink-0" /> : <X className="size-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      {loading ? (
        <LoadingState message="Loading sizing standards and hierarchies…" />
      ) : error ? (
        <ErrorState title="Could not load sizing standards" message={error} onRetry={() => void load()} />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3">
            <TabsList className="h-10 p-1 bg-muted/60">
              <TabsTrigger value="domains" className="gap-1.5 text-xs touch-manipulation">
                <FolderTree className="size-3.5" />
                <span>Domains & Systems</span>
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                  {domains.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="sizes" className="gap-1.5 text-xs touch-manipulation">
                <Layers className="size-3.5" />
                <span>Size Definitions</span>
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                  {sizeDefinitions.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="measurements" className="gap-1.5 text-xs touch-manipulation">
                <Ruler className="size-3.5" />
                <span>Measurement Dimensions</span>
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                  {measurements.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary size-3.5"
                />
                <span>Show archived items</span>
              </label>
            </div>
          </div>

          {/* TAB 1: DOMAINS & SYSTEMS */}
          <TabsContent value="domains" className="space-y-4 m-0 focus-visible:outline-none">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter domains or systems…"
                  className="h-9 pl-9 text-xs"
                />
              </div>
            </div>

            {visibleDomains.length === 0 ? (
              <EmptyState
                icon={FolderTree}
                title="No sizing domains found"
                description="Create a domain (e.g. Womenswear, Menswear, Footwear) to organize sizing standards."
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingDomain(null);
                      setDomainModalOpen(true);
                    }}
                  >
                    Create Domain
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4">
                {visibleDomains.map((domain) => {
                  const domainSystems = systems.filter(
                    (s) => s.sizingDomainId === domain.id && (showArchived || s.status === 'ACTIVE'),
                  );
                  const isBusy = busyId === domain.id;

                  return (
                    <PagePanel key={domain.id} className="p-5 border-border">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-border/60 pb-4">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h3 className="text-base font-semibold text-foreground">{domain.name}</h3>
                            <StatusBadge status={domain.status} />
                            <Badge variant="outline" className="text-[10px] uppercase font-mono">
                              {domain.subjectType}
                            </Badge>
                          </div>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            Code: {domain.code} · {domainSystems.length} configured system{domainSystems.length === 1 ? '' : 's'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {domain.status === 'ACTIVE' ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSystemParentDomainId(domain.id);
                                  setEditingSystem(null);
                                  setSystemModalOpen(true);
                                }}
                                className="min-h-9 sm:min-h-8 text-xs gap-1"
                              >
                                <Plus className="size-3.5" />
                                <span>Add System</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingDomain(domain);
                                  setDomainModalOpen(true);
                                }}
                                className="size-8 p-0 text-muted-foreground hover:text-foreground"
                                title="Edit domain name"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => void handleToggleDomain(domain)}
                                className="size-8 p-0 text-muted-foreground hover:text-destructive"
                                title="Archive domain"
                              >
                                <Archive className="size-3.5" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => void handleToggleDomain(domain)}
                              className="text-xs text-success gap-1"
                            >
                              <RotateCcw className="size-3.5" />
                              <span>Restore</span>
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Systems inside this Domain */}
                      <div className="mt-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Regional Sizing Systems
                        </span>
                        {domainSystems.length === 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground/70 italic">
                            No regional systems configured in this domain. Add a system like International Alpha (S–XL) or EU Numeric.
                          </p>
                        ) : (
                          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                            {domainSystems.map((sys) => {
                              const sysSizes = sizeDefinitions.filter((s) => s.sizeSystemId === sys.id);
                              const isSysBusy = busyId === sys.id;

                              return (
                                <div
                                  key={sys.id}
                                  className="rounded-lg border border-border/80 bg-muted/20 p-3 flex flex-col justify-between gap-2"
                                >
                                  <div>
                                    <div className="flex items-center justify-between gap-1.5">
                                      <strong className="text-xs font-semibold text-foreground truncate">
                                        {sys.name}
                                      </strong>
                                      <StatusBadge status={sys.status} />
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                                      {sys.code} {sys.regionCode ? `· ${sys.regionCode}` : ''}
                                    </p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                      {sysSizes.length} canonical size{sysSizes.length === 1 ? '' : 's'} defined
                                    </p>
                                  </div>

                                  <div className="flex items-center justify-between border-t border-border/40 pt-2 mt-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedSystemFilter(sys.id);
                                        setActiveTab('sizes');
                                      }}
                                      className="h-7 text-[11px] text-primary p-0 hover:bg-transparent hover:underline"
                                    >
                                      View Sizes ({sysSizes.length})
                                    </Button>
                                    <div className="flex items-center gap-1">
                                      {sys.status === 'ACTIVE' ? (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              setEditingSystem(sys);
                                              setSystemModalOpen(true);
                                            }}
                                            className="size-7 p-0 text-muted-foreground"
                                            title="Edit system"
                                          >
                                            <Pencil className="size-3" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={isSysBusy}
                                            onClick={() => void handleToggleSystem(sys)}
                                            className="size-7 p-0 text-muted-foreground hover:text-destructive"
                                            title="Archive system"
                                          >
                                            <Archive className="size-3" />
                                          </Button>
                                        </>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          disabled={isSysBusy || domain.status !== 'ACTIVE'}
                                          onClick={() => void handleToggleSystem(sys)}
                                          className="size-7 p-0 text-success"
                                          title="Restore system"
                                        >
                                          <RotateCcw className="size-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </PagePanel>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB 2: SIZE DEFINITIONS */}
          <TabsContent value="sizes" className="space-y-4 m-0 focus-visible:outline-none">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search size labels or codes…"
                    className="h-9 pl-9 text-xs"
                  />
                </div>
                <NativeSelect
                  value={selectedSystemFilter}
                  onChange={(e) => setSelectedSystemFilter(e.target.value)}
                  className="h-9 text-xs max-w-xs bg-card"
                >
                  <option value="ALL">All Size Systems</option>
                  {systems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            {visibleSizes.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No size definitions found"
                description="Add canonical sizes (such as S, M, L, XL, 38, 40) under an active size system."
                action={
                  <Button
                    size="sm"
                    disabled={activeSystems.length === 0}
                    onClick={() => {
                      setEditingSize(null);
                      setSizeParentSystemId(selectedSystemFilter !== 'ALL' ? selectedSystemFilter : activeSystems[0]?.id ?? '');
                      setSizeModalOpen(true);
                    }}
                  >
                    Add Size Definition
                  </Button>
                }
              />
            ) : (
              <PagePanel className="p-0 border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 font-semibold text-muted-foreground border-b border-border">
                      <tr>
                        <th className="px-4 py-3">Label</th>
                        <th className="px-4 py-3">Code</th>
                        <th className="px-4 py-3">Size System</th>
                        <th className="px-4 py-3">Deterministic Sort Order</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {visibleSizes.map((size) => {
                        const system = systems.find((s) => s.id === size.sizeSystemId);
                        const isBusy = busyId === size.id;

                        return (
                          <tr key={size.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <strong className="font-semibold text-foreground text-sm font-mono">
                                {size.label}
                              </strong>
                            </td>
                            <td className="px-4 py-3 font-mono text-muted-foreground">{size.code}</td>
                            <td className="px-4 py-3 text-foreground">
                              {system?.name ?? 'Unknown system'}
                            </td>
                            <td className="px-4 py-3 font-mono text-muted-foreground tabular-nums">
                              {size.sortOrder}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={size.status} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                {size.status === 'ACTIVE' ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingSize(size);
                                        setSizeParentSystemId(size.sizeSystemId);
                                        setSizeModalOpen(true);
                                      }}
                                      className="size-7 p-0 text-muted-foreground"
                                      title="Edit size"
                                    >
                                      <Pencil className="size-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={isBusy}
                                      onClick={() => void handleToggleSize(size)}
                                      className="size-7 p-0 text-muted-foreground hover:text-destructive"
                                      title="Archive size"
                                    >
                                      <Archive className="size-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isBusy || system?.status !== 'ACTIVE'}
                                    onClick={() => void handleToggleSize(size)}
                                    className="size-7 p-0 text-success"
                                    title="Restore size"
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
            )}
          </TabsContent>

          {/* TAB 3: MEASUREMENT DIMENSIONS */}
          <TabsContent value="measurements" className="space-y-4 m-0 focus-visible:outline-none">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search dimensions (chest, waist, length)…"
                    className="h-9 pl-9 text-xs"
                  />
                </div>
                <NativeSelect
                  value={selectedDomainFilter}
                  onChange={(e) => setSelectedDomainFilter(e.target.value)}
                  className="h-9 text-xs max-w-xs bg-card"
                >
                  <option value="ALL">All Sizing Domains</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            {visibleMeasurements.length === 0 ? (
              <EmptyState
                icon={Ruler}
                title="No measurement dimensions found"
                description="Create measurement dimensions (such as Chest, Waist, Inseam, Sleeve) to use as chart columns."
                action={
                  <Button
                    size="sm"
                    disabled={activeDomains.length === 0}
                    onClick={() => {
                      setEditingMeasurement(null);
                      setMeasurementParentDomainId(selectedDomainFilter !== 'ALL' ? selectedDomainFilter : activeDomains[0]?.id ?? '');
                      setMeasurementModalOpen(true);
                    }}
                  >
                    Add Dimension
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleMeasurements.map((m) => {
                  const domain = domains.find((d) => d.id === m.sizingDomainId);
                  const isBusy = busyId === m.id;

                  return (
                    <PagePanel key={m.id} className="p-4 flex flex-col justify-between gap-3 border-border">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-semibold text-foreground">{m.name}</h4>
                            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                              {m.code} · {domain?.name ?? 'Unknown domain'}
                            </p>
                          </div>
                          <StatusBadge status={m.status} />
                        </div>

                        <div className="mt-2.5 flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            Unit: {m.defaultUnit}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                            {m.subjectType}
                          </Badge>
                        </div>

                        {m.description ? (
                          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                            {m.description}
                          </p>
                        ) : null}

                        {m.instructions ? (
                          <p className="mt-1 text-[11px] italic text-muted-foreground/80 line-clamp-2">
                            Measuring: {m.instructions}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between border-t border-border/40 pt-2.5">
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          Order: {m.sortOrder}
                        </span>
                        <div className="flex items-center gap-1">
                          {m.status === 'ACTIVE' ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingMeasurement(m);
                                  setMeasurementParentDomainId(m.sizingDomainId);
                                  setMeasurementModalOpen(true);
                                }}
                                className="size-7 p-0 text-muted-foreground"
                                title="Edit dimension"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => void handleToggleMeasurement(m)}
                                className="size-7 p-0 text-muted-foreground hover:text-destructive"
                                title="Archive dimension"
                              >
                                <Archive className="size-3.5" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isBusy || domain?.status !== 'ACTIVE'}
                              onClick={() => void handleToggleMeasurement(m)}
                              className="size-7 p-0 text-success"
                              title="Restore dimension"
                            >
                              <RotateCcw className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </PagePanel>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* MODAL 1: CREATE / EDIT DOMAIN */}
      <Dialog open={domainModalOpen} onOpenChange={setDomainModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDomain ? 'Edit Sizing Domain' : 'Create Sizing Domain'}</DialogTitle>
            <DialogDescription className="text-xs">
              Sizing domains represent broad product sectors (Womenswear, Menswear, Kids, Footwear).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveDomain} className="space-y-4 pt-2">
            <label className="block text-xs font-medium text-foreground">
              Domain Name
              <Input
                name="name"
                defaultValue={editingDomain?.name ?? ''}
                required
                placeholder="e.g. Womenswear, Menswear, Footwear"
                className="mt-1 h-9 text-xs"
              />
            </label>

            {!editingDomain ? (
              <>
                <label className="block text-xs font-medium text-foreground">
                  Identifier Code
                  <Input
                    name="code"
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    placeholder="e.g. womenswear, footwear"
                    className="mt-1 h-9 font-mono text-xs"
                  />
                </label>
                <label className="block text-xs font-medium text-foreground">
                  Measurement Subject
                  <NativeSelect name="subjectType" defaultValue="GARMENT" className="mt-1 h-9 text-xs bg-card">
                    <option value="GARMENT">Garment (Measured on the product)</option>
                    <option value="BODY">Body (Measured on customer body)</option>
                    <option value="PRODUCT">Product (Footwear, accessories)</option>
                  </NativeSelect>
                </label>
              </>
            ) : null}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setDomainModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                {editingDomain ? 'Update Domain' : 'Create Domain'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: CREATE / EDIT SYSTEM */}
      <Dialog open={systemModalOpen} onOpenChange={setSystemModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSystem ? 'Edit Size System' : 'Create Size System'}</DialogTitle>
            <DialogDescription className="text-xs">
              Size systems standardize sizes within a domain (e.g. International Alpha, EU Numeric).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSystem} className="space-y-4 pt-2">
            {!editingSystem ? (
              <label className="block text-xs font-medium text-foreground">
                Parent Domain
                <NativeSelect
                  name="sizingDomainId"
                  defaultValue={systemParentDomainId}
                  required
                  className="mt-1 h-9 text-xs bg-card"
                >
                  {activeDomains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ) : null}

            <label className="block text-xs font-medium text-foreground">
              System Name
              <Input
                name="name"
                defaultValue={editingSystem?.name ?? ''}
                required
                placeholder="e.g. International Alpha (XS–3XL)"
                className="mt-1 h-9 text-xs"
              />
            </label>

            {!editingSystem ? (
              <label className="block text-xs font-medium text-foreground">
                Identifier Code
                <Input
                  name="code"
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="e.g. intl-alpha, eu-numeric"
                  className="mt-1 h-9 font-mono text-xs"
                />
              </label>
            ) : null}

            <label className="block text-xs font-medium text-foreground">
              Market / Region Code <span className="text-muted-foreground font-normal">(optional)</span>
              <Input
                name="regionCode"
                defaultValue={editingSystem?.regionCode ?? ''}
                placeholder="e.g. INTL, EU, UK, US"
                className="mt-1 h-9 text-xs"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setSystemModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                {editingSystem ? 'Update System' : 'Create System'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: CREATE / EDIT SIZE DEFINITION */}
      <Dialog open={sizeModalOpen} onOpenChange={setSizeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSize ? 'Edit Size Definition' : 'Add Size Definition'}</DialogTitle>
            <DialogDescription className="text-xs">
              A canonical size label within a system (e.g. S, M, L, XL, 38, 40).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSize} className="space-y-4 pt-2">
            {!editingSize ? (
              <label className="block text-xs font-medium text-foreground">
                Size System
                <NativeSelect
                  name="sizeSystemId"
                  defaultValue={sizeParentSystemId}
                  required
                  className="mt-1 h-9 text-xs bg-card"
                >
                  {activeSystems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ) : null}

            <label className="block text-xs font-medium text-foreground">
              Display Label
              <Input
                name="label"
                defaultValue={editingSize?.label ?? ''}
                required
                placeholder="e.g. Medium, M, EU 38, UK 10"
                className="mt-1 h-9 text-xs"
              />
            </label>

            {!editingSize ? (
              <label className="block text-xs font-medium text-foreground">
                Identifier Code
                <Input
                  name="code"
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="e.g. m, eu-38, uk-10"
                  className="mt-1 h-9 font-mono text-xs"
                />
              </label>
            ) : null}

            <label className="block text-xs font-medium text-foreground">
              Deterministic Sort Order
              <Input
                name="sortOrder"
                type="number"
                min="0"
                defaultValue={editingSize?.sortOrder ?? 10}
                required
                className="mt-1 h-9 font-mono text-xs tabular-nums"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Lower numbers display first (e.g. XS = 10, S = 20, M = 30, L = 40).
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setSizeModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                {editingSize ? 'Update Size' : 'Add Size'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: CREATE / EDIT MEASUREMENT DIMENSION */}
      <Dialog open={measurementModalOpen} onOpenChange={setMeasurementModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingMeasurement ? 'Edit Measurement Dimension' : 'Add Measurement Dimension'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Reusable measurement column for charts (Chest, Waist, Inseam, Total Length).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveMeasurement} className="space-y-4 pt-2">
            {!editingMeasurement ? (
              <label className="block text-xs font-medium text-foreground">
                Sizing Domain
                <NativeSelect
                  name="sizingDomainId"
                  defaultValue={measurementParentDomainId}
                  required
                  className="mt-1 h-9 text-xs bg-card"
                >
                  {activeDomains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ) : null}

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-foreground">
                Dimension Name
                <Input
                  name="name"
                  defaultValue={editingMeasurement?.name ?? ''}
                  required
                  placeholder="e.g. Chest Around, Waist, Length"
                  className="mt-1 h-9 text-xs"
                />
              </label>

              {!editingMeasurement ? (
                <label className="block text-xs font-medium text-foreground">
                  Identifier Code
                  <Input
                    name="code"
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    placeholder="e.g. chest, waist, length"
                    className="mt-1 h-9 font-mono text-xs"
                  />
                </label>
              ) : null}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-foreground">
                Default Unit
                <NativeSelect
                  name="defaultUnit"
                  defaultValue={editingMeasurement?.defaultUnit ?? 'inch'}
                  className="mt-1 h-9 text-xs bg-card"
                >
                  <option value="inch">Inches (inch)</option>
                  <option value="cm">Centimeters (cm)</option>
                  <option value="kg">Kilograms (kg)</option>
                </NativeSelect>
              </label>

              {!editingMeasurement ? (
                <label className="block text-xs font-medium text-foreground">
                  Subject Type
                  <NativeSelect
                    name="subjectType"
                    defaultValue="GARMENT"
                    className="mt-1 h-9 text-xs bg-card"
                  >
                    <option value="GARMENT">Garment</option>
                    <option value="BODY">Body</option>
                    <option value="PRODUCT">Product</option>
                  </NativeSelect>
                </label>
              ) : null}
            </div>

            <label className="block text-xs font-medium text-foreground">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
              <Input
                name="description"
                defaultValue={editingMeasurement?.description ?? ''}
                placeholder="What this dimension represents"
                className="mt-1 h-9 text-xs"
              />
            </label>

            <label className="block text-xs font-medium text-foreground">
              Measuring Instructions <span className="text-muted-foreground font-normal">(optional)</span>
              <textarea
                name="instructions"
                rows={2}
                defaultValue={editingMeasurement?.instructions ?? ''}
                placeholder="How operators or customers should measure this dimension…"
                className="mt-1 w-full rounded-md border border-input bg-card p-2 text-xs outline-none focus:border-ring"
              />
            </label>

            <label className="block text-xs font-medium text-foreground">
              Sort Order
              <Input
                name="sortOrder"
                type="number"
                min="0"
                defaultValue={editingMeasurement?.sortOrder ?? 10}
                className="mt-1 h-9 font-mono text-xs tabular-nums"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMeasurementModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                {editingMeasurement ? 'Update Dimension' : 'Add Dimension'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}

export default function SizingStandardsPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading sizing standards hub..." />}>
      <SizingStandardsContent />
    </Suspense>
  );
}
