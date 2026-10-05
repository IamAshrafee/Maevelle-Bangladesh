import type { Metadata } from 'next';

import { MyAccountConsole } from '@/components/account/my-account-console';

export const metadata: Metadata = {
  title: 'My Account · Maevelle Admin',
  description: 'Manage your personal profile, credentials, security, and login sessions.',
};

export default function AccountPage() {
  return <MyAccountConsole />;
}
