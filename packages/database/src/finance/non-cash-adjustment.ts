import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { nextFinanceNumber } from './document-numbers.js';

/** Operational receivable memorandum, never a financial_account_entries cash movement or guessed tax journal. */
export async function postCashWaiverMemorandum(
  tx: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; adjustmentId: string; reversal: boolean },
) {
  const number = await nextFinanceNumber(tx, input.organizationId, 'FIN');
  return (
    await sql<{
      id: string;
    }>`insert into finance.finance_transactions(organization_id,transaction_number,transaction_type,
    description,source_domain,source_id,created_by) values(${input.organizationId},${number},
    ${input.reversal ? 'CUSTOMER_BALANCE_WAIVER_REVERSAL' : 'CUSTOMER_BALANCE_WAIVER'},
    'Non-cash customer balance adjustment; accounting and invoice treatment retained in approved policy',
    'payments.cash_shortfall',${input.adjustmentId},${input.actorId}) returning id`.execute(tx)
  ).rows[0]!.id;
}
