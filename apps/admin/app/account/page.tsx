import type { Metadata } from 'next';
import { Suspense } from 'react';

import { MyAccountConsole } from '@/components/account/my-account-console';
import { LoadingState } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'My Account · Maevelle Admin',
  description: 'Manage your personal profile, credentials, security, and login sessions.',
};

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-96 items-center justify-center">
          <LoadingState message="Loading account details…" />
        </div>
      }
    >
      <MyAccountConsole />
    </Suspense>
  );
}
