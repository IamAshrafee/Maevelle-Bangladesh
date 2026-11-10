import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

type DocumentTable =
  'finance_transactions' | 'expenses' | 'expense_settlements' | 'cod_settlements';

/** Allocate within the posting transaction. Account locks cannot serialize a shared document series. */
export async function nextFinanceNumber(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  prefix: string,
  table: DocumentTable = prefix === 'EXP' ? 'expenses' : 'finance_transactions',
) {
  const series = `FINANCE:${table}:${prefix}`;
  const allocated = await sql<{ n: string }>`update platform.number_sequences
    set counter_value=counter_value+1,version=version+1,updated_at=now()
    where organization_id=${organizationId} and sequence_type=${series} and sequence_year is null
    returning counter_value::text n`.execute(db);
  let n = allocated.rows[0]?.n;
  if (!n) {
    const column =
      table === 'finance_transactions'
        ? 'transaction_number'
        : table === 'expenses'
          ? 'expense_number'
          : 'settlement_number';
    // Bootstrap above retained legacy suffixes, including gaps. Competing first
    // writers conflict on the existing per-organization series index and advance it atomically.
    const initialized = await sql<{ n: string }>`insert into platform.number_sequences
      (organization_id,sequence_type,prefix,counter_value,reset_policy,padding)
      select ${organizationId},${series},${prefix + '-'},
        coalesce(max(substring(${sql.ref(column)} from ${'^' + prefix + '-([0-9]+)$'})::bigint),0)+1,'NEVER',6
      from ${sql.table('finance.' + table)} where organization_id=${organizationId}
      on conflict (organization_id,sequence_type) where sequence_year is null
      do update set counter_value=platform.number_sequences.counter_value+1,
        version=platform.number_sequences.version+1,updated_at=now()
      returning counter_value::text n`.execute(db);
    n = initialized.rows[0]!.n;
  }
  return `${prefix}-${n.padStart(6, '0')}`;
}
