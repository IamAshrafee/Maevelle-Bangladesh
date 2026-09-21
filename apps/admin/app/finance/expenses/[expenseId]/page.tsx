import { ExpenseDetail } from '@/components/finance/expense-detail';

export default async function FinanceExpensePage({
  params,
}: {
  readonly params: Promise<{ expenseId: string }>;
}) {
  const { expenseId } = await params;
  return <ExpenseDetail expenseId={expenseId} />;
}
