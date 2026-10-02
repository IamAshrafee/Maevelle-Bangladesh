import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from './index.js';
import { FinanceDomainError } from './finance.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';

const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;

function moneyUnits(value: string): bigint {
  const normalized = value.trim();
  if (!moneyPattern.test(normalized))
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      'Amount must be a positive decimal with up to 4 places.',
    );
  const [whole = '0', fraction = ''] = normalized.split('.');
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'));
}

function positiveMoney(value: string): string {
  const normalized = value.trim();
  if (moneyUnits(normalized) <= 0n)
    throw new FinanceDomainError('VALIDATION_FAILED', 'Amount must be greater than zero.');
  return normalized;
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value);
}

async function claim(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; operation: string; key: string; body: unknown },
) {
  try {
    return await claimIdempotencyRecord(db, {
      organizationId: input.organizationId,
      principalType: 'USER',
      principalId: input.actorId,
      operationType: input.operation,
      idempotencyKey: input.key,
      requestFingerprint: fingerprint(input.body),
    });
  } catch (error) {
    if (error instanceof IdempotencyKeyReuseError)
      throw new FinanceDomainError('CONFLICT', error.message);
    throw error;
  }
}

async function replayId(db: Kysely<DatabaseSchema>, recordId: string): Promise<string | undefined> {
  const replay = await sql<{ id: string | null }>`select result_entity_id::text as id
    from platform.idempotency_records where id=${recordId} and status='SUCCEEDED'`.execute(db);
  return replay.rows[0]?.id ?? undefined;
}

async function finishIdempotency(
  db: Kysely<DatabaseSchema>,
  recordId: string,
  entityType: string,
  entityId: string,
  response: unknown,
) {
  await sql`update platform.idempotency_records set status='SUCCEEDED',
    result_entity_type=${entityType},result_entity_id=${entityId}::uuid,
    safe_response=${JSON.stringify(response)}::jsonb,completed_at=now() where id=${recordId}`.execute(
    db,
  );
}

