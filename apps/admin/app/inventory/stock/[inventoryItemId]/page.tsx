import { InventoryItemDetail } from '@/components/inventory/inventory-item-detail';

export default async function InventoryItemDetailPage({ params }: { params: Promise<{ inventoryItemId: string }> }) {
  const { inventoryItemId } = await params;
  return <InventoryItemDetail inventoryItemId={inventoryItemId} />;
}
