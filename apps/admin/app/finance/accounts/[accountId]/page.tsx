import type { Metadata } from 'next';
import { FinanceAccountDetail } from '@/components/finance/finance-account-detail';

export const metadata: Metadata = {
  title: 'Financial Account | Maevelle Admin',
  description: 'Audited cash ledger balances, transaction movements, and reconciliation audits.',
};

export default async function FinanceAccountPage({
  params,
}: {
  readonly params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  return <FinanceAccountDetail accountId={accountId} />;
}

