'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, MessageSquareText } from 'lucide-react';
import type {
  SmsActivityFilters,
  SmsDiagnosticsDto,
  SmsNotificationDetailDto,
  SmsNotificationRowDto,
  SmsPolicyDto,
  SmsSuppressionDto,
  SmsTabKey,
  SmsTemplateDto,
} from './sms-types';
import { buildSmsActivityQuery, isPendingSmsStatus } from './sms-types';
import { fetchSmsApi } from './sms-api';
import { SmsActivityTab } from './sms-activity-tab';
import { SmsDetailSheet } from './sms-detail-sheet';
import { SmsDiagnosticsTab } from './sms-diagnostics-tab';
import { SmsOverviewTab } from './sms-overview-tab';
import { SmsPoliciesTab } from './sms-policies-tab';
import { SmsSuppressionsTab } from './sms-suppressions-tab';
import { SmsTemplatesTab } from './sms-templates-tab';
import { SmsTestLabTab } from './sms-test-lab-tab';
import { Badge } from '@/components/ui/badge';

import type { NavIconKey } from '@/lib/navigation/route-registry';
import { AdminPage, PageHeader } from '@/components/ui/page-shell';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { WorkspaceTabs, type WorkspaceTabItem } from '@/components/ui/workspace-tabs';

