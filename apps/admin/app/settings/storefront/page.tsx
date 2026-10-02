import type { Metadata } from 'next';
import { StorefrontSettingsConsole } from '@/components/settings/storefront-settings-console';

export const metadata: Metadata = {
  title: 'Storefront Settings · Maevelle Admin',
  description: 'Manage public storefront URL, branding, and customer support channels.',
};

export default function StorefrontSettingsPage() {
  return <StorefrontSettingsConsole />;
}
