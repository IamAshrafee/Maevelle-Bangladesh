import type { Metadata } from 'next';
import { SegmentMembersConsole } from '@/components/customers/segment-members-console';
export const metadata: Metadata = { title: 'Customer segment members' };
export default async function Page({ params }: { params: Promise<{ segmentId: string }> }) {
  const { segmentId } = await params;
  return <SegmentMembersConsole segmentId={segmentId} />;
}
