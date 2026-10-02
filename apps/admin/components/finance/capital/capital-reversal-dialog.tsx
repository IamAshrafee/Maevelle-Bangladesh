'use client';

import { useState, type FormEvent } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { CapitalEventDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney } from '@/lib/finance/types';

export interface CapitalReversalDialogProps {
  readonly event?: CapitalEventDto | undefined;
  readonly defaultCurrency: string;
  readonly open: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (reason: string) => Promise<void>;
}

export function CapitalReversalDialog({
  event,
  defaultCurrency,
  open,
  busy,
  onClose,
  onSubmit,
}: CapitalReversalDialogProps) {
  const [reason, setReason] = useState('');

  if (!event) return null;

  const currency = event.currencyCode || defaultCurrency;
  const absAmount = formatMoney(Math.abs(Number(event.amountDelta)), currency);

  function getConsequenceExplanation() {
    switch (event?.eventType) {
      case 'CONTRIBUTION':
        return `This will reverse the contribution of ${absAmount} and deduct it from account "${event.accountName || 'business account'}". Contributor ${event.contributorName}'s net capital position will decrease by ${absAmount}. The account must hold sufficient funds.`;
      case 'OWNER_FUNDED_EXPENSE':
        return `This will reverse the personal payment of ${absAmount} on Expense ${event.expenseNumber || 'obligation'}. The expense's outstanding payable balance will be restored by ${absAmount}. Contributor ${event.contributorName}'s capital position will decrease by ${absAmount}. Business cash balances are unaffected.`;
      case 'WITHDRAWAL':
        return `This will reverse the withdrawal of ${absAmount} and return the cash back into account "${event.accountName || 'business account'}". Contributor ${event.contributorName}'s capital position will increase by ${absAmount}.`;
      default:
        return `This will create a compensating reversal record for ${event?.transactionNumber || 'this transaction'} and restore affected balances atomically.`;
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (reason.trim().length < 4) return;
    await onSubmit(reason.trim());
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <RotateCcw className="size-5 shrink-0" />
              <DialogTitle>Reverse capital transaction</DialogTitle>
            </div>
            <DialogDescription className="leading-relaxed">
              Financial entries are never deleted or rewritten. A reversal creates an equal and opposite compensating transaction while preserving immutable history.
            </DialogDescription>
          </DialogHeader>

          {/* Specific financial consequence notice */}
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 space-y-1.5 text-xs text-foreground">
            <div className="flex items-center gap-1.5 font-semibold text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              <span>Financial consequence of reversing {event.transactionNumber}</span>
            </div>
            <p className="leading-relaxed text-muted-foreground">{getConsequenceExplanation()}</p>
          </div>

          <label className="grid gap-1.5 text-sm font-medium">
            <span>Reversal audit reason (required, minimum 4 characters)</span>
            <Textarea
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={4}
              maxLength={1000}
              placeholder="e.g. Incorrect bank account selected by mistake; re-recording into BRAC bank."
              required
              autoFocus
            />
          </label>

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Keep transaction
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || reason.trim().length < 4}
              className="gap-1.5"
            >
              <RotateCcw className="size-4" />
              <span>Confirm & reverse</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
