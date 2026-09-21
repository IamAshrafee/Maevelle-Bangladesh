import { FinanceAccountDetail } from '@/components/finance/finance-account-detail';

export default async function FinanceAccountPage({
  params,
}: {
  readonly params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  return <FinanceAccountDetail accountId={accountId} />;
}
