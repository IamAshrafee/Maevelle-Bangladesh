import { ShipmentDetail } from '@/components/supply/shipment-detail';

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const { shipmentId } = await params;
  return <ShipmentDetail shipmentId={shipmentId} />;
}
