import type { Metadata } from 'next';
import { CrmSettingsConsole } from '@/components/customers/crm-settings-console';
export const metadata: Metadata = { title: 'CRM settings' };
export default function Page() {
  return <CrmSettingsConsole />;
}
