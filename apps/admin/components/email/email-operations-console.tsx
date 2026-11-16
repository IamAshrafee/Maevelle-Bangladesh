'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { AdminPage, PageHeader } from '@/components/ui/page-shell';
import { RefreshButton } from '@/components/ui/refresh-button';
import { WorkspaceTabs, type WorkspaceTabItem } from '@/components/ui/workspace-tabs';
import { Badge } from '@/components/ui/badge';
import { EmailOverviewTab } from './email-overview-tab';
import { EmailActivityTab } from './email-activity-tab';
import { EmailTemplatesTab } from './email-templates-tab';
import { EmailTestLabTab } from './email-test-lab-tab';
import { EmailPoliciesTab } from './email-policies-tab';
import { EmailSuppressionsTab } from './email-suppressions-tab';
import { EmailDiagnosticsTab } from './email-diagnostics-tab';
import { EmailSettingsTab } from './email-settings-tab';
import { EmailDetailDrawer } from './email-detail-drawer';
import {
  type EmailTabKey,
  type EmailDiagnosticsDto,
  type EmailPolicyDto,
  type EmailNotificationRowDto,
  type EmailNotificationDetailDto,
  type EmailTemplateSummary,
  type EmailSuppressionDto,
  fetchEmailApi,
} from './email-types';

