'use client';

import dynamic from 'next/dynamic';
import { BarChart3, CalendarClock, Inbox, Settings2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { AvailabilityControl } from './availability-control';
import { CollaborationPanel } from './collaboration-panel';
import { ConversationPane } from './conversation-pane';
import { FollowUpsView } from './follow-ups-view';
import { InboxPane } from './inbox-pane';
import { MessagingProvider, useMessaging } from './messaging-provider';
import type { WorkspaceView } from './types';

const ReportsView = dynamic(() => import('./reports-view').then((module) => module.ReportsView), {
  loading: () => <WorkspaceLoader label="Loading reports…" />,
});
const SettingsView = dynamic(
  () => import('./settings-view').then((module) => module.SettingsView),
  { loading: () => <WorkspaceLoader label="Loading settings…" /> },
);

export function MessagingWorkspace() {
  return (
    <Toaster>
      <MessagingProvider>
        <MessagingWorkspaceContent />
      </MessagingProvider>
    </Toaster>
  );
}

function MessagingWorkspaceContent() {
  const messaging = useMessaging();
  const searchParams = useSearchParams();
  const [view, setView] = useState<WorkspaceView>(() =>
    searchParams.has('facebook') || searchParams.has('instagram') ? 'settings' : 'inbox',
  );
  const [contextOpen, setContextOpen] = useState(false);
  useEffect(() => {
    if (searchParams.has('facebook') || searchParams.has('instagram')) setView('settings');
  }, [searchParams]);
  const items = [
    { value: 'inbox' as const, label: 'Inbox', icon: Inbox, visible: true },
    {
      value: 'follow-ups' as const,
      label: 'Follow-ups',
      icon: CalendarClock,
      visible: messaging.capabilities.includes('messaging.follow_ups.manage'),
    },
    {
      value: 'reports' as const,
      label: 'Reports',
      icon: BarChart3,
      visible: messaging.capabilities.includes('messaging.reports.view'),
    },
    {
      value: 'settings' as const,
      label: 'Settings',
      icon: Settings2,
      visible: messaging.capabilities.includes('messaging.settings.manage'),
    },
  ];
  return (
    <main
      className="flex h-[calc(100dvh-7.5rem)] min-h-[36rem] w-full min-w-0 flex-col overflow-x-hidden bg-background md:h-[calc(100dvh-3.5rem)]"
      aria-label="Messaging workspace"
    >
      <header className="flex min-h-16 shrink-0 flex-col justify-center gap-2 border-b border-border bg-card px-3 py-2 sm:px-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Messaging</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Customer conversations, collaboration, follow-ups, and operational controls.
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <nav
            className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto"
            aria-label="Messaging sections"
          >
            {items
              .filter((item) => item.visible)
              .map((item) => (
                <Button
                  key={item.value}
                  variant={view === item.value ? 'secondary' : 'ghost'}
                  size="sm"
                  className="shrink-0"
                  aria-label={item.label}
                  onClick={() => setView(item.value)}
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                  {item.value === 'follow-ups' && messaging.counts?.overdueFollowUps ? (
                    <span className="rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground tabular-nums">
                      {messaging.counts.overdueFollowUps}
                    </span>
                  ) : null}
                </Button>
              ))}
          </nav>
          <AvailabilityControl />
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {view === 'inbox' ? (
          <div className="grid h-full min-h-0 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(19rem,23rem)_minmax(28rem,1fr)_minmax(18rem,21rem)]">
            <div className={cn('min-h-0', messaging.selectedConversationId && 'hidden lg:block')}>
              <InboxPane />
            </div>
            <div className={cn('min-h-0', !messaging.selectedConversationId && 'hidden lg:block')}>
              <ConversationPane onOpenContext={() => setContextOpen(true)} />
            </div>
            <div className="hidden min-h-0 border-l border-border xl:block">
              <CollaborationPanel />
            </div>
          </div>
        ) : null}
        {view === 'follow-ups' ? (
          <FollowUpsView onOpenConversation={() => setView('inbox')} />
        ) : null}
        {view === 'reports' ? <ReportsView /> : null}
        {view === 'settings' ? <SettingsView /> : null}
      </div>
      <Sheet open={contextOpen} onOpenChange={setContextOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>Customer context</SheetTitle>
            <SheetDescription>
              Customer commerce history and internal collaboration.
            </SheetDescription>
          </SheetHeader>
          <CollaborationPanel />
        </SheetContent>
      </Sheet>
    </main>
  );
}

function WorkspaceLoader({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">{label}</div>
  );
}
