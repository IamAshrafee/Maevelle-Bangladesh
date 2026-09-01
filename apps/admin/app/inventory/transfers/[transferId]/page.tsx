import { TransferDetail } from '@/components/inventory/transfer-detail';

export default async function TransferDetailPage({ params }: { params: Promise<{ transferId: string }> }) {
  const { transferId } = await params;
  return <TransferDetail transferId={transferId} />;
}
