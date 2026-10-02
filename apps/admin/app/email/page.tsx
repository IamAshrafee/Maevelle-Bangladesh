import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RefreshCw } from 'lucide-react';
import { EmailOperationsConsole } from '@/components/email/email-operations-console';

export const metadata: Metadata = {
  title: 'Email Operations · Maevelle Admin',
  description: 'Transactional email operations, activity logs, template previews, policies, and deliverability diagnostics.',
};

export default function EmailOperationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-96 flex-col items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="size-6 animate-spin text-primary" />
          <p className="text-sm">Loading Email Operations Console...</p>
        </div>
      }
    >
      <EmailOperationsConsole />
    </Suspense>
  );
}
