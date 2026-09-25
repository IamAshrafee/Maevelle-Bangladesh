import type {
  FinanceAccountDetailDto,
  FinanceLedgerEntryDto,
  FinancialAccountDto,
  PaginatedResultDto,
} from '@maevelle/contracts';

export interface AccountDetailState {
  readonly account: FinanceAccountDetailDto;
  readonly activeAccounts: readonly FinancialAccountDto[];
}

export type LedgerDirectionFilter = 'ALL' | 'IN' | 'OUT';

export type LedgerTransactionTypeFilter =
  | 'ALL'
  | 'OPENING_BALANCE'
  | 'EXPENSE_PAYMENT'
  | 'INTERNAL_TRANSFER'
  | 'EXTERNAL_ADJUSTMENT'
  | 'PAYMENT_SOURCE_POSTING'
  | 'REFUND_SOURCE_POSTING'
  | 'COD_SETTLEMENT';

export interface LedgerFilterState {
  readonly query: string;
  readonly direction: LedgerDirectionFilter;
  readonly transactionType: LedgerTransactionTypeFilter;
  readonly from: string;
  readonly to: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface AccountLedgerData {
  readonly entries: readonly FinanceLedgerEntryDto[];
  readonly pagination: PaginatedResultDto<FinanceLedgerEntryDto>['pagination'];
}
