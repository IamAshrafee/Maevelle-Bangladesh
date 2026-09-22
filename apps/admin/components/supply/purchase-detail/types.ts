import type {
  CatalogVariantChoiceDto,
  InboundShipmentDto,
  PurchaseDto,
  SupplierDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

export interface SupplierInvoice {
  id: string;
  expense_number: string;
  description: string;
  amount: string;
  currency_code: string;
  expense_date: string;
  status: string;
  category_name: string;
  paid: string;
  adjustments: string;
  outstanding: string;
  source_domain: string | null;
  source_id: string | null;
  payee_name?: string | null;
  external_reference?: string | null;
  notes?: string | null;
  created_at?: string;
  version: number;
  source_reference?: string | null;
}

export interface InvoicePaymentRecord {
  readonly id: string;
  readonly amount: string;
  readonly paidAt: string;
  readonly reference: string | null;
  readonly accountId: string;
  readonly accountName: string;
  readonly financeTransactionId: string;
  readonly transactionNumber: string;
}

export interface InvoiceAdjustmentRecord {
  readonly id: string;
  readonly type: string;
  readonly amount: string;
  readonly reason: string;
  readonly createdAt: string;
}

export interface InvoiceDetail extends SupplierInvoice {
  readonly payments: readonly InvoicePaymentRecord[];
  readonly adjustmentHistory: readonly InvoiceAdjustmentRecord[];
}

export interface ExpenseCategory {
  id: string;
  name: string;
  status: string;
}

export interface FinancialAccount {
  id: string;
  name: string;
  currency_code: string;
  status: string;
  ledger_balance: string;
}

export type PurchaseLine = PurchaseDto['lines'][number];
