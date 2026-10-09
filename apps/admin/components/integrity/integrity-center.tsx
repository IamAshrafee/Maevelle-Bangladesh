'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Clock,
  Layers,
  Play,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminPage, PageHeader } from '@/components/ui/page-shell';
import { useAdminCapability } from '@/components/admin-capabilities';
import { cn } from '@/lib/utils';
import { OverviewTab } from './overview-tab';
import { FindingsTab } from './findings-tab';
import { FindingDetailSheet } from './finding-detail-sheet';
import { RepairWorkflowDialog } from './repair-workflow-dialog';
import { ChecksTab } from './checks-tab';
import { ScansTab } from './scans-tab';
import { ScanLauncherDialog } from './scan-launcher-dialog';
import { RecoveryTab } from './recovery-tab';
import { OperationsTab } from './operations-tab';
import { SettingsTab } from './settings-tab';
import {
  fetchIntegrityChecks,
  fetchIntegrityFindings,
  fetchIntegrityOverview,
  fetchIntegrityRuns,
} from '@/lib/integrity/api';
import type {
  IntegrityCheckDto,
  IntegrityFindingDetailDto,
  IntegrityFindingListItemDto,
  IntegrityOverviewDto,
  IntegrityRunDto,
  IntegrityTab,
} from '@/lib/integrity/types';

const TABS: readonly {
  readonly id: IntegrityTab;
  readonly label: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly badgeKey?: 'findings' | 'recovery' | 'scans';
}[] = [
  { id: 'overview', label: 'Overview', icon: ShieldCheck },
  { id: 'findings', label: 'Findings Worklist', icon: AlertTriangle, badgeKey: 'findings' },
  { id: 'checks', label: 'Checks Catalog', icon: Layers },
  { id: 'scans', label: 'Scans & Runs', icon: Clock, badgeKey: 'scans' },
  { id: 'recovery', label: 'Recovery Center', icon: Wrench, badgeKey: 'recovery' },
  { id: 'operations', label: 'Operations & Health', icon: Activity },
  { id: 'settings', label: 'Schedules & Cadence', icon: Calendar },
];

