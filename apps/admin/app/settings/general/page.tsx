import type { Metadata } from 'next';
import { GeneralSettingsConsole } from '@/components/settings/general-settings-console';

export const metadata: Metadata = {
  title: 'General Settings · Maevelle Admin',
  description: 'Manage business identity, timezone, operational thresholds, and session security.',
};

export default function GeneralSettingsPage() {
  return <GeneralSettingsConsole />;
}
