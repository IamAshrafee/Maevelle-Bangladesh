'use client';

import { Landmark, ReceiptText, Truck, X } from 'lucide-react';
import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';

import { formatMoney } from '@/lib/finance/types';

import type {
  FinancialAccountDto,
  PaymentAttemptDto,
  PaymentDto,
  PendingCodCollectionDto,
  RefundDto,
} from '@maevelle/contracts';

import { OperationalFeedback } from '../operational-worklist';

export type PaymentPostingTarget =
  | { readonly kind: 'payment'; readonly item: PaymentDto }
  | { readonly kind: 'refund'; readonly item: RefundDto };

export interface VerificationDecision {
  readonly attempt: PaymentAttemptDto;
  readonly mode: 'verify' | 'reject';
}

interface CommandDialogProps {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

function CommandDialog({ id, eyebrow, title, onClose, children }: CommandDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="command-modal" role="dialog" aria-modal="true" aria-labelledby={id}>
        <header>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={id}>{title}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

type SubmitHandler = (event: FormEvent<HTMLFormElement>) => void | Promise<void>;

export function CodCollectionDialog({
  collection,
  busy,
  onClose,
  onSubmit,
}: {
  readonly collection: PendingCodCollectionDto;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: SubmitHandler;
}) {
  return (
    <CommandDialog
      id="cod-collection-title"
      eyebrow="Delivered cash on delivery"
      title="Record collected money"
      onClose={onClose}
    >
      <div className="command-summary">
        <span>
          Delivery<strong>{collection.deliveryNumber}</strong>
        </span>
        <span>
          Order<strong>{collection.orderNumber}</strong>
        </span>
        <span>
          Expected here
          <strong>{formatMoney(collection.expectedAmount, collection.currency)}</strong>
        </span>
        <span>
          Order outstanding
          <strong>{formatMoney(collection.outstandingAmount, collection.currency)}</strong>
        </span>
      </div>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label>
          Amount actually collected
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={collection.expectedAmount}
            required
          />
        </label>
        <label>
          Courier or collection reference
          <input
            name="externalReference"
            defaultValue={collection.trackingReference ?? ''}
            autoComplete="off"
            minLength={4}
            required
          />
        </label>
        <label>
          Operator note <span className="muted">(optional)</span>
          <textarea name="note" placeholder="Shortfall, courier handoff, or other context" />
        </label>
        <OperationalFeedback tone="warning">
          <Truck aria-hidden="true" /> Delivery confirms the parcel reached the customer; this
          separate command confirms the money collected. You will still choose the Finance account
          holding it afterward.
        </OperationalFeedback>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy} type="submit">
            Confirm collection
          </button>
        </div>
      </form>
    </CommandDialog>
  );
}

export function VerificationDialog({
  decision,
  busy,
  onClose,
  onSubmit,
}: {
  readonly decision: VerificationDecision;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: SubmitHandler;
}) {
  return (
    <CommandDialog
      id="verification-title"
      eyebrow="Manual payment"
      title={decision.mode === 'verify' ? 'Verify submission' : 'Reject submission'}
      onClose={onClose}
    >
      <div className="command-summary">
        <span>
          Order<strong>{decision.attempt.orderNumber}</strong>
        </span>
        <span>
          Expected<strong>{formatMoney(decision.attempt.expectedAmount)}</strong>
        </span>
        <span>
          Claimed
          <strong>
            {decision.attempt.claimedAmount
              ? formatMoney(decision.attempt.claimedAmount)
              : 'Not supplied'}
          </strong>
        </span>
        <span>
          Reference<strong>{decision.attempt.customerReference}</strong>
        </span>
      </div>
      <form onSubmit={(event) => void onSubmit(event)}>
        {decision.mode === 'verify' ? (
          <label>
            Confirmed collected amount
            <input
              name="confirmedAmount"
              inputMode="decimal"
              defaultValue={decision.attempt.claimedAmount ?? decision.attempt.expectedAmount}
              required
            />
          </label>
        ) : (
          <label>
            Rejection reason code
            <select name="reasonCode" defaultValue="REFERENCE_NOT_FOUND">
              <option value="REFERENCE_NOT_FOUND">Reference not found</option>
              <option value="AMOUNT_MISMATCH">Amount mismatch</option>
              <option value="DUPLICATE_SUBMISSION">Duplicate submission</option>
              <option value="SUSPECTED_FRAUD">Suspected fraud</option>
            </select>
          </label>
        )}
        <p className="muted">
          This decision is recorded by the server with the authenticated operator context.
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className={decision.mode === 'reject' ? 'danger-action' : 'button primary'}
            disabled={busy}
            type="submit"
          >
            {decision.mode === 'verify' ? 'Confirm verification' : 'Reject submission'}
          </button>
        </div>
      </form>
    </CommandDialog>
  );
}

export function RefundDialog({
  payment,
  busy,
  onClose,
  onSubmit,
}: {
  readonly payment: PaymentDto;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: SubmitHandler;
}) {
  return (
    <CommandDialog
      id="refund-title"
      eyebrow="Refund command"
      title={`Refund ${payment.paymentNumber}`}
      onClose={onClose}
    >
      <div className="command-summary">
        <span>
          Order<strong>{payment.orderNumber}</strong>
        </span>
        <span>
          Collected<strong>{formatMoney(payment.amount, payment.currency)}</strong>
        </span>
        <span>
          Already refunded<strong>{formatMoney(payment.refunded, payment.currency)}</strong>
        </span>
        <span>
          Available<strong>{formatMoney(payment.net, payment.currency)}</strong>
        </span>
      </div>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label>
          Refund amount
          <input name="amount" inputMode="decimal" defaultValue={payment.net} required />
        </label>
        <label>
          Reason code
          <select name="reasonCode" defaultValue="CUSTOMER_REQUEST">
            <option value="CUSTOMER_REQUEST">Customer request</option>
            <option value="ORDER_CANCELLED">Order cancelled</option>
            <option value="RETURN_APPROVED">Return approved</option>
            <option value="PAYMENT_CORRECTION">Payment correction</option>
          </select>
        </label>
        <label>
          External transaction reference <span className="muted">(optional until completed)</span>
          <input name="externalReference" autoComplete="off" />
        </label>
        <OperationalFeedback tone="warning">
          <ReceiptText aria-hidden="true" /> A completed refund is immutable. Leave the reference
          blank to create a pending request.
        </OperationalFeedback>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy} type="submit">
            Create refund
          </button>
        </div>
      </form>
    </CommandDialog>
  );
}

