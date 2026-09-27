'use client';

import { Landmark, ReceiptText, Truck } from 'lucide-react';
import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
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

type SubmitHandler = (event: FormEvent<HTMLFormElement>) => void | Promise<void>;

interface BaseCommandModalProps {
  readonly open: boolean;
  readonly eyebrow: string;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

function BaseCommandModal({ eyebrow, title, onClose, children }: BaseCommandModalProps) {
  return (
    <Dialog open onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

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
    <BaseCommandModal
      open
      eyebrow="Delivered cash on delivery"
      title="Record collected money"
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-xs">
        <div>
          <span className="text-muted-foreground">Delivery:</span>{' '}
          <strong className="text-foreground">{collection.deliveryNumber}</strong>
        </div>
        <div>
          <span className="text-muted-foreground">Order:</span>{' '}
          <strong className="text-foreground">{collection.orderNumber}</strong>
        </div>
        <div>
          <span className="text-muted-foreground">Expected here:</span>{' '}
          <strong className="text-foreground">
            {formatMoney(collection.expectedAmount, collection.currency)}
          </strong>
        </div>
        <div>
          <span className="text-muted-foreground">Order balance:</span>{' '}
          <strong className="text-foreground">
            {formatMoney(collection.outstandingAmount, collection.currency)}
          </strong>
        </div>
      </div>
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="cod-amount">Amount actually collected</Label>
          <Input
            id="cod-amount"
            name="amount"
            inputMode="decimal"
            defaultValue={collection.expectedAmount}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cod-reference">Courier or collection reference</Label>
          <Input
            id="cod-reference"
            name="externalReference"
            defaultValue={collection.trackingReference ?? ''}
            autoComplete="off"
            minLength={4}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cod-note">
            Operator note <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="cod-note"
            name="note"
            placeholder="Shortfall, courier handoff, or other context"
            rows={2}
          />
        </div>
        <OperationalFeedback tone="warning">
          <Truck className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Delivery confirms the parcel reached the customer; this separate command confirms the money collected.
            You will choose the Treasury account holding it afterward.
          </span>
        </OperationalFeedback>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy} type="submit">
            Confirm collection
          </Button>
        </DialogFooter>
      </form>
    </BaseCommandModal>
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
  const isVerify = decision.mode === 'verify';

  return (
    <BaseCommandModal
      open
      eyebrow="Manual payment"
      title={isVerify ? 'Verify payment submission' : 'Reject payment submission'}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-xs">
        <div>
          <span className="text-muted-foreground">Order:</span>{' '}
          <strong className="text-foreground">{decision.attempt.orderNumber}</strong>
        </div>
        <div>
          <span className="text-muted-foreground">Expected:</span>{' '}
          <strong className="text-foreground">
            {formatMoney(decision.attempt.expectedAmount)}
          </strong>
        </div>
        <div>
          <span className="text-muted-foreground">Claimed:</span>{' '}
          <strong className="text-foreground">
            {decision.attempt.claimedAmount
              ? formatMoney(decision.attempt.claimedAmount)
              : 'Not supplied'}
          </strong>
        </div>
        <div>
          <span className="text-muted-foreground">Reference:</span>{' '}
          <code className="rounded bg-muted px-1 font-mono font-medium text-foreground">
            {decision.attempt.customerReference}
          </code>
        </div>
      </div>
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        {isVerify ? (
          <div className="space-y-1.5">
            <Label htmlFor="verify-amount">Confirmed collected amount</Label>
            <Input
              id="verify-amount"
              name="confirmedAmount"
              inputMode="decimal"
              defaultValue={decision.attempt.claimedAmount ?? decision.attempt.expectedAmount}
              required
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Rejection reason</Label>
            <NativeSelect id="reject-reason" name="reasonCode" defaultValue="REFERENCE_NOT_FOUND">
              <option value="REFERENCE_NOT_FOUND">Reference not found</option>
              <option value="AMOUNT_MISMATCH">Amount mismatch</option>
              <option value="DUPLICATE_SUBMISSION">Duplicate submission</option>
              <option value="SUSPECTED_FRAUD">Suspected fraud</option>
            </NativeSelect>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          This decision is recorded by the server with your authenticated operator audit context.
        </p>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={isVerify ? 'default' : 'destructive'}
            disabled={busy}
            type="submit"
          >
            {isVerify ? 'Confirm verification' : 'Reject submission'}
          </Button>
        </DialogFooter>
      </form>
    </BaseCommandModal>
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
    <BaseCommandModal
      open
      eyebrow="Refund command"
      title={`Refund ${payment.paymentNumber}`}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-xs">
        <div>
          <span className="text-muted-foreground">Order:</span>{' '}
          <strong className="text-foreground">{payment.orderNumber}</strong>
        </div>
        <div>
          <span className="text-muted-foreground">Collected:</span>{' '}
          <strong className="text-foreground">
            {formatMoney(payment.amount, payment.currency)}
          </strong>
        </div>
        <div>
          <span className="text-muted-foreground">Already refunded:</span>{' '}
          <strong className="text-destructive">
            {formatMoney(payment.refunded, payment.currency)}
          </strong>
        </div>
        <div>
          <span className="text-muted-foreground">Available to refund:</span>{' '}
          <strong className="text-foreground">
            {formatMoney(payment.net, payment.currency)}
          </strong>
        </div>
      </div>
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="refund-amount">Refund amount</Label>
          <Input
            id="refund-amount"
            name="amount"
            inputMode="decimal"
            defaultValue={payment.net}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="refund-reason">Reason code</Label>
          <NativeSelect id="refund-reason" name="reasonCode" defaultValue="CUSTOMER_REQUEST">
            <option value="CUSTOMER_REQUEST">Customer request</option>
            <option value="ORDER_CANCELLED">Order cancelled</option>
            <option value="RETURN_APPROVED">Return approved</option>
            <option value="PAYMENT_CORRECTION">Payment correction</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="refund-ref">
            External transaction reference{' '}
            <span className="text-muted-foreground font-normal">(optional until completed)</span>
          </Label>
          <Input id="refund-ref" name="externalReference" autoComplete="off" />
        </div>
        <OperationalFeedback tone="warning">
          <ReceiptText className="size-4 shrink-0" aria-hidden="true" />
          <span>
            A completed refund is immutable. Leave the reference blank to create a pending request.
          </span>
        </OperationalFeedback>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy} type="submit">
            Create refund
          </Button>
        </DialogFooter>
      </form>
    </BaseCommandModal>
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
  const isPayment = target.kind === 'payment';

  return (
    <BaseCommandModal
      open
      eyebrow="Treasury account posting"
      title={isPayment ? 'Receive payment into account' : 'Record refund payout from account'}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-xs">
        <div>
          <span className="text-muted-foreground">Record:</span>{' '}
          <strong className="text-foreground">
            {isPayment ? target.item.paymentNumber : target.item.refundNumber}
          </strong>
        </div>
        <div>
          <span className="text-muted-foreground">Amount:</span>{' '}
          <strong className="text-foreground">
            {formatMoney(target.item.amount, target.item.currency)}
          </strong>
        </div>
        <div className="col-span-2">
          <span className="text-muted-foreground">Ledger movement:</span>{' '}
          <strong className={isPayment ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>
            {isPayment ? 'Inflow (Credit cash/bank account)' : 'Outflow (Debit cash/bank account)'}
          </strong>
        </div>
      </div>
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="posting-account">
            {isPayment ? 'Account receiving funds' : 'Account funding refund'}
          </Label>
          <NativeSelect id="posting-account" name="accountId" required>
            <option value="">Choose a treasury account</option>
            {eligibleAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · Balance: {formatMoney(account.ledger_balance, account.currency_code)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <OperationalFeedback tone="warning">
          <Landmark className="size-4 shrink-0" aria-hidden="true" />
          <span>
            This creates an immutable financial ledger movement. It does not alter the underlying Payment or Refund record.
          </span>
        </OperationalFeedback>
        {!eligibleAccounts.length ? (
          <p className="text-xs text-destructive">
            No active Treasury account in {target.item.currency} is available.{' '}
            <Link className="underline font-semibold" href="/finance/accounts">
              Create an account first.
            </Link>
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || !eligibleAccounts.length}
            type="submit"
          >
            {isPayment ? 'Receive into account' : 'Record payout'}
          </Button>
        </DialogFooter>
      </form>
    </BaseCommandModal>
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
    <BaseCommandModal
      open
      eyebrow="Refund completion"
      title={`Complete refund ${refund.refundNumber}`}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-xs">
        <div>
          <span className="text-muted-foreground">Order:</span>{' '}
          <strong className="text-foreground">{refund.orderNumber}</strong>
        </div>
        <div>
          <span className="text-muted-foreground">Payment:</span>{' '}
          <strong className="text-foreground">{refund.paymentNumber}</strong>
        </div>
        <div className="col-span-2">
          <span className="text-muted-foreground">Amount:</span>{' '}
          <strong className="text-destructive font-semibold">
            {formatMoney(refund.amount, refund.currency)}
          </strong>
        </div>
      </div>
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="completion-ref">External transaction / gateway reference</Label>
          <Input id="completion-ref" name="externalReference" autoComplete="off" required autoFocus />
        </div>
        <OperationalFeedback tone="warning">
          <ReceiptText className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Confirm only after the refund was actually transferred to the customer. Completion is an immutable financial fact.
          </span>
        </OperationalFeedback>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy} type="submit">
            Complete refund
          </Button>
        </DialogFooter>
      </form>
    </BaseCommandModal>
  );
}
