'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdminPage, PageHeader } from '@/components/ui/page-shell';
import { RefreshButton } from '@/components/ui/refresh-button';
import { WorkspaceTabs, type WorkspaceTabItem } from '@/components/ui/workspace-tabs';
import { NotificationInboxTab } from './notification-inbox-tab';
import { NotificationHistoryTab } from './notification-history-tab';
import { NotificationTemplatesTab } from './notification-templates-tab';
import { NotificationRulesTab } from './notification-rules-tab';
import { NotificationChannelsTab } from './notification-channels-tab';
import { NotificationOperationsTab } from './notification-operations-tab';
import { NotificationPreferencesTab } from './notification-preferences-tab';

export type NotificationCenterTab =
  'inbox' | 'history' | 'templates' | 'rules' | 'channels' | 'operations' | 'preferences';

const NOTIFICATION_TABS: WorkspaceTabItem<NotificationCenterTab>[] = [
  { value: 'inbox', label: 'In-App Inbox', icon: 'inbox' },
  { value: 'history', label: 'Delivery History', icon: 'activity' },
  { value: 'templates', label: 'Templates', icon: 'mail' },
  { value: 'rules', label: 'Notification Rules', icon: 'settings' },
  { value: 'channels', label: 'Channels & Providers', icon: 'plug' },
  { value: 'operations', label: 'Operations & Health', icon: 'gauge' },
  { value: 'preferences', label: 'My Preferences', icon: 'user-round-cog' },
];

export function NotificationsCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const activeTab: NotificationCenterTab =
    (searchParams.get('tab') as NotificationCenterTab) || 'inbox';
  const initialChannel = searchParams.get('channel') || undefined;
  const initialStatus = searchParams.get('status') || undefined;
  const initialSourceId = searchParams.get('sourceId') || undefined;

  const setTab = (tab: NotificationCenterTab) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      // Clean up filters when deliberately switching away from history tab unless explicitly desired
      if (tab !== 'history') {
        params.delete('channel');
        params.delete('status');
        params.delete('sourceId');
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <AdminPage variant="wide">
      <PageHeader
        eyebrow="Communications & Dispatch"
        title="Notifications Center"
        description="Unified administration for in-app staff alerts, customer transactional email and SMS deliveries, channel adapters, template authoring, and operational recovery."
        actions={<RefreshButton tooltip="Refresh notifications center" />}
      />

      {/* Primary Sub-Navigation Bar */}
      <WorkspaceTabs
        items={NOTIFICATION_TABS}
        value={activeTab}
        onValueChange={setTab}
        maxVisible={5}
        variant="underline"
        ariaLabel="Notifications navigation tabs"
      />

      {/* Tab Panels */}
      <div className="pt-2">
        {activeTab === 'inbox' && <NotificationInboxTab />}

        {activeTab === 'history' && (
          <NotificationHistoryTab
            initialChannel={initialChannel}
            initialStatus={initialStatus}
            initialSourceId={initialSourceId}
          />
        )}

        {activeTab === 'templates' && <NotificationTemplatesTab />}

        {activeTab === 'rules' && <NotificationRulesTab />}

        {activeTab === 'channels' && <NotificationChannelsTab />}

        {activeTab === 'operations' && <NotificationOperationsTab />}

        {activeTab === 'preferences' && <NotificationPreferencesTab />}
      </div>
    </AdminPage>
  );
}
