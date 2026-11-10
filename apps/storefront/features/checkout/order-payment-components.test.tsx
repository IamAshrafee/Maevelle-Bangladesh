import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  CheckoutOrderPaymentDto,
  CheckoutPaymentClaimDto,
  CheckoutWalletInstructionsDto,
} from '@maevelle/contracts';
import { OrderPaymentSummary } from './components/order-payment-summary';
import { WalletInstructionsCard } from './components/wallet-instructions-card';
import { ManualClaimForm } from './components/manual-claim-form';
import { ClaimReviewTracker } from './components/claim-review-tracker';
import { CodPaymentSummary } from './components/cod-payment-summary';
import { OrderPaymentPanel } from './components/order-payment-panel';
import { EMPTY_ORDER_PAYMENT } from './order-payment-types';
import { EMPTY_REVIEW, type ReviewSnapshot } from './foundation-types';

vi.mock('./foundation-runtime', () => ({
  reviewActions: {
    orderPayment: () => ({
      read: vi.fn(),
      submit: vi.fn(),
      retry: vi.fn(),
      recover: vi.fn(),
      clearIssue: vi.fn(),
    }),
  },
}));

afterEach(() => vi.unstubAllGlobals());

const id = () => crypto.randomUUID();

const sampleInstructions: CheckoutWalletInstructionsDto = {
  provider: 'BKASH',
  accountType: 'PERSONAL_RETAIL_ACCOUNT',
  transferAction: 'MERCHANT_PAYMENT',
  accountNumber: '01712345678',
  accountName: 'Maevelle Bangladesh',
  text: '1. Open bKash app\n2. Tap Make Payment\n3. Enter receiving number',
};

const sampleClaim: CheckoutPaymentClaimDto = {
  id: id(),
  submittedAt: '2026-11-06T12:00:00.000Z',
  status: 'PENDING_VERIFICATION',
  reviewState: 'PENDING',
};

function paymentFixture(overrides: Partial<CheckoutOrderPaymentDto> = {}): CheckoutOrderPaymentDto {
  return {
    orderId: id(),
    orderNumber: 'ORD-2026-999',
    orderStatus: 'PENDING',
    method: 'BKASH_MANUAL',
    currency: 'BDT',
    originalPayable: '100.0000',
    outstanding: '60.0000',
    allocated: '40.0000',
    refundedFromAllocation: '0.0000',
    verifiedWalletReceipts: '40.0000',
    unallocatedAtVerification: '0.0000',
    hasLateReceipt: false,
    hasReceiptReversal: false,
    refundStates: [],
    paymentStatus: 'PARTIALLY_PAID',
    obligationStatus: 'READY',
    submissionDeadline: '2026-11-06T15:00:00.000Z',
    reviewDeadline: '2026-11-06T18:00:00.000Z',
    transferAvailability: 'AVAILABLE',
    claimAvailability: 'AVAILABLE',
    instructions: sampleInstructions,
    latestClaim: sampleClaim,
    openClaims: [sampleClaim],
    ...overrides,
  };
}

