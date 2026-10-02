import type { Metadata } from 'next';
import { IntegrationsHub } from '@/components/settings/integrations-hub';

export const metadata: Metadata = {
  title: 'Integrations · Maevelle Admin',
  description: 'Manage external service connections, courier credentials, email providers, and storage.',
};

export default function IntegrationsSettingsPage() {
  return <IntegrationsHub />;
}
