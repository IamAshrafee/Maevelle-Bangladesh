import type { Metadata } from 'next';
import { SettingsOverviewConsole } from '@/components/settings/settings-overview-console';

export const metadata: Metadata = {
  title: 'Settings · Maevelle Admin',
  description: 'Manage Maevelle business configuration, integrations, security, and module preferences.',
};

export default function SettingsPage() {
  return <SettingsOverviewConsole />;
}
