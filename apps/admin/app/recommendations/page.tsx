import type { Metadata } from 'next';
import { RecommendationsWorkspace } from '@/components/recommendations/recommendations-workspace';

export const metadata: Metadata = { title: 'Product recommendations' };
export default function RecommendationsPage() {
  return <RecommendationsWorkspace />;
}
