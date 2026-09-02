import { OrderDetailConsole } from '@/components/orders/order-detail-console';

export default async function OrderDetailPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetailConsole orderId={id} />;
}
