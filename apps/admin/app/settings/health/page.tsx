import type { Metadata } from 'next';
import { ConfigurationHealthConsole } from '@/components/settings/configuration-health-console';

export const metadata: Metadata = {
  title: 'Configuration Health · Maevelle Admin',
  description: 'Authoritative configuration readiness, actionable issues, and domain health.',
};

export default function ConfigurationHealthPage() {
  return <ConfigurationHealthConsole />;
}
