import type { Metadata } from 'next';
import { PrivacyRequestsConsole } from '@/components/customers/privacy-requests-console';
export const metadata: Metadata = { title: 'Customer privacy requests' };
export default function Page() {
  return <PrivacyRequestsConsole />;
}
