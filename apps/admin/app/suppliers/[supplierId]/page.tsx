import { SupplierDetail } from '@/components/supply/supplier-detail';

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  return <SupplierDetail supplierId={supplierId} />;
}
