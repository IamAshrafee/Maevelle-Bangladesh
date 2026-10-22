import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MessagingWorkspace } from '@/components/messaging/messaging-workspace';

export const metadata: Metadata = {
  title: 'Messaging · Maevelle Admin',
  description: 'Unified customer messaging, collaboration, follow-ups, routing, and reports.',
};

export default function MessagingPage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-[calc(100dvh-3.5rem)] place-items-center text-sm text-muted-foreground">
          Loading messaging workspace…
        </div>
      }
    >
      <MessagingWorkspace />
    </Suspense>
  );
}
