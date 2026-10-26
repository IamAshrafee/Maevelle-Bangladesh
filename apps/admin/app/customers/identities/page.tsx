import type { Metadata } from 'next';
import { IdentityReviewConsole } from '@/components/customers/identity-review-console';
export const metadata: Metadata = { title: 'Customer identity review' };
export default function Page() {
  return <IdentityReviewConsole />;
}
