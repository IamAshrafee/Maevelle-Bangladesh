import type { Metadata } from 'next';
import { DuplicateReviewConsole } from '@/components/customers/duplicate-review-console';
export const metadata: Metadata = { title: 'Customer duplicate review' };
export default function Page() {
  return <DuplicateReviewConsole />;
}
