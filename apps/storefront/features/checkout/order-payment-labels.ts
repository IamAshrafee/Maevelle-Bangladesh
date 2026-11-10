import type {
  CheckoutPaymentClaimDto,
  CheckoutWalletAvailability,
  CheckoutWalletInstructionsDto,
} from '@maevelle/contracts';

export const claimReviewStateLabel: Record<CheckoutPaymentClaimDto['reviewState'], string> = {
  PENDING: 'Awaiting verification',
  UNDER_REVIEW: 'Under review',
  CORRECTION_REQUESTED: 'Correction requested',
  ESCALATED: 'Under senior review',
  RESOLVED: 'Review resolved',
};

export const claimStatusLabel: Record<CheckoutPaymentClaimDto['status'], string> = {
  PENDING_VERIFICATION: 'Pending verification',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

export const walletAvailabilityTitle: Record<CheckoutWalletAvailability, string> = {
  AVAILABLE: 'Payment instructions available',
  COD: 'Cash on Delivery',
  POLICY_BLOCKED: 'Payment instructions temporarily unavailable',
  PAYMENT_METHOD_UNAVAILABLE: 'Payment method unavailable',
  DESTINATION_UNAVAILABLE: 'Payment destination unavailable',
  PAYMENT_WINDOW_EXPIRED: 'Payment submission window expired',
  ORDER_CANCELLED: 'Order cancelled',
  PAYMENT_ALREADY_SETTLED: 'Payment fully settled',
  PAYMENT_SUPPORT_REQUIRED: 'Payment support required',
  CLAIM_UNDER_REVIEW: 'Payment claim under review',
};

export const walletAvailabilityMessage: Record<CheckoutWalletAvailability, string> = {
  AVAILABLE:
    'Follow the instructions below to complete your wallet transfer, then enter your Transaction ID.',
  COD: 'Please have the exact cash amount ready upon delivery by the courier.',
  POLICY_BLOCKED:
    'Wallet transfer collection is currently unavailable. Please contact customer support for assistance.',
  PAYMENT_METHOD_UNAVAILABLE:
    'The selected payment method is not available. Please reach out to customer support with your Order number.',
  DESTINATION_UNAVAILABLE:
    'The merchant receiving wallet is temporarily unavailable. Please do not send money. Contact Maevelle customer support.',
  PAYMENT_WINDOW_EXPIRED:
    'The payment window for this order has expired. If you have already transferred funds, please contact customer support.',
  ORDER_CANCELLED:
    'This order has been cancelled. Please do not send payment. If a transfer was already made, contact support.',
  PAYMENT_ALREADY_SETTLED: 'This order has already been fully paid. No additional payment is due.',
  PAYMENT_SUPPORT_REQUIRED:
    'An exception requires staff assistance. Please contact Maevelle support quoting your Order number.',
  CLAIM_UNDER_REVIEW:
    'Your submitted payment claim is currently being verified by our management team. You do not need to send another transfer.',
};

export const transferActionLabel = (
  action: CheckoutWalletInstructionsDto['transferAction'],
): string => {
  switch (action) {
    case 'MERCHANT_PAYMENT':
      return 'Make Payment';
    default:
      return 'Payment';
  }
};

export const accountTypeLabel = (type: CheckoutWalletInstructionsDto['accountType']): string => {
  switch (type) {
    case 'PERSONAL_RETAIL_ACCOUNT':
      return 'Personal Retail Account';
    default:
      return 'Merchant Account';
  }
};

export const dhakaDateTimeFormat = new Intl.DateTimeFormat('en-BD', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Dhaka',
});

export function formatDhakaDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const parsed = Date.parse(isoString);
  if (!Number.isFinite(parsed)) return '';
  return dhakaDateTimeFormat.format(new Date(parsed));
}
