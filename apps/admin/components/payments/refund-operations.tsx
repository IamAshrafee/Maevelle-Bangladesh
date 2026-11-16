'use client';
import { useState } from 'react';
import type { PaymentDto, RefundDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PaymentCommand } from './payment-command';
import { PaymentField, PaymentMoney, PaymentNotice } from './payment-ui';
import { usePaymentPermission } from './use-payment-query';
export function CreateRefundAction({
  payment,
  onRefresh,
}: {
  payment: PaymentDto;
  onRefresh: () => void;
}) {
  const allowed = usePaymentPermission('refunds.manage'),
    [open, setOpen] = useState(false);
  if (!allowed || payment.status !== 'CONFIRMED') return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Request refund
      </Button>
      {open ? (
        <PaymentCommand
          title="Create refund obligation"
          path={`/admin/payments/${payment.id}/refunds`}
          consequence="This creates a refund request, not a completed payout. Excess liability is returned before commercial value. The backend checks the remaining refundable balance."
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false);
            onRefresh();
          }}
          build={(f) => ({
            amount: String(f.get('amount')),
            reasonCode: String(f.get('reasonCode')),
            reasonText: String(f.get('reasonText')),
          })}
        >
          <PaymentMoney
            label="Received less completed refunds (pending requests may reduce availability)"
            value={payment.net}
            currency={payment.currency}
          />
          <PaymentField
            label={`Refund amount (${payment.currency})`}
            name="amount"
            pattern="[0-9]{1,16}(\.[0-9]{1,4})?"
          />
          <PaymentField label="Refund reason" name="reasonCode">
            <option value="CUSTOMER_REQUEST">Customer request</option>
            <option value="ORDER_CANCELLED">Order cancelled</option>
            <option value="OVERPAYMENT">Return excess receipt</option>
            <option value="LATE_RECEIPT">Return late receipt</option>
          </PaymentField>
          <PaymentField label="Private refund note" name="reasonText" type="textarea" />
        </PaymentCommand>
      ) : null}
    </>
  );
}
export function RefundOperations({
  refund,
  onRefresh,
}: {
  refund: RefundDto;
  onRefresh: () => void;
}) {
  const allowed = usePaymentPermission('refunds.manage'),
    [action, setAction] = useState<'complete' | 'processing'>();
  if (!allowed || ['COMPLETED', 'FAILED', 'CANCELLED_BEFORE_PROCESSING'].includes(refund.status))
    return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setAction('processing')}>
          Update payout progress
        </Button>
        <Button variant="outline" onClick={() => setAction('complete')}>
          Record independently confirmed payout
        </Button>
      </div>
      {refund.status === 'UNKNOWN_EXTERNAL_OUTCOME' ? (
        <PaymentNotice>
          Payout outcome unknown. Do not send again. Check the original account history before
          reconciling this refund.
        </PaymentNotice>
      ) : null}
      {action ? (
        <PaymentCommand
          key={action}
          title={
            action === 'complete' ? 'Confirm actual refund payout' : 'Update refund processing'
          }
          path={`/admin/refunds/${refund.id}/${action}`}
          consequence={
            action === 'complete'
              ? 'Record an independently checked transfer to the verified original source. This records the payout and Finance movement atomically for independently evidenced receipts; do not post again.'
              : 'Unknown outcomes retain the obligation and cannot restart processing. No transfer is executed by this action.'
          }
          onClose={() => setAction(undefined)}
          onSuccess={() => {
            setAction(undefined);
            onRefresh();
          }}
          build={(f) =>
            action === 'complete'
              ? {
                  externalReference: String(f.get('externalReference')),
                  evidenceReference: String(f.get('evidenceReference')),
                  originalSourceVerified: f.get('originalSourceVerified') === 'on',
                }
              : {
                  expectedVersion: refund.version,
                  state: String(f.get('state')),
                  evidenceReference: String(f.get('evidenceReference')),
                }
          }
        >
          <PaymentMoney
            value={refund.amount}
            currency={refund.currency}
            label="Refund obligation"
          />
          {action === 'complete' ? (
            <>
              <PaymentField
                label="Actual outgoing transaction reference"
                name="externalReference"
                maxLength={128}
              />
              <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                <Checkbox name="originalSourceVerified" required />
                <span>I independently verified the original payment source and actual refund transfer.</span>
              </label>
            </>
          ) : (
            <PaymentField label="Processing state" name="state">
              {refund.status === 'REQUESTED' ? (
                <>
                  <option value="PROCESSING">Processing authorized payout</option>
                  <option value="CANCELLED_BEFORE_PROCESSING">
                    Cancel before transfer processing
                  </option>
                </>
              ) : (
                <>
                  {refund.status === 'PROCESSING' ? (
                    <option value="UNKNOWN_EXTERNAL_OUTCOME">
                      Transfer result unknown — reconciliation required
                    </option>
                  ) : null}
                  <option value="FAILED">Independently established failed transfer</option>
                </>
              )}
            </PaymentField>
          )}
          <PaymentField
            label="Independent processing or reconciliation evidence reference"
            name="evidenceReference"
            maxLength={512}
          />
        </PaymentCommand>
      ) : null}
    </>
  );
}
