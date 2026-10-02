import type { Metadata } from 'next';
import { SystemSettingsConsole } from '@/components/settings/system-settings-console';

export const metadata: Metadata = {
  title: 'System Diagnostics · Maevelle Admin',
  description: 'Application runtime diagnostics, service status, and deployment boundaries.',
};

export default function SystemSettingsPage() {
  return <SystemSettingsConsole />;
}
