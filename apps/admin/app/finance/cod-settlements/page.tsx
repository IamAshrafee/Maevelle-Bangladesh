import { redirect } from 'next/navigation';

export default function FinanceCodSettlementsPage() {
  redirect('/finance/accounts?tab=cod-settlements');
}
