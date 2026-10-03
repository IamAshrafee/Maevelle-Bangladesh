import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RefreshCw } from 'lucide-react';
import { SmsOperationsConsole } from '@/components/sms/sms-operations-console';

export const metadata: Metadata = {
  title: 'SMS Operations · Maevelle Admin',
  description: 'Transactional SMS operations, templates, policies, suppressions, and provider diagnostics.',
};

export default function SmsOperationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-96 flex-col items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="size-6 animate-spin text-primary" />
          <p className="text-sm">Loading SMS Operations Console...</p>
        </div>
      }
    >
      <SmsOperationsConsole />
    </Suspense>
  );
}