export function EmailOperationsConsole() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Active tab state driven by URL or default 'overview'
  const activeTab = (searchParams.get('tab') as EmailTabKey) || 'overview';

  // Filters & Pagination for Activity Tab
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [eventFilter, setEventFilter] = useState(searchParams.get('event') || '');
  const [triggerFilter, setTriggerFilter] = useState(searchParams.get('trigger') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');

  // Domain state
  const [diagnostic, setDiagnostic] = useState<EmailDiagnosticsDto>();
  const [policies, setPolicies] = useState<readonly EmailPolicyDto[]>([]);
  const [emails, setEmails] = useState<readonly EmailNotificationRowDto[]>([]);
  const [totalEmails, setTotalEmails] = useState(0);
  const [templates, setTemplates] = useState<readonly EmailTemplateSummary[]>([]);
  const [suppressions, setSuppressions] = useState<readonly EmailSuppressionDto[]>([]);

  // Drawer & detail inspection state
  const [selectedDetail, setSelectedDetail] = useState<EmailNotificationDetailDto | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Loading & error state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Synchronize Tab with URL
  const handleTabChange = (newTab: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', newTab);
      router.replace(`/email?${params.toString()}`);
    });
  };

  // Inspect email row
  const inspectEmail = useCallback(async (email: EmailNotificationRowDto) => {
    try {
      const result = await fetchEmailApi<{ data: EmailNotificationDetailDto }>(
        `/admin/email/operations/${email.id}`,
      );
      setSelectedDetail(result.data);
      setDrawerOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load email details.');
    }
  }, []);

  // Primary data loader
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Build query string for activity
      const activityParams = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter) activityParams.set('status', statusFilter);
      if (eventFilter) activityParams.set('notificationType', eventFilter);
      if (triggerFilter) activityParams.set('triggerType', triggerFilter);
      if (searchQuery.trim()) activityParams.set('search', searchQuery.trim());

      const [diagRes, polRes, emailRes, tplRes, supRes] = await Promise.all([
        fetchEmailApi<{ data: EmailDiagnosticsDto }>('/admin/email/diagnostics'),
        fetchEmailApi<{ data: EmailPolicyDto[] }>('/admin/email/policies'),
        fetchEmailApi<{ data: EmailNotificationRowDto[]; pagination: { totalItems: number } }>(
          `/admin/email/operations?${activityParams.toString()}`,
        ),
        fetchEmailApi<{ data: EmailTemplateSummary[] }>('/admin/email/templates'),
        fetchEmailApi<{ data: EmailSuppressionDto[] }>('/admin/email/suppressions'),
      ]);

      setDiagnostic(diagRes.data);
      setPolicies(polRes.data);
      setEmails(emailRes.data);
      setTotalEmails(emailRes.pagination.totalItems);
      setTemplates(tplRes.data);
      setSuppressions(supRes.data);

      // If notificationId is in URL, auto-open
      const urlNotificationId = searchParams.get('notificationId');
      if (urlNotificationId && !selectedDetail) {
        const found = emailRes.data.find((e) => e.id === urlNotificationId);
        if (found) {
          void inspectEmail(found);
        } else {
          try {
            const detailRes = await fetchEmailApi<{ data: EmailNotificationDetailDto }>(
              `/admin/email/operations/${urlNotificationId}`,
            );
            setSelectedDetail(detailRes.data);
            setDrawerOpen(true);
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load email operations.');
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    statusFilter,
    eventFilter,
    triggerFilter,
    searchQuery,
    searchParams,
    selectedDetail,
    inspectEmail,
  ]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Polling for active operations: if any email is in QUEUED or PROCESSING, refresh every 6 seconds
  useEffect(() => {
    const hasPending = emails.some((e) => e.status === 'QUEUED' || e.status === 'PROCESSING');
    if (!hasPending) return;

    const timer = setInterval(() => {
      void reload();
    }, 6000);

    return () => clearInterval(timer);
  }, [emails, reload]);

  const activeSuppressionCount = suppressions.filter((s) => s.active).length;
  const emailTabs: WorkspaceTabItem<EmailTabKey>[] = [
    { value: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    {
      value: 'activity',
      label: 'Activity',
      icon: 'activity',
      ...(totalEmails > 0 ? { count: totalEmails } : {}),
    },
    { value: 'templates', label: 'Templates', icon: 'boxes' },
    { value: 'test-lab', label: 'Test Lab', icon: 'sparkles' },
    { value: 'policies', label: 'Policies', icon: 'settings' },
    {
      value: 'suppressions',
      label: 'Suppressions',
      icon: 'shield-check',
      ...(activeSuppressionCount > 0 ? { count: activeSuppressionCount } : {}),
    },
    { value: 'diagnostics', label: 'Diagnostics', icon: 'gauge' },
    { value: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <AdminPage variant="wide">
      <PageHeader
        eyebrow="Communications & Dispatch"
        title="Transactional Email Operations"
        badge={
          <div className="flex flex-wrap items-center gap-2">
            {diagnostic ? (
              <Badge
                variant={diagnostic.enabled ? 'default' : 'secondary'}
                className={diagnostic.enabled ? 'bg-emerald-600 text-xs text-white' : 'text-xs'}
              >
                {diagnostic.enabled ? 'Sending Active' : 'Sending Disabled'}
              </Badge>
            ) : null}
            {diagnostic?.environment && diagnostic.environment !== 'production' ? (
              <Badge variant="outline" className="text-xs uppercase font-mono">
                {diagnostic.environment}
              </Badge>
            ) : null}
          </div>
        }
        description="Authoritative transactional email control center: delivery lifecycles, Resend provider integration, policies, template rendering, safe testing, suppressions, and diagnostics."
        actions={
          <RefreshButton
            loading={loading || isPending}
            onRefresh={reload}
            tooltip="Refresh email operations"
          />
        }
      />

      {/* Global Error Alert */}
      {error ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Primary Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <WorkspaceTabs
          items={emailTabs}
          value={activeTab}
          onValueChange={handleTabChange}
          maxVisible={5}
          variant="pill"
          ariaLabel="Email operations tabs"
        />

        {/* Tab 1: Overview Dashboard */}
        <TabsContent value="overview" className="mt-6">
          <EmailOverviewTab
            diagnostic={diagnostic}
            recentEmails={emails}
            onSelectTab={handleTabChange}
            onInspectEmail={inspectEmail}
            onRefresh={reload}
          />
        </TabsContent>

        {/* Tab 2: Activity List & Search */}
        <TabsContent value="activity" className="mt-6">
          <EmailActivityTab
            emails={emails}
            totalItems={totalEmails}
            page={page}
            pageSize={pageSize}
            statusFilter={statusFilter}
            eventFilter={eventFilter}
            triggerFilter={triggerFilter}
            searchQuery={searchQuery}
            loading={loading}
            onSearchChange={(q) => {
              setSearchQuery(q);
              setPage(1);
            }}
            onStatusFilterChange={(s) => {
              setStatusFilter(s);
              setPage(1);
            }}
            onEventFilterChange={(ev) => {
              setEventFilter(ev);
              setPage(1);
            }}
            onTriggerFilterChange={(trig) => {
              setTriggerFilter(trig);
              setPage(1);
            }}
            onPageChange={setPage}
            onInspectEmail={inspectEmail}
            onRefresh={reload}
          />
        </TabsContent>

        {/* Tab 3: Templates Gallery & Preview */}
        <TabsContent value="templates" className="mt-6">
          <EmailTemplatesTab templates={templates} policies={policies} />
        </TabsContent>

        {/* Tab 4: Safe Test Lab */}
        <TabsContent value="test-lab" className="mt-6">
          <EmailTestLabTab
            diagnostic={diagnostic}
            templates={templates}
            recentEmails={emails}
            onInspectEmail={inspectEmail}
            onRefresh={reload}
          />
        </TabsContent>

        {/* Tab 5: Policy Controls */}
        <TabsContent value="policies" className="mt-6">
          <EmailPoliciesTab policies={policies} diagnostic={diagnostic} onRefresh={reload} />
        </TabsContent>

        {/* Tab 6: Suppression Registry */}
        <TabsContent value="suppressions" className="mt-6">
          <EmailSuppressionsTab suppressions={suppressions} onRefresh={reload} />
        </TabsContent>

        {/* Tab 7: Diagnostics & Setup Checklist */}
        <TabsContent value="diagnostics" className="mt-6">
          <EmailDiagnosticsTab diagnostic={diagnostic} onRefresh={reload} />
        </TabsContent>

        {/* Tab 8: Runtime Email Settings */}
        <TabsContent value="settings" className="mt-6">
          <EmailSettingsTab />
        </TabsContent>
      </Tabs>

      {/* Slide-out Email Detail Drawer */}
      <EmailDetailDrawer
        notification={selectedDetail}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            // Remove notificationId query param if present
            const params = new URLSearchParams(searchParams.toString());
            if (params.has('notificationId')) {
              params.delete('notificationId');
              router.replace(`/email?${params.toString()}`);
            }
          }
        }}
        onActionCompleted={reload}
      />
    </AdminPage>
  );
}
