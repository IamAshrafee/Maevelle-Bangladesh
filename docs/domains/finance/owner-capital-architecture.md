# Owner Capital Architecture

## Purpose and terminology

Maevelle calls this capability **Owner capital**. A **capital contributor** is a
person who supplies permanent business capital or pays a business cost with
personal money. A contributor is not automatically a Team member, shareholder,
or holder of any ownership percentage. Repayable loans, share classes, dividends,
and cap-table administration are outside this domain.

## Financial authority

Finance remains the only money-movement authority:

- `finance.financial_account_entries` is the immutable source of business Account
  balances.
- `finance.expense_payments` is the immutable source of paid Expense and supplier
  obligation amounts.
- `finance.finance_transactions` identifies and traces every financial event.
- `finance.capital_events` adds contributor and capital meaning; it does not keep
  another Account balance or Expense total.

Capital is never customer Revenue. It does not change Payment collections or
profit. Owner-funded Expenses remain business costs, but do not change business
cash because no business Account paid them.

## Workflows

### Cash contribution

A contribution creates one `CAPITAL_CONTRIBUTION` Finance transaction, one
positive entry in the selected active Account, and one positive capital event.
The Account currency is authoritative. The operation is transactional,
idempotent, audited, and emits an outbox event.

### Owner-funded Expense or Purchase

An owner-funded payment creates an `OWNER_FUNDED_EXPENSE` Finance transaction,
an `OWNER_CAPITAL` Expense payment, and a positive capital event. It deliberately
creates no Account entry. Therefore:

- the Expense or supplier invoice paid/outstanding amount is correct;
- the contributor's capital position increases;
- business cash is unchanged; and
- partial owner funding can coexist with ordinary Account-backed payments.

Purchase invoices use the existing Finance Expense linked to the Purchase, so
Procurement retains supplier and Purchase authority while Finance retains payment
authority.

### Withdrawal

A withdrawal creates a `CAPITAL_WITHDRAWAL` Finance transaction, a negative entry
in the selected Account, and a negative capital event. It is not an Expense.
Maevelle prevents the Account from going below its current ledger balance.

### Reversal and correction

Capital events are not edited or deleted. A reversal creates a
`CAPITAL_REVERSAL` Finance transaction and an equal opposite capital event.
Account-backed events receive an opposite Account entry. Owner-funded payments
receive a signed Expense-payment reversal linked to the original payment, which
restores the Expense outstanding amount without removing history. An event can be
reversed once; reversals cannot themselves be reversed.

## Reporting semantics

The Owner capital workspace exposes historical contributed cash, personally
funded costs, withdrawals, and the signed net capital position. These values are
computed from capital events in the organisation's default currency. Contributor
cards use the same ledger grouped by person.

Finance Overview paid Expenses include both Account-backed and owner-funded
payments, including signed payment reversals. Account balance and net Account
movement continue to use Account entries only. Existing customer collection and
refund metrics are unaffected.

## Integrity and access

All contributor, event, Account, Expense-payment, and reversal relationships have
organisation-scoped composite foreign keys. Important event shapes and signs are
enforced with database checks, and unique reversal/source links prevent duplicate
mapping. Retry-sensitive commands use the shared idempotency store.

`finance.capital.view` protects the contributor ledger and totals.
`finance.capital.manage` protects contributor creation, contributions,
withdrawals, owner-funded payments, and reversals. Authentication alone never
grants either capability.

## Admin experience

`/finance/capital` is a Finance destination, not a standalone investment product.
It provides contributor cards, accurate summary metrics, the append-only capital
ledger, and focused dialogs for each command. Expense detail and Purchase invoice
payment surfaces link directly into the personally funded payment flow. All
financial results are shown only after the backend confirms the command.
