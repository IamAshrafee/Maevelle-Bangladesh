/** A claim is customer testimony. Only independently checked receipts establish money. */
export type CheckoutPaymentMethod = 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';
export interface CheckoutPaymentMethodStatusDto {
  readonly method: CheckoutPaymentMethod;
  readonly enabled: boolean;
  readonly available: boolean;
  readonly canEnable: boolean;
  readonly deliveryAreas: readonly ('dhaka' | 'nationwide')[];
  readonly wallet?: {
    readonly receivingNumberEnding: string;
    readonly submissionMinutes: number;
    readonly reviewMinutes: number;
  };
  readonly reason: 'ORDERS_PAUSED' | 'METHOD_DISABLED' | 'SETUP_REQUIRED' | null;
}
export interface ManualPaymentClaimDto {
  readonly transactionId: string;
  readonly sendingMobile?: string;
}
export interface IndependentReceiptEvidenceDto {
  readonly transactionId: string;
  readonly receivingNumber: string;
  readonly currency: 'BDT';
  readonly valueTime: string;
  readonly source: 'ACCOUNT_HISTORY' | 'PROVIDER_STATEMENT';
  readonly evidenceReference: string;
  readonly financialAccountId: string;
}
export interface ReceivingDestinationInputDto {
  readonly provider: 'BKASH' | 'NAGAD';
  readonly accountType: 'PERSONAL_RETAIL_ACCOUNT' | 'MERCHANT';
  readonly receivingNumber: string;
  readonly recipientName: string;
  readonly transferAction: 'MERCHANT_PAYMENT' | 'PAYMENT_QR' | 'UNVERIFIED';
  readonly instructions: string;
  readonly financialAccountId: string;
}
export interface ReceivingDestinationDto extends ReceivingDestinationInputDto {
  readonly id: string;
  readonly revision: string;
  readonly currency: 'BDT';
  readonly state: 'DRAFT' | 'APPROVED' | 'SUSPENDED' | 'RETIRED';
  readonly providerEvidenceReference: string | null;
  readonly createdBy: string;
  readonly approvedBy: string | null;
}
export interface VerifiedReceiptDto {
  readonly paymentId: string;
  readonly orderId: string;
  readonly received: string;
  readonly allocated: string;
  readonly unallocated: string;
  readonly remainingUnallocated: string;
  readonly disposition: 'ALLOCATED' | 'EXCESS_LIABILITY' | 'LATE_RECEIPT_LIABILITY';
  readonly reversed: boolean;
  readonly verifiedBy: string;
}
export interface PaymentPageDto<T> {
  readonly items: readonly T[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
  };
}
export interface PaymentClaimRowDto {
  readonly currency: string;
  readonly id: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly methodName: string;
  readonly customerReference: string;
  readonly expectedAmount: string;
  readonly reviewState: string;
  readonly submittedAt: string;
  readonly reviewExpiresAt: string | null;
  readonly ageSeconds: string;
  readonly overdue: boolean;
}
export interface PaymentClaimWorkspaceDto {
  readonly currency: string;
  readonly id: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly methodName: string;
  readonly customerReference: string;
  readonly expectedAmount: string;
  readonly status: string;
  readonly reviewState: string;
  readonly receivingNumber: string | null;
  readonly instructions: string | null;
  readonly destinationRevision: string | null;
  /** Finance wallet bound to the order's original receiving account, when known. */
  readonly receivingFinancialAccountId: string | null;
  readonly collected: string;
  readonly outstanding: string;
  readonly paymentId: string | null;
}
export interface PaymentPolicyDto {
  readonly id: string;
  readonly submissionMinutes: number;
  readonly reviewMinutes: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly policyId: string | null;
}
export interface PaymentExceptionDto {
  readonly paymentId: string;
  readonly orderId: string;
  readonly received: string;
  readonly unallocated: string;
  readonly disposition: string;
  readonly status: string;
}
