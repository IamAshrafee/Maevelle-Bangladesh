import { redirect } from 'next/navigation';

export default function FinanceTransfersPage() {
  redirect('/finance/accounts?tab=transfers');
}
