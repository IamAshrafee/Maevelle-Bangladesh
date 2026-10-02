import type { Metadata } from 'next';
import { SettingsConsole } from '@/components/settings-console';

export const metadata: Metadata = {
  title: 'Organization Settings · Maevelle Admin',
  description: 'Manage legal organization profile, business identity, and storefront profiles.',
};

export default function OrganizationSettingsPage() {
  return <SettingsConsole />;
}
