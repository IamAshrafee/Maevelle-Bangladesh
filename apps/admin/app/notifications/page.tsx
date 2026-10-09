import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RefreshCw } from 'lucide-react';
import { NotificationsCenter } from '@/components/notifications/notifications-center';

export const metadata: Metadata = {
  title: 'Notifications Center · Maevelle Admin',
  description: 'In-app staff notifications, multi-channel delivery audit logs, templates, provider settings, and operational recovery.',
};

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-96 flex-col items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="size-6 animate-spin text-primary" />
          <p className="text-sm">Loading Notifications Center...</p>
        </div>
      }
    >
      <NotificationsCenter />
    </Suspense>
  );
}
