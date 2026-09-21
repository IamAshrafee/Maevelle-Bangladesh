import { ReceiptDetail } from '@/components/supply/receipt-detail';

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  return <ReceiptDetail receiptId={receiptId} />;
}
