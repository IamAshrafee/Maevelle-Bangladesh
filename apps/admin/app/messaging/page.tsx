import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MessagingWorkspace } from '@/components/messaging/messaging-workspace';
import { AdminPage } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Messaging · Maevelle Admin',
  description: 'Unified customer messaging, collaboration, follow-ups, routing, and reports.',
};

export default function MessagingPage() {
  return (
    <Suspense
      fallback={
        <AdminPage variant="immersive">
          <div className="grid flex-1 min-h-0 place-items-center text-sm text-muted-foreground">
            Loading messaging workspace…
          </div>
        </AdminPage>
      }
    >
      <MessagingWorkspace />
    </Suspense>
  );
}
