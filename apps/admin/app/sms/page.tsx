import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SmsOperationsConsole } from '@/components/sms/sms-operations-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'SMS Operations · Maevelle Admin',
  description:
    'Transactional SMS operations, templates, policies, suppressions, and provider diagnostics.',
};

export default function SmsOperationsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <SmsOperationsConsole />
    </Suspense>
  );
}
