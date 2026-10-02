import type {
  CapitalContributorDto,
  CapitalEventDto,
} from '@maevelle/contracts';

export type CapitalDialog =
  | { kind: 'contributor' }
  | { kind: 'edit-contributor'; contributor: CapitalContributorDto }
  | { kind: 'movement'; movementType: 'CONTRIBUTION' | 'WITHDRAWAL'; preselectedContributorId?: string }
  | { kind: 'owner-expense'; preselectedExpenseId?: string; preselectedContributorId?: string }
  | { kind: 'reversal'; event: CapitalEventDto };

export type CapitalSheet =
  | { kind: 'contributor-detail'; contributorId: string }
  | { kind: 'transaction-detail'; eventId: string };

export interface TeamMemberSimple {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: string;
}

export interface CapitalLedgerFilters {
  readonly query: string;
  readonly contributorId: string;
  readonly eventType: 'ALL' | 'CONTRIBUTION' | 'OWNER_FUNDED_EXPENSE' | 'WITHDRAWAL' | 'REVERSAL';
  readonly page: number;
  readonly pageSize: number;
}

export function localDateTime(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function signedMoney(amount: string, currency: string, formatMoney: (value: number | string, currency?: string) => string): string {
  const value = Number(amount);
  return `${value > 0 ? '+' : ''}${formatMoney(value, currency)}`;
}
