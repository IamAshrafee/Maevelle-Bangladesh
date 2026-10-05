import type { Metadata } from 'next';

import { TwoFactorSecurityConsole } from '@/components/security/two-factor-security-console';

export const metadata: Metadata = {
  title: 'Account Security · Maevelle Admin',
  description: 'Manage authenticator app protection and recovery codes.',
};

export default function AccountSecurityPage() {
  return <TwoFactorSecurityConsole />;
}
