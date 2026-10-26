import type { Metadata } from 'next';
import { SegmentsConsole } from '@/components/customers/segments-console';
export const metadata: Metadata = { title: 'Customer segments' };
export default function Page() {
  return <SegmentsConsole />;
}
