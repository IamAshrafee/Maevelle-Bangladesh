import type { Metadata } from 'next';
import { ResendIntegrationConsole } from '@/components/settings/resend-integration-console';

export const metadata: Metadata = {
  title: 'Resend Integration · Maevelle Admin',
  description: 'Manage Resend API credentials, webhook verification, and connection diagnostics.',
};

export default function ResendIntegrationPage() {
  return <ResendIntegrationConsole />;
}