const tabs: readonly { key: SmsTabKey; label: string; icon: NavIconKey }[] = [
  { key: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { key: 'activity', label: 'Activity', icon: 'activity' },
  { key: 'templates', label: 'Templates', icon: 'boxes' },
  { key: 'test-lab', label: 'Test Lab', icon: 'sparkles' },
  { key: 'policies', label: 'Policies', icon: 'settings' },
  { key: 'suppressions', label: 'Suppressions', icon: 'shield-check' },
  { key: 'diagnostics', label: 'Provider & Diagnostics', icon: 'plug' },
];

const emptyFilters: SmsActivityFilters = {
  search: '',
  status: '',
  notificationType: '',
  triggerType: '',
  encoding: '',
  provider: '',
  createdFrom: '',
  createdTo: '',
};

export function SmsOperationsConsole() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const activeTab = (
    tabs.some((tab) => tab.key === searchParams.get('tab')) ? searchParams.get('tab') : 'overview'
  ) as SmsTabKey;
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const pageSize = 25;
  const [filters, setFilters] = useState<SmsActivityFilters>(() => ({
    ...emptyFilters,
    search: searchParams.get('search') ?? '',
    status: searchParams.get('status') ?? '',
    notificationType: searchParams.get('notificationType') ?? '',
    triggerType: searchParams.get('triggerType') ?? '',
    encoding: searchParams.get('encoding') ?? '',
    provider: searchParams.get('provider') ?? '',
    createdFrom: searchParams.get('createdFrom') ?? '',
    createdTo: searchParams.get('createdTo') ?? '',
  }));
  const [diagnostics, setDiagnostics] = useState<SmsDiagnosticsDto>();
  const [operations, setOperations] = useState<readonly SmsNotificationRowDto[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [templates, setTemplates] = useState<readonly SmsTemplateDto[]>([]);
  const [policies, setPolicies] = useState<readonly SmsPolicyDto[]>([]);
  const [suppressions, setSuppressions] = useState<readonly SmsSuppressionDto[]>([]);
  const [selected, setSelected] = useState<SmsNotificationDetailDto | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const syncUrl = useCallback(
    (tab: SmsTabKey, nextFilters = filters, nextPage = page, notificationId?: string | null) => {
      const params = new URLSearchParams();
      params.set('tab', tab);
      if (tab === 'activity') {
        const activity = new URLSearchParams(
          buildSmsActivityQuery(nextFilters, nextPage, pageSize),
        );
        activity.forEach((value, key) => {
          if (!(key === 'pageSize')) params.set(key, value);
        });
      }
      if (notificationId) params.set('notificationId', notificationId);
      startTransition(() => router.replace(`/sms?${params.toString()}`));
    },
    [filters, page, router],
  );

  const inspect = useCallback(
    async (id: string) => {
      setError('');
      try {
        const detail = await fetchSmsApi<SmsNotificationDetailDto>(`/admin/sms/operations/${id}`);
        setSelected(detail);
        setDetailOpen(true);
        syncUrl(activeTab, filters, page, id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'SMS detail could not be loaded.');
      }
    },
    [activeTab, filters, page, syncUrl],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = buildSmsActivityQuery(filters, page, pageSize);
      const [diag, activity, templateRows, policyRows, suppressionRows] = await Promise.all([
        fetchSmsApi<SmsDiagnosticsDto>('/admin/sms/diagnostics'),
        fetchSmsApi<{
          items: readonly SmsNotificationRowDto[];
          pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
        }>(`/admin/sms/operations?${query}`),
        fetchSmsApi<readonly SmsTemplateDto[]>('/admin/sms/templates'),
        fetchSmsApi<readonly SmsPolicyDto[]>('/admin/sms/policies'),
        fetchSmsApi<readonly SmsSuppressionDto[]>('/admin/sms/suppressions'),
      ]);
      setDiagnostics(diag);
      setOperations(activity.items);
      setTotalItems(activity.pagination.totalItems);
      setTotalPages(activity.pagination.totalPages);
      setTemplates(templateRows);
      setPolicies(policyRows);
      setSuppressions(suppressionRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SMS operations could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const notificationId = searchParams.get('notificationId');
    if (notificationId && selected?.id !== notificationId) void inspect(notificationId);
  }, [inspect, searchParams, selected?.id]);
  useEffect(() => {
    if (!operations.some((item) => isPendingSmsStatus(item.status))) return;
    const timer = setInterval(() => void reload(), 7000);
    return () => clearInterval(timer);
  }, [operations, reload]);

  const changeTab = (value: string) => syncUrl(value as SmsTabKey, filters, page, selected?.id);
  const changeFilters = (next: SmsActivityFilters) => {
    setFilters(next);
    setPage(1);
    syncUrl('activity', next, 1, selected?.id);
  };
  const changePage = (next: number) => {
    setPage(next);
    syncUrl('activity', filters, next, selected?.id);
  };
  const refreshDetail = useCallback(
    async (id: string) => {
      const detail = await fetchSmsApi<SmsNotificationDetailDto>(`/admin/sms/operations/${id}`);
      setSelected(detail);
      await reload();
    },
    [reload],
  );

  const smsTabItems: WorkspaceTabItem<SmsTabKey>[] = tabs.map((tab) => ({
    value: tab.key,
    label: tab.label,
    icon: tab.icon,
    ...(tab.key === 'activity' && totalItems > 0 ? { count: totalItems } : {}),
  }));

  return (
    <AdminPage variant="wide">
      <PageHeader
        eyebrow="Communications & Dispatch"
        title="Maevelle SMS"
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <MessageSquareText aria-hidden="true" className="size-5 text-primary" />
            {diagnostics ? (
              <Badge variant={diagnostics.enabled ? 'default' : 'secondary'}>
                {diagnostics.enabled ? 'Platform Enabled' : 'Sending Disabled'}
              </Badge>
            ) : null}
            {diagnostics?.mode === 'MOCK' ? <Badge variant="outline">Mock Mode</Badge> : null}
          </div>
        }
        description="Transactional SMS operations, delivery truth, template analysis, controlled testing, recipient protection, and provider readiness."
        actions={
          <RefreshButton
            loading={loading || isPending}
            onRefresh={() => void reload()}
            tooltip="Refresh SMS operations"
          />
        }
      />
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      <Tabs value={activeTab} onValueChange={changeTab}>
        <WorkspaceTabs
          items={smsTabItems}
          value={activeTab}
          onValueChange={(next) => changeTab(next)}
          maxVisible={5}
          variant="pill"
          ariaLabel="SMS operations tabs"
        />
        <TabsContent value="overview" className="mt-6">
          <SmsOverviewTab
            diagnostics={diagnostics}
            recent={operations}
            onSelectTab={(tab) => syncUrl(tab)}
            onInspect={(id) => void inspect(id)}
          />
        </TabsContent>
        <TabsContent value="activity" className="mt-6">
          <SmsActivityTab
            items={operations}
            totalItems={totalItems}
            totalPages={totalPages}
            page={page}
            pageSize={pageSize}
            filters={filters}
            templates={templates}
            loading={loading}
            onFiltersChange={changeFilters}
            onPageChange={changePage}
            onInspect={(id) => void inspect(id)}
            onRefresh={() => void reload()}
          />
        </TabsContent>
        <TabsContent value="templates" className="mt-6">
          <SmsTemplatesTab templates={templates} policies={policies} />
        </TabsContent>
        <TabsContent value="test-lab" className="mt-6">
          <SmsTestLabTab
            diagnostics={diagnostics}
            templates={templates}
            onInspect={(id) => void inspect(id)}
            onRefresh={reload}
          />
        </TabsContent>
        <TabsContent value="policies" className="mt-6">
          <SmsPoliciesTab policies={policies} diagnostics={diagnostics} onRefresh={reload} />
        </TabsContent>
        <TabsContent value="suppressions" className="mt-6">
          <SmsSuppressionsTab suppressions={suppressions} onRefresh={reload} />
        </TabsContent>
        <TabsContent value="diagnostics" className="mt-6">
          <SmsDiagnosticsTab diagnostics={diagnostics} />
        </TabsContent>
      </Tabs>
      <SmsDetailSheet
        notification={selected}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('notificationId');
            startTransition(() => router.replace(`/sms?${params.toString()}`));
          }
        }}
        onRefresh={refreshDetail}
      />
    </AdminPage>
  );
}
