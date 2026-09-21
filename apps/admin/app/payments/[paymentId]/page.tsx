import { PaymentDetail } from '@/components/payments/payment-detail';

export default async function PaymentDetailPage({
  params,
}: {
  readonly params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  return <PaymentDetail paymentId={paymentId} />;
}
