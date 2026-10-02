'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Activity,
  Layers,
  Zap,
  Sliders,
  Ban,
  ShieldCheck,
  RotateCw,
  Mail,
  AlertTriangle,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmailOverviewTab } from './email-overview-tab';
import { EmailActivityTab } from './email-activity-tab';
import { EmailTemplatesTab } from './email-templates-tab';
import { EmailTestLabTab } from './email-test-lab-tab';
import { EmailPoliciesTab } from './email-policies-tab';
import { EmailSuppressionsTab } from './email-suppressions-tab';
import { EmailDiagnosticsTab } from './email-diagnostics-tab';
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

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Header Area */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Transactional Email Operations
            </h1>
            {diagnostic ? (
              <Badge
                variant={diagnostic.enabled ? 'default' : 'secondary'}
                className={diagnostic.enabled ? 'bg-emerald-600 text-xs' : 'text-xs'}
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
          <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
            Authoritative transactional email control center: delivery lifecycles, Resend provider integration,
            policies, template rendering, safe testing, suppressions, and diagnostics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={reload}
            disabled={loading || isPending}
            className="h-8 text-xs"
          >
            <RotateCw className={`mr-1.5 size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
      </header>

      {/* Global Error Alert */}
      {error ? (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Primary Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 h-auto p-1 bg-muted/60">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 py-2 text-xs">
            <LayoutDashboard className="size-3.5" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1.5 py-2 text-xs">
            <Activity className="size-3.5" />
            <span>Activity</span>
            {totalEmails > 0 ? (
              <span className="ml-1 rounded-full bg-background px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                {totalEmails}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-1.5 py-2 text-xs">
            <Layers className="size-3.5" />
            <span>Templates</span>
          </TabsTrigger>
          <TabsTrigger value="test-lab" className="flex items-center gap-1.5 py-2 text-xs">
            <Zap className="size-3.5" />
            <span>Test Lab</span>
          </TabsTrigger>
          <TabsTrigger value="policies" className="flex items-center gap-1.5 py-2 text-xs">
            <Sliders className="size-3.5" />
            <span>Policies</span>
          </TabsTrigger>
          <TabsTrigger value="suppressions" className="flex items-center gap-1.5 py-2 text-xs">
            <Ban className="size-3.5" />
            <span>Suppressions</span>
            {suppressions.filter((s) => s.active).length > 0 ? (
              <span className="ml-1 rounded-full bg-destructive/10 text-destructive px-1.5 py-0.2 text-[10px] font-mono font-bold">
                {suppressions.filter((s) => s.active).length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="flex items-center gap-1.5 py-2 text-xs">
            <ShieldCheck className="size-3.5" />
            <span>Diagnostics</span>
          </TabsTrigger>
        </TabsList>

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
          <EmailPoliciesTab
            policies={policies}
            diagnostic={diagnostic}
            onRefresh={reload}
          />
        </TabsContent>

        {/* Tab 6: Suppression Registry */}
        <TabsContent value="suppressions" className="mt-6">
          <EmailSuppressionsTab suppressions={suppressions} onRefresh={reload} />
        </TabsContent>

        {/* Tab 7: Diagnostics & Setup Checklist */}
        <TabsContent value="diagnostics" className="mt-6">
          <EmailDiagnosticsTab diagnostic={diagnostic} onRefresh={reload} />
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
    </main>
  );
}