describe('Phase 06B customer payment presentation components', () => {
  it('renders exact financial amounts and partial payment breakdown in OrderPaymentSummary', () => {
    const payment = paymentFixture({
      originalPayable: '100.0000',
      allocated: '40.0000',
      outstanding: '60.0000',
    });

    const markup = renderToStaticMarkup(<OrderPaymentSummary payment={payment} />);

    expect(markup).toContain('Original payable');
    expect(markup).toContain('100.0000');
    expect(markup).toContain('Confirmed payment');
    expect(markup).toContain('40.0000');
    expect(markup).toContain('Outstanding balance due');
    expect(markup).toContain('60.0000');
    expect(markup).toContain('A partial payment of');
    expect(markup).toContain('remains due');
  });

  it('renders refunded amount and unallocated verification context when non-zero', () => {
    const payment = paymentFixture({
      refundedFromAllocation: '15.0000',
      unallocatedAtVerification: '5.0000',
    });

    const markup = renderToStaticMarkup(<OrderPaymentSummary payment={payment} />);

    expect(markup).toContain('Refunded from allocation');
    expect(markup).toContain('15.0000');
    expect(markup).toContain('Unallocated at verification');
    expect(markup).toContain('5.0000');
  });

  it('displays late receipt and reversal warnings in OrderPaymentSummary', () => {
    const payment = paymentFixture({
      hasLateReceipt: true,
      hasReceiptReversal: true,
      refundStates: ['COMPLETED'],
    });

    const markup = renderToStaticMarkup(<OrderPaymentSummary payment={payment} />);

    expect(markup).toContain('Late receipt recorded');
    expect(markup).toContain('Receipt reversal recorded');
    expect(markup).toContain('Refund status:');
    expect(markup).toContain('COMPLETED');
  });

  it('renders bKash PRA wallet instructions only when available', () => {
    const payment = paymentFixture({
      transferAvailability: 'AVAILABLE',
      instructions: sampleInstructions,
    });

    const markup = renderToStaticMarkup(<WalletInstructionsCard payment={payment} />);

    expect(markup).toContain('bKash Payment Instructions');
    expect(markup).toContain('Personal Retail Account');
    expect(markup).toContain('Make Payment');
    expect(markup).toContain('01712345678');
    expect(markup).toContain('60.0000');
    expect(markup).toContain('ORD-2026-999');
    expect(markup).toContain('Maevelle Bangladesh');
    expect(markup).toContain('1. Open bKash app');
    expect(markup).toContain('Payment submission window closes:');
    expect(markup).not.toContain('Send Money');
  });

  it.each([
    [
      'CLAIM_UNDER_REVIEW',
      'Payment claim under review',
      'Your submitted payment claim is currently being verified',
    ],
    ['PAYMENT_ALREADY_SETTLED', 'Payment fully settled', 'This order has already been fully paid'],
    [
      'PAYMENT_WINDOW_EXPIRED',
      'Payment submission window expired',
      'The payment window for this order has expired',
    ],
    ['ORDER_CANCELLED', 'Order cancelled', 'This order has been cancelled'],
    [
      'DESTINATION_UNAVAILABLE',
      'Payment destination unavailable',
      'The merchant receiving wallet is temporarily unavailable',
    ],
    [
      'PAYMENT_METHOD_UNAVAILABLE',
      'Payment method unavailable',
      'The selected payment method is not available',
    ],
    [
      'PAYMENT_SUPPORT_REQUIRED',
      'Payment support required',
      'An exception requires staff assistance',
    ],
    [
      'POLICY_BLOCKED',
      'Payment instructions temporarily unavailable',
      'Wallet transfer collection is currently unavailable',
    ],
  ] as const)(
    'renders honest notice without receiving number when transferAvailability is %s',
    (availability, title, messageSnippet) => {
      const payment = paymentFixture({
        transferAvailability: availability,
        instructions: null,
      });

      const markup = renderToStaticMarkup(<WalletInstructionsCard payment={payment} />);

      expect(markup).toContain(title);
      expect(markup).toContain(messageSnippet);
      expect(markup).not.toContain('01712345678');
      expect(markup).not.toContain('Copy');
    },
  );

  it('renders ManualClaimForm with Transaction ID and optional phone inputs only', () => {
    const payment = paymentFixture();
    const projection = { ...EMPTY_ORDER_PAYMENT };

    const markup = renderToStaticMarkup(
      <ManualClaimForm payment={payment} projection={projection} />,
    );

    expect(markup).toContain('Submit Transaction Reference');
    expect(markup).toContain('Transaction ID (TrxID)');
    expect(markup).toContain('Sending Mobile Number');
    expect(markup).toContain('(optional)');
    expect(markup).toContain('Submit Transaction ID');
    expect(markup).not.toContain('Amount paid');
    expect(markup).not.toContain('name="pin"');
    expect(markup).not.toContain('name="otp"');
    expect(markup).not.toContain('Screenshot');
  });

  it('renders ClaimReviewTracker with submitted claims, status badges, and review deadline', () => {
    const payment = paymentFixture();

    const markup = renderToStaticMarkup(<ClaimReviewTracker payment={payment} />);

    expect(markup).toContain('Submitted Payment Claims');
    expect(markup).toContain('Pending verification');
    expect(markup).toContain('Awaiting verification');
    expect(markup).toContain('Review expected by:');
  });

  it('renders correction requested notice in ClaimReviewTracker when reviewState is CORRECTION_REQUESTED', () => {
    const claimWithCorrection: CheckoutPaymentClaimDto = {
      ...sampleClaim,
      reviewState: 'CORRECTION_REQUESTED',
    };
    const payment = paymentFixture({
      openClaims: [claimWithCorrection],
      latestClaim: claimWithCorrection,
    });

    const markup = renderToStaticMarkup(<ClaimReviewTracker payment={payment} />);

    expect(markup).toContain('Correction requested');
    expect(markup).toContain('Our management team was unable to verify this transaction');
  });

  it('renders dedicated Cash on Delivery summary without wallet instructions or claim form', () => {
    const payment = paymentFixture({
      method: 'COD',
      transferAvailability: 'COD',
      claimAvailability: 'COD',
      instructions: null,
      latestClaim: null,
      openClaims: [],
    });

    const markup = renderToStaticMarkup(<CodPaymentSummary payment={payment} />);

    expect(markup).toContain('Cash on Delivery');
    expect(markup).toContain('Amount due on delivery');
    expect(markup).toContain('60.0000');
    expect(markup).toContain('Please have the exact cash amount');
    expect(markup).not.toContain('bKash');
    expect(markup).not.toContain('Nagad');
    expect(markup).not.toContain('Transaction ID');
    expect(markup).not.toContain('Receiving Number');
    expect(markup).not.toContain('Submit');
  });

  it('renders OrderPaymentPanel coordinating COD vs Wallet payments', () => {
    const codPayment = paymentFixture({
      method: 'COD',
      transferAvailability: 'COD',
      claimAvailability: 'COD',
      instructions: null,
    });

    const codReview: ReviewSnapshot = {
      ...EMPTY_REVIEW,
      phase: 'ready',
      orderPayment: {
        ...EMPTY_ORDER_PAYMENT,
        phase: 'ready',
        data: codPayment,
      },
    };

    const codMarkup = renderToStaticMarkup(
      <OrderPaymentPanel review={codReview} clock={Date.now()} />,
    );
    expect(codMarkup).toContain('Payment &amp; Instructions');
    expect(codMarkup).toContain('Cash on Delivery');
    expect(codMarkup).not.toContain('Submit Transaction Reference');

    const walletPayment = paymentFixture();
    const walletReview: ReviewSnapshot = {
      ...EMPTY_REVIEW,
      phase: 'ready',
      orderPayment: {
        ...EMPTY_ORDER_PAYMENT,
        phase: 'ready',
        data: walletPayment,
      },
    };

    const walletMarkup = renderToStaticMarkup(
      <OrderPaymentPanel review={walletReview} clock={Date.now()} />,
    );
    expect(walletMarkup).toContain('bKash Payment Instructions');
    expect(walletMarkup).toContain('Submit Transaction Reference');
    expect(walletMarkup).toContain('Submitted Payment Claims');
  });
});
