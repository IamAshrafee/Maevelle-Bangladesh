'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Bell, Clock, Laptop, Shield, User } from 'lucide-react';
import type {
  AccountSecurityActivityItemDto,
  AccountSessionItemDto,
  ApiEnvelope,
  UserAccountOverviewDto,
} from '@maevelle/contracts';
import { apiRequest } from '@/lib/api';
import {
  AdminPage,
  ErrorState,
} from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationPreferencesTab } from '@/components/notifications/notification-preferences-tab';
import { AccountIdentityHeader } from './account-identity-header';
import { ProfileTab } from './profile-tab';
import { SecurityTab } from './security-tab';
import { SessionsTab } from './sessions-tab';
import { SecurityActivityTab } from './security-activity-tab';
import { getAccountErrorMessage } from './account-utils';

export type AccountTabId = 'profile' | 'security' | 'sessions' | 'activity' | 'notifications';

export function MyAccountConsole() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Tab state synced with URL parameter
  const tabParam = searchParams.get('tab') as AccountTabId | null;
  const [activeTab, setActiveTab] = useState<AccountTabId>(
    tabParam && ['security', 'sessions', 'activity', 'notifications'].includes(tabParam)
      ? tabParam
      : 'profile',
  );

  // Sync tab with URL search parameter
  const switchTab = (tab: AccountTabId) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'profile') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  };

  // Keep state in sync if browser back/forward is used
  useEffect(() => {
    if (tabParam && ['profile', 'security', 'sessions', 'activity', 'notifications'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Data states
  const [overview, setOverview] = useState<UserAccountOverviewDto | null>(null);
  const [sessions, setSessions] = useState<readonly AccountSessionItemDto[]>([]);
  const [activities, setActivities] = useState<readonly AccountSecurityActivityItemDto[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // Load account overview
  const loadOverview = useCallback(async () => {
    const res = await apiRequest<ApiEnvelope<UserAccountOverviewDto>>('/admin/account');
    setOverview(res.data);
    return res.data;
  }, []);

  // Load sessions
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await apiRequest<ApiEnvelope<AccountSessionItemDto[]>>('/admin/account/sessions');
      setSessions(res.data ?? []);
    } catch {
      // Fallback
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  // Load activity
  const loadActivities = useCallback(async () => {
    setActivitiesLoading(true);
    try {
      const res = await apiRequest<ApiEnvelope<AccountSecurityActivityItemDto[]>>(
        '/admin/account/activity',
      );
      setActivities(res.data ?? []);
    } catch {
      // Fallback
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  // Full initial load
  const loadAll = useCallback(async () => {
    setPageError(null);
    try {
      await Promise.all([loadOverview(), loadSessions(), loadActivities()]);
    } catch (err) {
      setPageError(
        getAccountErrorMessage(
          err,
          'Failed to load your account profile. Please check your connection and sign in again.',
        ),
      );
    } finally {
      setInitialLoading(false);
    }
  }, [loadOverview, loadSessions, loadActivities]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  if (pageError && !overview) {
    return (
      <AdminPage>
        <ErrorState
          title="Could not load My Account"
          message={pageError ?? 'Your personal profile information is currently unavailable.'}
          onRetry={() => {
            setInitialLoading(true);
            void loadAll();
          }}
        />
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      {/* Visual Identity Header */}
      {overview ? (
        <AccountIdentityHeader overview={overview} sessionsCount={sessions.length} />
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-2xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <Skeleton className="size-18 sm:size-20 rounded-full shrink-0" />
            <div className="space-y-2 min-w-0 flex-1">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-32 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-border my-6 gap-1 overflow-x-auto scrollbar-none" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'profile'}
          onClick={() => switchTab('profile')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors duration-150 cursor-pointer shrink-0 ${
            activeTab === 'profile'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <User className="size-3.5" aria-hidden="true" />
          Profile & Work Account
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'security'}
          onClick={() => switchTab('security')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors duration-150 cursor-pointer shrink-0 ${
            activeTab === 'security'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Shield className="size-3.5" aria-hidden="true" />
          Security & Password
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'sessions'}
          onClick={() => switchTab('sessions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors duration-150 cursor-pointer shrink-0 ${
            activeTab === 'sessions'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Laptop className="size-3.5" aria-hidden="true" />
          <span>Active Sessions</span>
          <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-full bg-muted border border-border/60">
            {sessions.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'activity'}
          onClick={() => switchTab('activity')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors duration-150 cursor-pointer shrink-0 ${
            activeTab === 'activity'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Clock className="size-3.5" aria-hidden="true" />
          Security Timeline
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'notifications'}
          onClick={() => switchTab('notifications')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors duration-150 cursor-pointer shrink-0 ${
            activeTab === 'notifications'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Bell className="size-3.5" aria-hidden="true" />
          Notification Alerts
        </button>
      </div>

      {/* Tab Panels */}
      <div role="tabpanel">
        {activeTab === 'profile' ? (
          overview ? (
            <ProfileTab
              overview={overview}
              onOverviewChange={setOverview}
              onReload={async () => {
                await loadOverview();
              }}
            />
          ) : (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <Skeleton className="h-5 w-40" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                </div>
              </div>
            </div>
          )
        ) : null}

        {activeTab === 'security' ? (
          overview ? (
            <SecurityTab
              overview={overview}
              onReload={async () => {
                await Promise.all([loadOverview(), loadSessions(), loadActivities()]);
              }}
            />
          ) : (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-9 w-64" />
              </div>
            </div>
          )
        ) : null}

        {activeTab === 'sessions' ? (
          <SessionsTab
            sessions={sessions}
            loading={sessionsLoading}
            onReload={async () => {
              await Promise.all([loadSessions(), loadOverview()]);
            }}
          />
        ) : null}

        {activeTab === 'activity' ? (
          <SecurityActivityTab
            activities={activities}
            loading={activitiesLoading}
          />
        ) : null}

        {activeTab === 'notifications' ? (
          <NotificationPreferencesTab />
        ) : null}
      </div>
    </AdminPage>
  );
}