export function FinancePostingDialog({
  target,
  accounts,
  busy,
  onClose,
  onSubmit,
}: {
  readonly target: PaymentPostingTarget;
  readonly accounts: readonly FinancialAccountDto[];
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: SubmitHandler;
}) {
  const eligibleAccounts = accounts.filter(
    (account) => account.status === 'ACTIVE' && account.currency_code === target.item.currency,
  );
  return (
    <CommandDialog
      id="finance-posting-title"
      eyebrow="Finance account posting"
      title={target.kind === 'payment' ? 'Receive payment' : 'Record refund payout'}
      onClose={onClose}
    >
      <div className="command-summary">
        <span>
          Record
          <strong>
            {target.kind === 'payment' ? target.item.paymentNumber : target.item.refundNumber}
          </strong>
        </span>
        <span>
          Amount<strong>{formatMoney(target.item.amount, target.item.currency)}</strong>
        </span>
        <span>
          Direction<strong>{target.kind === 'payment' ? 'Money in' : 'Money out'}</strong>
        </span>
      </div>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label>
          {target.kind === 'payment' ? 'Account receiving funds' : 'Account used'}
          <select name="accountId" required>
            <option value="">Choose an account</option>
            {eligibleAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {formatMoney(account.ledger_balance, account.currency_code)}
              </option>
            ))}
          </select>
        </label>
        <OperationalFeedback tone="warning">
          <Landmark aria-hidden="true" /> This creates an immutable ledger movement. It does not
          change the Payment or Refund fact.
        </OperationalFeedback>
        {!eligibleAccounts.length ? (
          <p className="muted">
            No active Finance account in {target.item.currency} is available.{' '}
            <Link className="text-primary underline" href="/finance/accounts">
              Create an account first.
            </Link>
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !eligibleAccounts.length}
            type="submit"
          >
            {target.kind === 'payment' ? 'Receive into account' : 'Record payout'}
          </button>
        </div>
      </form>
    </CommandDialog>
  );
}

export function RefundCompletionDialog({
  refund,
  busy,
  onClose,
  onSubmit,
}: {
  readonly refund: RefundDto;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: SubmitHandler;
}) {
  return (
    <CommandDialog
      id="refund-completion-title"
      eyebrow="Refund completion"
      title={`Complete ${refund.refundNumber}`}
      onClose={onClose}
    >
      <div className="command-summary">
        <span>
          Order<strong>{refund.orderNumber}</strong>
        </span>
        <span>
          Payment<strong>{refund.paymentNumber}</strong>
        </span>
        <span>
          Amount<strong>{formatMoney(refund.amount, refund.currency)}</strong>
        </span>
      </div>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label>
          External refund reference
          <input name="externalReference" autoComplete="off" required autoFocus />
        </label>
        <OperationalFeedback tone="warning">
          <ReceiptText aria-hidden="true" /> Confirm only after the refund was actually sent.
          Completion is an immutable financial fact.
        </OperationalFeedback>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy} type="submit">
            Complete refund
          </button>
        </div>
      </form>
    </CommandDialog>
  );
}