export function IntegrityCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const activeTab = (searchParams.get('tab') as IntegrityTab) || 'overview';
  const urlFindingId = searchParams.get('finding') || null;

  // Capabilities
  const canRunChecks = useAdminCapability('admin.integrity.run');
  const canRepair = useAdminCapability('admin.integrity.repair');

  // Overview state
  const [overview, setOverview] = React.useState<IntegrityOverviewDto | null>(null);
  const [loadingOverview, setLoadingOverview] = React.useState(true);

  // Checks state
  const [checks, setChecks] = React.useState<readonly IntegrityCheckDto[]>([]);
  const [loadingChecks, setLoadingChecks] = React.useState(false);

  // Findings state
  const [findings, setFindings] = React.useState<readonly IntegrityFindingListItemDto[]>([]);
  const [findingsTotal, setFindingsTotal] = React.useState(0);
  const [findingsPages, setFindingsPages] = React.useState(1);
  const [findingsPage, setFindingsPage] = React.useState(1);
  const [loadingFindings, setLoadingFindings] = React.useState(false);

  // Findings filters
  const [filters, setFilters] = React.useState({
    status: searchParams.get('status') || 'ALL',
    severity: searchParams.get('severity') || 'ALL',
    module: searchParams.get('module') || 'ALL',
    checkId: searchParams.get('checkId') || 'ALL',
    repairableOnly: searchParams.get('repairable') === 'true',
    q: searchParams.get('q') || '',
  });

  // Runs state
  const [runs, setRuns] = React.useState<readonly IntegrityRunDto[]>([]);
  const [runsTotal, setRunsTotal] = React.useState(0);
  const [runsPages, setRunsPages] = React.useState(1);
  const [runsPage, setRunsPage] = React.useState(1);
  const [loadingRuns, setLoadingRuns] = React.useState(false);

  // Modals & Selected items
  const [selectedFinding, setSelectedFinding] = React.useState<IntegrityFindingListItemDto | null>(null);
  const [findingDetailOpen, setFindingDetailOpen] = React.useState(false);

  const [repairFinding, setRepairFinding] = React.useState<IntegrityFindingDetailDto | null>(null);
  const [repairDialogOpen, setRepairDialogOpen] = React.useState(false);

  const [launcherOpen, setLauncherOpen] = React.useState(false);
  const [launcherInitialCheckId, setLauncherInitialCheckId] = React.useState<string | undefined>();

  // 1. Fetch Overview
  const loadOverview = React.useCallback(async () => {
    setLoadingOverview(true);
    try {
      const data = await fetchIntegrityOverview();
      setOverview(data);
    } catch {
      // Ignored
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  // 2. Fetch Checks
  const loadChecks = React.useCallback(async () => {
    setLoadingChecks(true);
    try {
      const data = await fetchIntegrityChecks();
      setChecks(data);
    } catch {
      // Ignored
    } finally {
      setLoadingChecks(false);
    }
  }, []);

  // 3. Fetch Findings
  const loadFindings = React.useCallback(async () => {
    setLoadingFindings(true);
    try {
      const data = await fetchIntegrityFindings({
        page: findingsPage,
        pageSize: 25,
        status: filters.status,
        severity: filters.severity,
        module: filters.module,
        checkId: filters.checkId,
        repairableOnly: filters.repairableOnly,
        q: filters.q,
      });
      setFindings(data.items);
      setFindingsTotal(data.pagination.totalItems);
      setFindingsPages(data.pagination.totalPages);
    } catch {
      // Ignored
    } finally {
      setLoadingFindings(false);
    }
  }, [findingsPage, filters]);

  // 4. Fetch Runs
  const loadRuns = React.useCallback(async () => {
    setLoadingRuns(true);
    try {
      const data = await fetchIntegrityRuns({
        page: runsPage,
        pageSize: 20,
      });
      setRuns(data.items);
      setRunsTotal(data.pagination.totalItems);
      setRunsPages(data.pagination.totalPages);
    } catch {
      // Ignored
    } finally {
      setLoadingRuns(false);
    }
  }, [runsPage]);

  // Initial load
  React.useEffect(() => {
    loadOverview();
    loadChecks();
  }, [loadOverview, loadChecks]);

  // Trigger findings load when on findings or recovery tab or when filters change
  React.useEffect(() => {
    if (activeTab === 'findings' || activeTab === 'recovery') {
      loadFindings();
    }
  }, [activeTab, loadFindings]);

  // Trigger runs load when on scans tab
  React.useEffect(() => {
    if (activeTab === 'scans') {
      loadRuns();
    }
  }, [activeTab, loadRuns]);

  // Handle URL finding ID
  React.useEffect(() => {
    if (urlFindingId) {
      setSelectedFinding({
        id: urlFindingId,
        summary: 'Loading finding…',
        severity: 'INFO',
        domain: 'Platform',
        status: 'OPEN',
        code: 'INVESTIGATION',
        check_id: '',
        check_version: 1,
        category: 'BUSINESS',
        confidence: 'HIGH',
        entity_type: null,
        entity_id: null,
        description: '',
        details: {},
        first_detected_at: '',
        detected_at: '',
        last_detected_at: '',
        occurrence_count: 1,
        repair_reference: null,
        repairability: 'DIAGNOSIS_ONLY',
        version: '1',
      });
      setFindingDetailOpen(true);
    }
  }, [urlFindingId]);

  // Tab switching helper
  const setTab = (tab: IntegrityTab, extraParams?: Record<string, string>) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);

      if (extraParams) {
        Object.entries(extraParams).forEach(([k, v]) => {
          params.set(k, v);
        });
        if (extraParams.module) {
          setFilters((prev) => ({ ...prev, module: extraParams.module! }));
        }
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const handleOpenFinding = (f: IntegrityFindingListItemDto) => {
    setSelectedFinding(f);
    setFindingDetailOpen(true);
  };

  const handleStartRepair = (f: IntegrityFindingDetailDto) => {
    setFindingDetailOpen(false);
    setRepairFinding(f);
    setRepairDialogOpen(true);
  };

  const handleRunSingleCheck = (checkId: string) => {
    setLauncherInitialCheckId(checkId);
    setLauncherOpen(true);
  };

  const handleFilterChange = (key: string, value: any) => {
    setFindingsPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleResetFilters = () => {
    setFindingsPage(1);
    setFilters({
      status: 'ALL',
      severity: 'ALL',
      module: 'ALL',
      checkId: 'ALL',
      repairableOnly: false,
      q: '',
    });
  };

  // Derive badge count for tabs
  const openCount = overview?.findingsCounts.totalOpen ?? 0;
  const repairableCount = overview?.checksSummary.repairableCount ?? 0;
  const activeScanRunning = Boolean(overview?.activeRun);

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Operations & Reliability"
        title="System Integrity Control Center"
        description="Authoritative platform diagnostics, cross-domain consistency verification, anomaly investigations, and controlled projection recovery."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadOverview();
                if (activeTab === 'findings') loadFindings();
                if (activeTab === 'scans') loadRuns();
              }}
              disabled={loadingOverview}
              className="h-9 cursor-pointer"
            >
              <RefreshCw className={`size-3.5 mr-1.5 ${loadingOverview ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {canRunChecks && (
              <Button
                size="sm"
                onClick={() => {
                  setLauncherInitialCheckId(undefined);
                  setLauncherOpen(true);
                }}
                className="h-9 cursor-pointer"
              >
                <Play className="size-3.5 mr-1.5" />
                Launch Scan
              </Button>
            )}
          </div>
        }
      />

      {/* Primary Sub-Navigation Bar */}
      <div className="border-b border-border">
        <nav
          className="-mb-px flex space-x-1 sm:space-x-2 overflow-x-auto pb-1 scrollbar-none"
          aria-label="System Integrity navigation tabs"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={cn(
                  'group flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer',
                  isActive
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  className={cn(
                    'size-4 transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                <span>{tab.label}</span>

                {/* Status Badges on Tab Labels */}
                {tab.badgeKey === 'findings' && openCount > 0 && (
                  <span
                    className={cn(
                      'px-1.5 py-0.2 rounded-full text-2xs font-mono font-semibold',
                      overview?.findingsCounts.critical && overview.findingsCounts.critical > 0
                        ? 'bg-rose-600 text-white'
                        : 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
                    )}
                  >
                    {openCount}
                  </span>
                )}

                {tab.badgeKey === 'scans' && activeScanRunning && (
                  <span className="size-2 rounded-full bg-primary animate-pulse" />
                )}

                {tab.badgeKey === 'recovery' && repairableCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-2xs font-mono bg-teal-500/20 text-teal-700 dark:text-teal-300">
                    {repairableCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Panels */}
      <div className="pt-2">
        {activeTab === 'overview' && (
          <OverviewTab
            overview={overview}
            loading={loadingOverview}
            onRefresh={loadOverview}
            onSelectTab={setTab}
            onOpenFinding={handleOpenFinding}
            onOpenLauncher={() => {
              setLauncherInitialCheckId(undefined);
              setLauncherOpen(true);
            }}
            canRunChecks={canRunChecks}
          />
        )}

        {activeTab === 'findings' && (
          <FindingsTab
            findings={findings}
            totalItems={findingsTotal}
            totalPages={findingsPages}
            currentPage={findingsPage}
            loading={loadingFindings}
            checks={checks}
            filters={filters}
            onFilterChange={handleFilterChange}
            onPageChange={setFindingsPage}
            onResetFilters={handleResetFilters}
            onOpenFinding={handleOpenFinding}
          />
        )}

        {activeTab === 'checks' && (
          <ChecksTab
            checks={checks}
            loading={loadingChecks}
            canRunChecks={canRunChecks}
            onRunSingleCheck={handleRunSingleCheck}
          />
        )}

        {activeTab === 'scans' && (
          <ScansTab
            runs={runs}
            activeRun={overview?.activeRun ?? null}
            totalItems={runsTotal}
            totalPages={runsPages}
            currentPage={runsPage}
            loading={loadingRuns}
            onPageChange={setRunsPage}
            onRefresh={() => {
              loadOverview();
              loadRuns();
            }}
            onOpenLauncher={() => {
              setLauncherInitialCheckId(undefined);
              setLauncherOpen(true);
            }}
            canRunChecks={canRunChecks}
          />
        )}

        {activeTab === 'recovery' && (
          <RecoveryTab
            repairableFindings={findings.filter((f) => f.repairability === 'REBUILDABLE_PROJECTION')}
            loading={loadingFindings}
            onRefresh={() => {
              loadOverview();
              loadFindings();
            }}
            onStartRepair={handleStartRepair}
            onOpenFinding={handleOpenFinding}
          />
        )}

        {activeTab === 'operations' && (
          <OperationsTab
            overview={overview}
            loading={loadingOverview}
            onRefresh={loadOverview}
          />
        )}

        {activeTab === 'settings' && <SettingsTab />}
      </div>

      {/* Detail Sheet */}
      <FindingDetailSheet
        finding={selectedFinding}
        open={findingDetailOpen}
        onOpenChange={(isOpen) => {
          setFindingDetailOpen(isOpen);
          if (!isOpen && urlFindingId) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('finding');
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
          }
        }}
        onRefreshList={() => {
          loadOverview();
          loadFindings();
        }}
        onStartRepair={handleStartRepair}
      />

      {/* Repair Workflow Dialog */}
      <RepairWorkflowDialog
        finding={repairFinding}
        open={repairDialogOpen}
        onOpenChange={(isOpen) => {
          setRepairDialogOpen(isOpen);
          if (!isOpen) setRepairFinding(null);
        }}
        onRepairCompleted={() => {
          loadOverview();
          loadFindings();
        }}
      />

      {/* Scan Launcher Dialog */}
      <ScanLauncherDialog
        checks={checks}
        open={launcherOpen}
        onOpenChange={setLauncherOpen}
        onScanLaunched={() => {
          loadOverview();
          setTab('scans');
          loadRuns();
        }}
        initialCheckId={launcherInitialCheckId}
      />
    </AdminPage>
  );
}
