import * as React from 'react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { MyAccountConsole } from '@/components/account/my-account-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My Account · Maevelle Admin',
  description: 'Manage your personal profile, credentials, security, and login sessions.',
};

export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" widthVariant="standard" />}>
      <MyAccountConsole />
    </Suspense>
  );
}