async function nextTransactionNumber(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<string> {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`finance-number:${organizationId}`},0))`.execute(
    db,
  );
  const result = await sql<{
    number: string;
  }>`select 'FIN-' || lpad((count(*)+1)::text,6,'0') as number
    from finance.finance_transactions where organization_id=${organizationId}`.execute(db);
  return result.rows[0]?.number ?? 'FIN-000001';
}

async function contributor(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  contributorId: string,
  requireActive = true,
) {
  const result = await sql<{
    id: string;
    display_name: string;
    status: string;
  }>`select id,display_name,status
    from finance.capital_contributors where organization_id=${organizationId} and id=${contributorId}`.execute(
    db,
  );
  const row = result.rows[0];
  if (!row) throw new FinanceDomainError('NOT_FOUND', 'Capital contributor was not found.');
  if (requireActive && row.status !== 'ACTIVE')
    throw new FinanceDomainError('CONFLICT', 'Capital contributor is inactive.');
  return row;
}

async function defaultCurrency(db: Kysely<DatabaseSchema>, organizationId: string) {
  const result = await sql<{ currency: string }>`select default_currency::text as currency
    from platform.organizations where id=${organizationId}`.execute(db);
  const currency = result.rows[0]?.currency;
  if (!currency)
    throw new FinanceDomainError('NOT_FOUND', 'Organisation finance settings were not found.');
  return currency;
}

async function account(db: Kysely<DatabaseSchema>, organizationId: string, accountId: string) {
  const result = await sql<{ id: string; name: string; currency_code: string; status: string }>`
    select id,name,currency_code,status from finance.financial_accounts
    where organization_id=${organizationId} and id=${accountId} for update`.execute(db);
  const row = result.rows[0];
  if (!row) throw new FinanceDomainError('NOT_FOUND', 'Financial account was not found.');
  if (row.status !== 'ACTIVE')
    throw new FinanceDomainError('CONFLICT', 'Financial account is inactive.');
  const total = await sql<{
    balance: string;
  }>`select coalesce(sum(amount_delta),0)::numeric(20,4)::text as balance
    from finance.financial_account_entries where organization_id=${organizationId} and financial_account_id=${accountId}`.execute(
    db,
  );
  return { ...row, balance: total.rows[0]?.balance ?? '0.0000' };
}

async function emit(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  eventType: string,
  eventId: string,
  financeTransactionId: string,
) {
  await sql`insert into platform.outbox_events
    (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    values (${organizationId},${eventType},1,'finance.capital_event',${eventId}::uuid,1,
      ${JSON.stringify({ capitalEventId: eventId, financeTransactionId })}::jsonb,now())`.execute(
    db,
  );
}

export interface CapitalContributorView {
  readonly id: string;
  readonly displayName: string;
  readonly linkedUserId: string | null;
  readonly linkedUserName?: string | null;
  readonly linkedUserEmail?: string | null;
  readonly contactNote: string | null;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly grossContributed: string;
  readonly ownerFundedExpenses: string;
  readonly withdrawn: string;
  readonly netCapital: string;
  readonly lastActivityAt: string | null;
  readonly version: number;
}

export async function listCapitalContributors(db: Kysely<DatabaseSchema>, organizationId: string) {
  const result = await sql<{
    id: string;
    display_name: string;
    linked_user_id: string | null;
    linked_user_name: string | null;
    linked_user_email: string | null;
    contact_note: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    gross_contributed: string;
    owner_funded_expenses: string;
    withdrawn: string;
    net_capital: string;
    last_activity_at: string | null;
    version: string;
  }>`select contributor.id,contributor.display_name,contributor.linked_user_id,contributor.contact_note,
      contributor.status,contributor.version::text,
      u.name as linked_user_name, u.email as linked_user_email,
      coalesce(sum(event.amount_delta) filter (where event.event_type='CONTRIBUTION' and event.currency_code=organization.default_currency),0)::numeric(20,4)::text as gross_contributed,
      coalesce(sum(event.amount_delta) filter (where event.event_type='OWNER_FUNDED_EXPENSE' and event.currency_code=organization.default_currency),0)::numeric(20,4)::text as owner_funded_expenses,
      coalesce(abs(sum(event.amount_delta) filter (where event.event_type='WITHDRAWAL' and event.currency_code=organization.default_currency)),0)::numeric(20,4)::text as withdrawn,
      coalesce(sum(event.amount_delta) filter (where event.currency_code=organization.default_currency),0)::numeric(20,4)::text as net_capital,
      max(event.occurred_at) filter (where event.currency_code=organization.default_currency)::text as last_activity_at
    from finance.capital_contributors contributor
    join platform.organizations organization on organization.id=contributor.organization_id
    left join iam.users u on u.id=contributor.linked_user_id
    left join finance.capital_events event on event.organization_id=contributor.organization_id and event.contributor_id=contributor.id
    where contributor.organization_id=${organizationId}
    group by contributor.id,organization.id,u.name,u.email order by contributor.display_name,contributor.id`.execute(
    db,
  );
  return result.rows.map(
    (row) =>
      ({
        id: row.id,
        displayName: row.display_name,
        linkedUserId: row.linked_user_id,
        linkedUserName: row.linked_user_name,
        linkedUserEmail: row.linked_user_email,
        contactNote: row.contact_note,
        status: row.status,
        grossContributed: row.gross_contributed,
        ownerFundedExpenses: row.owner_funded_expenses,
        withdrawn: row.withdrawn,
        netCapital: row.net_capital,
        lastActivityAt: row.last_activity_at,
        version: Number(row.version),
      }) satisfies CapitalContributorView,
  );
}

export async function createCapitalContributor(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    displayName: string;
    linkedUserId?: string;
    contactNote?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const displayName = input.displayName.trim();
    if (!displayName)
      throw new FinanceDomainError('VALIDATION_FAILED', 'Contributor name is required.');
    const claimed = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.capital.contributor.create',
      key: input.idempotencyKey,
      body: input,
    });
    if (!claimed.created) {
      const id = await replayId(tx, claimed.id);
      if (id) return { id };
      throw new FinanceDomainError('CONFLICT', 'Contributor creation is already being processed.');
    }
    if (input.linkedUserId) {
      const user = await sql`select user_account.id from iam.users user_account
        join iam.organization_memberships membership on membership.user_id=user_account.id
        where user_account.id=${input.linkedUserId} and membership.organization_id=${input.organizationId}`.execute(
        tx,
      );
      if (!user.rows[0])
        throw new FinanceDomainError('NOT_FOUND', 'Linked organization user was not found.');
    }
    const inserted = await sql<{ id: string }>`insert into finance.capital_contributors
      (organization_id,display_name,linked_user_id,contact_note,created_by)
      values (${input.organizationId},${displayName},${input.linkedUserId ?? null}::uuid,
        ${input.contactNote?.trim() || null},${input.actorId}::uuid) returning id`.execute(tx);
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('Capital contributor was not created.');
    await finishIdempotency(tx, claimed.id, 'finance.capital_contributor', id, {
      contributorId: id,
    });
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.capital.contributor_created',
      targetType: 'finance.capital_contributor',
      targetId: id,
      metadata: { displayName, linkedUserId: input.linkedUserId ?? null },
    });
    return { id };
  });
}

export async function updateCapitalContributor(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    contributorId: string;
    displayName: string;
    linkedUserId?: string | null;
    contactNote?: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    expectedVersion: number;
  },
) {
  const displayName = input.displayName.trim();
  if (!displayName)
    throw new FinanceDomainError('VALIDATION_FAILED', 'Contributor name is required.');
  return db.transaction().execute(async (tx) => {
    const current = await sql<{
      display_name: string;
      linked_user_id: string | null;
      contact_note: string | null;
      status: 'ACTIVE' | 'INACTIVE';
      version: string;
    }>`select display_name,linked_user_id,contact_note,status,version::text from finance.capital_contributors
      where organization_id=${input.organizationId} and id=${input.contributorId} for update`.execute(
      tx,
    );
    const before = current.rows[0];
    if (!before) throw new FinanceDomainError('NOT_FOUND', 'Capital contributor was not found.');
    if (Number(before.version) !== input.expectedVersion)
      throw new FinanceDomainError(
        'CONFLICT',
        'Capital contributor changed before this update completed.',
      );
    const contactNote = input.contactNote?.trim() || null;
    const linkedUserId = input.linkedUserId !== undefined ? input.linkedUserId : before.linked_user_id;
    const updated = await sql<{ version: string }>`update finance.capital_contributors
      set display_name=${displayName},linked_user_id=${linkedUserId},contact_note=${contactNote},status=${input.status},
        version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.contributorId}
        and version=${input.expectedVersion} returning version::text`.execute(tx);
    const version = Number(updated.rows[0]?.version);
    if (!version)
      throw new FinanceDomainError(
        'CONFLICT',
        'Capital contributor changed before this update completed.',
      );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.capital.contributor_updated',
      targetType: 'finance.capital_contributor',
      targetId: input.contributorId,
      beforeDiff: {
        displayName: before.display_name,
        linkedUserId: before.linked_user_id,
        contactNote: before.contact_note,
        status: before.status,
        version: Number(before.version),
      },
      afterDiff: { displayName, linkedUserId, contactNote, status: input.status, version },
    });
    return { id: input.contributorId, version };
  });
}

export interface CapitalOverviewView {
  readonly currency: string;
  readonly totalContributed: string;
  readonly ownerFundedExpenses: string;
  readonly totalWithdrawn: string;
  readonly netCapital: string;
  readonly contributorCount: number;
  readonly recentEvents: readonly CapitalEventView[];
}

export interface CapitalEventView {
  readonly id: string;
  readonly eventType: 'CONTRIBUTION' | 'OWNER_FUNDED_EXPENSE' | 'WITHDRAWAL' | 'REVERSAL';
  readonly amountDelta: string;
  readonly currencyCode: string;
  readonly occurredAt: string;
  readonly contributorId: string;
  readonly contributorName: string;
  readonly accountId: string | null;
  readonly accountName: string | null;
  readonly expenseId: string | null;
  readonly expenseNumber: string | null;
  readonly purchaseId: string | null;
  readonly purchaseNumber: string | null;
  readonly financeTransactionId: string;
  readonly transactionNumber: string;
  readonly reference: string | null;
  readonly note: string | null;
  readonly reversalOfEventId: string | null;
  readonly isReversed: boolean;
  readonly reversalEventId?: string | null;
  readonly reversalTransactionNumber?: string | null;
  readonly reversalReason?: string | null;
  readonly reversalOfTransactionNumber?: string | null;
}

const capitalEventSelect = sql<CapitalEventView>`select event.id,event.event_type as "eventType",
  event.amount_delta::text as "amountDelta",event.currency_code as "currencyCode",
  event.occurred_at::text as "occurredAt",contributor.id as "contributorId",
  contributor.display_name as "contributorName",account.id as "accountId",account.name as "accountName",
  expense.id as "expenseId",expense.expense_number as "expenseNumber",purchase.id as "purchaseId",
  purchase.purchase_number as "purchaseNumber",transaction.id as "financeTransactionId",
  transaction.transaction_number as "transactionNumber",event.reference,event.note,
  event.reversal_of_event_id as "reversalOfEventId",
  reversal.id as "reversalEventId",
  reversal_tx.transaction_number as "reversalTransactionNumber",
  reversal_tx.description as "reversalReason",
  original_tx.transaction_number as "reversalOfTransactionNumber",
  (reversal.id is not null) as "isReversed"
  from finance.capital_events event
  join finance.capital_contributors contributor on contributor.organization_id=event.organization_id and contributor.id=event.contributor_id
  join finance.finance_transactions transaction on transaction.organization_id=event.organization_id and transaction.id=event.finance_transaction_id
  left join finance.financial_accounts account on account.organization_id=event.organization_id and account.id=event.financial_account_id
  left join finance.expense_payments expense_payment on expense_payment.organization_id=event.organization_id and expense_payment.id=event.expense_payment_id
  left join finance.expenses expense on expense.organization_id=event.organization_id and expense.id=expense_payment.expense_id
  left join procurement.purchases purchase on purchase.organization_id=expense.organization_id and expense.source_domain='procurement.purchase' and purchase.id=expense.source_id
  left join finance.capital_events reversal on reversal.organization_id=event.organization_id and reversal.reversal_of_event_id=event.id
  left join finance.finance_transactions reversal_tx on reversal_tx.organization_id=event.organization_id and reversal_tx.id=reversal.finance_transaction_id
  left join finance.capital_events original on original.organization_id=event.organization_id and original.id=event.reversal_of_event_id
  left join finance.finance_transactions original_tx on original_tx.organization_id=event.organization_id and original_tx.id=original.finance_transaction_id`;

export async function getCapitalOverview(db: Kysely<DatabaseSchema>, organizationId: string) {
  const [summary, recent] = await Promise.all([
    sql<{
      currency: string;
      total_contributed: string;
      owner_funded_expenses: string;
      total_withdrawn: string;
      net_capital: string;
      contributor_count: string;
    }>`select organization.default_currency::text as currency,
      coalesce(sum(event.amount_delta) filter (where event.event_type='CONTRIBUTION' and event.currency_code=organization.default_currency),0)::numeric(20,4)::text as total_contributed,
      coalesce(sum(event.amount_delta) filter (where event.event_type='OWNER_FUNDED_EXPENSE' and event.currency_code=organization.default_currency),0)::numeric(20,4)::text as owner_funded_expenses,
      coalesce(abs(sum(event.amount_delta) filter (where event.event_type='WITHDRAWAL' and event.currency_code=organization.default_currency)),0)::numeric(20,4)::text as total_withdrawn,
      coalesce(sum(event.amount_delta) filter (where event.currency_code=organization.default_currency),0)::numeric(20,4)::text as net_capital,
      (select count(*) from finance.capital_contributors contributor where contributor.organization_id=organization.id)::text as contributor_count
      from platform.organizations organization left join finance.capital_events event on event.organization_id=organization.id
      where organization.id=${organizationId} group by organization.id`.execute(db),
    sql<CapitalEventView>`${capitalEventSelect} where event.organization_id=${organizationId}
      order by event.occurred_at desc,event.id desc limit 8`.execute(db),
  ]);
  const row = summary.rows[0];
  if (!row)
    throw new FinanceDomainError('NOT_FOUND', 'Organisation finance settings were not found.');
  return {
    currency: row.currency,
    totalContributed: row.total_contributed,
    ownerFundedExpenses: row.owner_funded_expenses,
    totalWithdrawn: row.total_withdrawn,
    netCapital: row.net_capital,
    contributorCount: Number(row.contributor_count),
    recentEvents: recent.rows,
  } satisfies CapitalOverviewView;
}

export async function listCapitalEvents(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  filters: {
    contributorId?: string | undefined;
    eventType?: CapitalEventView['eventType'] | 'ALL' | undefined;
    search?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
  } = {},
) {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 25)));
  const offset = (page - 1) * pageSize;
  const contributorId = filters.contributorId ?? null;
  const eventType = filters.eventType ?? 'ALL';
  const search = filters.search?.trim() || null;
  const searchPattern = search ? `%${search}%` : null;
  const where = sql`event.organization_id=${organizationId}
    and (${contributorId}::uuid is null or event.contributor_id=${contributorId}::uuid)
    and (${eventType}::text='ALL' or event.event_type=${eventType}::text)
    and (${searchPattern}::text is null or (
      transaction.transaction_number ilike ${searchPattern}
      or contributor.display_name ilike ${searchPattern}
      or coalesce(event.reference, '') ilike ${searchPattern}
      or coalesce(event.note, '') ilike ${searchPattern}
      or coalesce(account.name, '') ilike ${searchPattern}
      or coalesce(expense.expense_number, '') ilike ${searchPattern}
      or coalesce(purchase.purchase_number, '') ilike ${searchPattern}
    ))`;
  const [events, count] = await Promise.all([
    sql<CapitalEventView>`${capitalEventSelect} where ${where}
      order by event.occurred_at desc,event.id desc limit ${pageSize} offset ${offset}`.execute(db),
    sql<{
      total: string;
    }>`select count(*)::text as total
      from finance.capital_events event
      join finance.capital_contributors contributor on contributor.organization_id=event.organization_id and contributor.id=event.contributor_id
      join finance.finance_transactions transaction on transaction.organization_id=event.organization_id and transaction.id=event.finance_transaction_id
      left join finance.financial_accounts account on account.organization_id=event.organization_id and account.id=event.financial_account_id
      left join finance.expense_payments expense_payment on expense_payment.organization_id=event.organization_id and expense_payment.id=event.expense_payment_id
      left join finance.expenses expense on expense.organization_id=event.organization_id and expense.id=expense_payment.expense_id
      left join procurement.purchases purchase on purchase.organization_id=expense.organization_id and expense.source_domain='procurement.purchase' and purchase.id=expense.source_id
      where ${where}`.execute(db),
  ]);
  const totalItems = Number(count.rows[0]?.total ?? 0);
  return {
    items: events.rows,
    pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
  };
}

export async function getCapitalEvent(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  eventId: string,
) {
  const result = await sql<CapitalEventView>`${capitalEventSelect}
    where event.organization_id=${organizationId} and event.id=${eventId}::uuid`.execute(db);
  return result.rows[0];
}

export async function recordCapitalAccountMovement(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    contributorId: string;
    accountId: string;
    type: 'CONTRIBUTION' | 'WITHDRAWAL';
    amount: string;
    occurredAt: string;
    reference?: string;
    note?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const amount = positiveMoney(input.amount);
    const claimed = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: `finance.capital.${input.type.toLowerCase()}`,
      key: input.idempotencyKey,
      body: input,
    });
    if (!claimed.created) {
      const id = await replayId(tx, claimed.id);
      if (id) return { id };
      throw new FinanceDomainError('CONFLICT', 'Capital movement is already being processed.');
    }
    const [owner, destination, currency] = await Promise.all([
      contributor(tx, input.organizationId, input.contributorId),
      account(tx, input.organizationId, input.accountId),
      defaultCurrency(tx, input.organizationId),
    ]);
    if (destination.currency_code !== currency)
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        `Owner capital is reported in the organisation default currency (${currency}).`,
      );
    if (input.type === 'WITHDRAWAL' && moneyUnits(destination.balance) < moneyUnits(amount))
      throw new FinanceDomainError(
        'CONFLICT',
        'Financial account has insufficient balance for this withdrawal.',
      );
    const amountDelta = input.type === 'CONTRIBUTION' ? amount : `-${amount}`;
    const transactionType =
      input.type === 'CONTRIBUTION' ? 'CAPITAL_CONTRIBUTION' : 'CAPITAL_WITHDRAWAL';
    const number = await nextTransactionNumber(tx, input.organizationId);
    const transaction = await sql<{ id: string }>`insert into finance.finance_transactions
      (organization_id,transaction_number,transaction_type,occurred_at,description,source_domain,created_by)
      values (${input.organizationId},${number},${transactionType},${input.occurredAt}::timestamptz,
        ${input.type === 'CONTRIBUTION' ? `Capital contribution from ${owner.display_name}` : `Capital withdrawal by ${owner.display_name}`},
        'finance.capital_event',${input.actorId}::uuid) returning id`.execute(tx);
    const financeTransactionId = transaction.rows[0]?.id;
    if (!financeTransactionId) throw new Error('Finance transaction was not created.');
    await sql`insert into finance.financial_account_entries
      (organization_id,finance_transaction_id,financial_account_id,amount_delta,currency_code,created_at)
      values (${input.organizationId},${financeTransactionId}::uuid,${input.accountId}::uuid,
        ${amountDelta}::numeric,${destination.currency_code},${input.occurredAt}::timestamptz)`.execute(
      tx,
    );
    const event = await sql<{ id: string }>`insert into finance.capital_events
      (organization_id,contributor_id,finance_transaction_id,event_type,amount_delta,currency_code,
        financial_account_id,reference,note,occurred_at,created_by)
      values (${input.organizationId},${input.contributorId}::uuid,${financeTransactionId}::uuid,
        ${input.type},${amountDelta}::numeric,${destination.currency_code},${input.accountId}::uuid,
        ${input.reference?.trim() || null},${input.note?.trim() || null},${input.occurredAt}::timestamptz,
        ${input.actorId}::uuid) returning id`.execute(tx);
    const id = event.rows[0]?.id;
    if (!id) throw new Error('Capital event was not created.');
    await sql`update finance.finance_transactions set source_id=${id}::uuid where id=${financeTransactionId}`.execute(
      tx,
    );
    await finishIdempotency(tx, claimed.id, 'finance.capital_event', id, {
      capitalEventId: id,
      financeTransactionId,
    });
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: `finance.capital.${input.type.toLowerCase()}_recorded`,
      targetType: 'finance.capital_event',
      targetId: id,
      metadata: {
        contributorId: input.contributorId,
        accountId: input.accountId,
        amount,
        currency: destination.currency_code,
      },
    });
    await emit(
      tx,
      input.organizationId,
      `finance.capital.${input.type.toLowerCase()}_recorded`,
      id,
      financeTransactionId,
    );
    return { id, financeTransactionId };
  });
}

export async function recordOwnerFundedExpense(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    contributorId: string;
    expenseId: string;
    amount: string;
    occurredAt: string;
    reference?: string;
    note?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const amount = positiveMoney(input.amount);
    const claimed = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.capital.owner_funded_expense',
      key: input.idempotencyKey,
      body: input,
    });
    if (!claimed.created) {
      const id = await replayId(tx, claimed.id);
      if (id) return { id };
      throw new FinanceDomainError('CONFLICT', 'Owner-funded payment is already being processed.');
    }
    const [owner, expenseResult, currency] = await Promise.all([
      contributor(tx, input.organizationId, input.contributorId),
      sql<{ expense_number: string; currency_code: string; status: string; remaining: string }>`
        select expense.expense_number,expense.currency_code,expense.status,
          (expense.amount+coalesce((select sum(amount) from finance.expense_adjustments where organization_id=expense.organization_id and expense_id=expense.id),0)
            -coalesce((select sum(amount) from finance.expense_payments where organization_id=expense.organization_id and expense_id=expense.id),0))::numeric(20,4)::text as remaining
        from finance.expenses expense where expense.organization_id=${input.organizationId} and expense.id=${input.expenseId} for update`.execute(
        tx,
      ),
      defaultCurrency(tx, input.organizationId),
    ]);
    const expense = expenseResult.rows[0];
    if (!expense) throw new FinanceDomainError('NOT_FOUND', 'Expense was not found.');
    if (expense.status !== 'RECORDED')
      throw new FinanceDomainError('CONFLICT', 'Only recorded Expenses can be paid.');
    if (expense.currency_code !== currency)
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        `Owner capital is reported in the organisation default currency (${currency}).`,
      );
    if (moneyUnits(amount) > moneyUnits(expense.remaining))
      throw new FinanceDomainError('CONFLICT', 'Payment exceeds the outstanding Expense amount.');
    const number = await nextTransactionNumber(tx, input.organizationId);
    const transaction = await sql<{ id: string }>`insert into finance.finance_transactions
      (organization_id,transaction_number,transaction_type,occurred_at,description,source_domain,source_id,created_by)
      values (${input.organizationId},${number},'OWNER_FUNDED_EXPENSE',${input.occurredAt}::timestamptz,
        ${`Owner-funded payment for ${expense.expense_number}`},'finance.expense',${input.expenseId}::uuid,${input.actorId}::uuid) returning id`.execute(
      tx,
    );
    const financeTransactionId = transaction.rows[0]?.id;
    if (!financeTransactionId) throw new Error('Finance transaction was not created.');
    const payment = await sql<{ id: string }>`insert into finance.expense_payments
      (organization_id,expense_id,finance_transaction_id,amount,payment_source,capital_contributor_id,reference,paid_at,created_by)
      values (${input.organizationId},${input.expenseId}::uuid,${financeTransactionId}::uuid,${amount}::numeric,
        'OWNER_CAPITAL',${input.contributorId}::uuid,${input.reference?.trim() || null},${input.occurredAt}::timestamptz,
        ${input.actorId}::uuid) returning id`.execute(tx);
    const expensePaymentId = payment.rows[0]?.id;
    if (!expensePaymentId) throw new Error('Expense payment was not created.');
    const event = await sql<{ id: string }>`insert into finance.capital_events
      (organization_id,contributor_id,finance_transaction_id,event_type,amount_delta,currency_code,
        expense_payment_id,reference,note,occurred_at,created_by)
      values (${input.organizationId},${input.contributorId}::uuid,${financeTransactionId}::uuid,
        'OWNER_FUNDED_EXPENSE',${amount}::numeric,${expense.currency_code},${expensePaymentId}::uuid,
        ${input.reference?.trim() || null},${input.note?.trim() || null},${input.occurredAt}::timestamptz,
        ${input.actorId}::uuid) returning id`.execute(tx);
    const id = event.rows[0]?.id;
    if (!id) throw new Error('Capital event was not created.');
    await finishIdempotency(tx, claimed.id, 'finance.capital_event', id, {
      capitalEventId: id,
      expensePaymentId,
      financeTransactionId,
    });
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.capital.owner_funded_expense_recorded',
      targetType: 'finance.capital_event',
      targetId: id,
      metadata: {
        contributorId: input.contributorId,
        expenseId: input.expenseId,
        expensePaymentId,
        amount,
        currency: expense.currency_code,
      },
    });
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.expense.paid_by_owner',
      targetType: 'finance.expense',
      targetId: input.expenseId,
      metadata: {
        contributorId: input.contributorId,
        capitalEventId: id,
        amount,
        currency: expense.currency_code,
      },
    });
    await emit(
      tx,
      input.organizationId,
      'finance.capital.owner_funded_expense_recorded',
      id,
      financeTransactionId,
    );
    return { id, expensePaymentId, financeTransactionId, contributorName: owner.display_name };
  });
}

export async function reverseCapitalEvent(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    eventId: string;
    reason: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const reason = input.reason.trim();
    if (reason.length < 4)
      throw new FinanceDomainError('VALIDATION_FAILED', 'A reversal reason is required.');
    const claimed = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.capital.reverse',
      key: input.idempotencyKey,
      body: input,
    });
    if (!claimed.created) {
      const id = await replayId(tx, claimed.id);
      if (id) return { id };
      throw new FinanceDomainError('CONFLICT', 'Capital reversal is already being processed.');
    }
    const originalResult = await sql<{
      id: string;
      contributor_id: string;
      event_type: CapitalEventView['eventType'];
      amount_delta: string;
      currency_code: string;
      financial_account_id: string | null;
      expense_payment_id: string | null;
      occurred_at: string;
    }>`select id,contributor_id,event_type,amount_delta::text,currency_code,financial_account_id,
      expense_payment_id,occurred_at::text from finance.capital_events
      where organization_id=${input.organizationId} and id=${input.eventId} for update`.execute(tx);
    const original = originalResult.rows[0];
    if (!original) throw new FinanceDomainError('NOT_FOUND', 'Capital event was not found.');
    if (original.event_type === 'REVERSAL')
      throw new FinanceDomainError('CONFLICT', 'A reversal cannot be reversed.');
    const already =
      await sql`select id from finance.capital_events where organization_id=${input.organizationId} and reversal_of_event_id=${input.eventId}`.execute(
        tx,
      );
    if (already.rows[0])
      throw new FinanceDomainError('CONFLICT', 'Capital event has already been reversed.');
    const reversedDelta = original.amount_delta.startsWith('-')
      ? original.amount_delta.slice(1)
      : `-${original.amount_delta}`;
    let accountName: string | null = null;
    if (original.financial_account_id) {
      const financialAccount = await account(
        tx,
        input.organizationId,
        original.financial_account_id,
      );
      accountName = financialAccount.name;
      if (
        reversedDelta.startsWith('-') &&
        moneyUnits(financialAccount.balance) < moneyUnits(reversedDelta.slice(1))
      )
        throw new FinanceDomainError(
          'CONFLICT',
          'Financial account has insufficient balance to reverse this contribution.',
        );
    }
    const number = await nextTransactionNumber(tx, input.organizationId);
    const transaction = await sql<{ id: string }>`insert into finance.finance_transactions
      (organization_id,transaction_number,transaction_type,description,source_domain,source_id,created_by)
      values (${input.organizationId},${number},'CAPITAL_REVERSAL',${`Reversal: ${reason}`},
        'finance.capital_event',${input.eventId}::uuid,${input.actorId}::uuid) returning id`.execute(
      tx,
    );
    const financeTransactionId = transaction.rows[0]?.id;
    if (!financeTransactionId) throw new Error('Finance reversal transaction was not created.');
    if (original.financial_account_id) {
      await sql`insert into finance.financial_account_entries
        (organization_id,finance_transaction_id,financial_account_id,amount_delta,currency_code)
        values (${input.organizationId},${financeTransactionId}::uuid,${original.financial_account_id}::uuid,
          ${reversedDelta}::numeric,${original.currency_code})`.execute(tx);
    }
    let reversalPaymentId: string | null = null;
    if (original.expense_payment_id) {
      const payment = await sql<{
        expense_id: string;
        amount: string;
        capital_contributor_id: string;
      }>`
        select expense_id,amount::text,capital_contributor_id from finance.expense_payments
        where organization_id=${input.organizationId} and id=${original.expense_payment_id} for update`.execute(
        tx,
      );
      const sourcePayment = payment.rows[0];
      if (!sourcePayment)
        throw new FinanceDomainError('NOT_FOUND', 'Owner-funded Expense payment was not found.');
      const inserted = await sql<{ id: string }>`insert into finance.expense_payments
        (organization_id,expense_id,finance_transaction_id,amount,payment_source,capital_contributor_id,
          reversal_of_payment_id,reversal_reason,reference,created_by)
        values (${input.organizationId},${sourcePayment.expense_id}::uuid,${financeTransactionId}::uuid,
          ${`-${sourcePayment.amount}`}::numeric,'REVERSAL',${sourcePayment.capital_contributor_id}::uuid,
          ${original.expense_payment_id}::uuid,${reason},'Capital event reversal',${input.actorId}::uuid) returning id`.execute(
        tx,
      );
      reversalPaymentId = inserted.rows[0]?.id ?? null;
    }
    const event = await sql<{ id: string }>`insert into finance.capital_events
      (organization_id,contributor_id,finance_transaction_id,event_type,amount_delta,currency_code,
        financial_account_id,expense_payment_id,reversal_of_event_id,note,occurred_at,created_by)
      values (${input.organizationId},${original.contributor_id}::uuid,${financeTransactionId}::uuid,
        'REVERSAL',${reversedDelta}::numeric,${original.currency_code},${original.financial_account_id}::uuid,
        ${reversalPaymentId}::uuid,${input.eventId}::uuid,${reason},now(),${input.actorId}::uuid) returning id`.execute(
      tx,
    );
    const id = event.rows[0]?.id;
    if (!id) throw new Error('Capital reversal event was not created.');
    await finishIdempotency(tx, claimed.id, 'finance.capital_event', id, {
      capitalEventId: id,
      financeTransactionId,
    });
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.capital.event_reversed',
      targetType: 'finance.capital_event',
      targetId: input.eventId,
      reason,
      metadata: { reversalEventId: id, amountDelta: reversedDelta, accountName },
    });
    await emit(
      tx,
      input.organizationId,
      'finance.capital.event_reversed',
      id,
      financeTransactionId,
    );
    return { id, financeTransactionId };
  });
}
