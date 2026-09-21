import { redirect } from 'next/navigation';

export default function FinanceReconciliationPage() {
  redirect('/finance/accounts?tab=reconciliation');
}
