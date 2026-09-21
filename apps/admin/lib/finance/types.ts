import type {
  FinanceCodSettlementDto,
  FinanceExpenseDto,
  FinanceLedgerEntryDto,
  FinanceOverviewDto,
  FinanceReconciliationDto,
  FinanceTrendsDto,
  FinancialAccountDto,
  OutstandingCodSettlementPaymentDto,
  PaginatedResultDto,
} from '@maevelle/contracts';

export type FinanceSection =
  | 'overview'
  | 'accounts'
  | 'expenses'
  | 'movements'
  | 'transfers'
  | 'cod-settlements'
  | 'reconciliation';

export interface ExpenseCategoryDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly classification: string;
  readonly status: string;
}

export interface FinanceWorkspaceData {
  readonly accounts: readonly FinancialAccountDto[];
  readonly expenses: readonly FinanceExpenseDto[];
  readonly expensePagination: PaginatedResultDto<FinanceExpenseDto>['pagination'];
  readonly ledger: readonly FinanceLedgerEntryDto[];
  readonly categories: readonly ExpenseCategoryDto[];
  readonly reconciliations: readonly FinanceReconciliationDto[];
  readonly outstandingCodPayments: readonly OutstandingCodSettlementPaymentDto[];
  readonly codSettlements: PaginatedResultDto<FinanceCodSettlementDto>;
  readonly overview: FinanceOverviewDto | null;
  readonly trends: FinanceTrendsDto | null;
}

export const emptyFinanceWorkspace: FinanceWorkspaceData = {
  accounts: [],
  expenses: [],
  expensePagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
  ledger: [],
  categories: [],
  reconciliations: [],
  outstandingCodPayments: [],
  codSettlements: {
    items: [],
    pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
  },
  overview: null,
  trends: null,
};

export function formatMoney(amount: string | number, currency = 'BDT'): string {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export function formatFinanceDate(value: string, withTime = false): string {
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(new Date(value));
}

export function humanizeFinanceCode(value: string): string {
  return value
    .toLocaleLowerCase()
    .replaceAll('_', ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());
}
