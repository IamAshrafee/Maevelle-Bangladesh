import { redirect } from 'next/navigation';

export default function FinanceMovementsPage() {
  redirect('/finance/accounts?tab=movements');
}
