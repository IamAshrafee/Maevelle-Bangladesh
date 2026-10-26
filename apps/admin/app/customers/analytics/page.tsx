import type { Metadata } from 'next';
import { CrmAnalyticsConsole } from '@/components/customers/crm-analytics-console';
export const metadata: Metadata = { title: 'CRM analytics' };
export default function Page() {
  return <CrmAnalyticsConsole />;
}
