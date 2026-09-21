import { PurchaseDetail } from '@/components/supply/purchase-detail';

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ purchaseId: string }>;
}) {
  const { purchaseId } = await params;
  return <PurchaseDetail purchaseId={purchaseId} />;
}
