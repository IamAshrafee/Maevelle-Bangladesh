import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EmailOperationsConsole } from '@/components/email/email-operations-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Email Operations · Maevelle Admin',
  description:
    'Transactional email operations, activity logs, template previews, policies, and deliverability diagnostics.',
};

export default function EmailOperationsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <EmailOperationsConsole />
    </Suspense>
  );
}
