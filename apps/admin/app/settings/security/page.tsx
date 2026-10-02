import type { Metadata } from 'next';
import { SecuritySettingsConsole } from '@/components/settings/security-settings-console';

export const metadata: Metadata = {
  title: 'Security Settings · Maevelle Admin',
  description: 'Manage session timeouts, authentication safeguards, and security policies.',
};

export default function SecuritySettingsPage() {
  return <SecuritySettingsConsole />;
}
