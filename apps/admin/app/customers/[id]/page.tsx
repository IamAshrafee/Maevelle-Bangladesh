import { CustomerDetailConsole } from '@/components/customers/customer-detail-console';

export default async function CustomerDetailPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerDetailConsole customerId={id} />;
}
