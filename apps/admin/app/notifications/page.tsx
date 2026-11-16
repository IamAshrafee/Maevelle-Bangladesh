import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NotificationsCenter } from '@/components/notifications/notifications-center';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Notifications Center · Maevelle Admin',
  description:
    'In-app staff notifications, multi-channel delivery audit logs, templates, provider settings, and operational recovery.',
};

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <NotificationsCenter />
    </Suspense>
  );
}
