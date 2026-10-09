'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  Bell,
  Clock,
  FileCode2,
  Inbox,
  Radio,
  Settings2,
  Sliders,
  SlidersHorizontal,
} from 'lucide-react';
import { AdminPage, PageHeader } from '@/components/ui/page-shell';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { NotificationInboxTab } from './notification-inbox-tab';
import { NotificationHistoryTab } from './notification-history-tab';
import { NotificationTemplatesTab } from './notification-templates-tab';
import { NotificationRulesTab } from './notification-rules-tab';
import { NotificationChannelsTab } from './notification-channels-tab';
import { NotificationOperationsTab } from './notification-operations-tab';
import { NotificationPreferencesTab } from './notification-preferences-tab';

export type NotificationCenterTab =
  | 'inbox'
  | 'history'
  | 'templates'
  | 'rules'
  | 'channels'
  | 'operations'
  | 'preferences';

const TABS: readonly {
  readonly id: NotificationCenterTab;
  readonly label: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly description: string;
}[] = [
  {
    id: 'inbox',
    label: 'In-App Inbox',
    icon: Inbox,
    description: 'Personal operational alerts and staff notifications',
  },
  {
    id: 'history',
    label: 'Delivery History',
    icon: Clock,
    description: 'Authoritative audit trail across Email, SMS, and In-App',
  },
  {
    id: 'templates',
    label: 'Templates',
    icon: FileCode2,
    description: 'HTML email, SMS text, and notification message templates',
  },
  {
    id: 'rules',
    label: 'Notification Rules',
    icon: SlidersHorizontal,
    description: 'Event triggers, audience routing, and channel activation',
  },
  {
    id: 'channels',
    label: 'Channels & Providers',
    icon: Radio,
    description: 'Resend Email, SMS gateways, and delivery adapters',
  },
  {
    id: 'operations',
    label: 'Operations & Health',
    icon: Activity,
    description: 'Delivery queues, worker status, and failure recovery',
  },
  {
    id: 'preferences',
    label: 'My Preferences',
    icon: Sliders,
    description: 'Personal notification channel and alert preferences',
  },
];

export function NotificationsCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const activeTab: NotificationCenterTab = (searchParams.get('tab') as NotificationCenterTab) || 'inbox';
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
    <AdminPage>
      <PageHeader
        eyebrow="Communications & Dispatch"
        title="Notifications Center"
        description="Unified administration for in-app staff alerts, customer transactional email and SMS deliveries, channel adapters, template authoring, and operational recovery."
      />

      {/* Primary Sub-Navigation Bar */}
      <div className="border-b border-border">
        <nav
          className="-mb-px flex space-x-1 sm:space-x-2 overflow-x-auto pb-1 scrollbar-none"
          aria-label="Notifications navigation tabs"
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
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  className={cn(
                    'size-4 transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

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
