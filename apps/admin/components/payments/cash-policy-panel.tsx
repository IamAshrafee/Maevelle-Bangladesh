'use client';
import { useState } from 'react';
import type { CashPolicyViewDto, CashReadPageDto } from '@maevelle/contracts';
import { useAdminContext } from '../admin-capabilities';
import { PagePanel, EmptyState } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { usePaymentPermission, usePaymentQuery } from './use-payment-query';
import {
  PaymentMoney,
  PaymentNotice,
  PaymentQueryState,
  PaymentPager,
  PaymentField,
} from './payment-ui';
import { PaymentCommand } from './payment-command';
import { CashPolicyFields, cashPolicyBody } from './cash-policy-form';

export function CashPolicyPanel() {
  const c = useAdminContext(),
    manage = usePaymentPermission('payments.cash_policies.manage'),
    approve = usePaymentPermission('payments.cash_policies.approve');
  const [page, setPage] = useState(1),
    [create, setCreate] = useState(false),
    [selected, select] = useState<CashPolicyViewDto>();
  const q = usePaymentQuery<CashReadPageDto<CashPolicyViewDto>>(
    manage || approve ? `/admin/payments/cash-policies?page=${page}&pageSize=20` : null,
  );
  if (!manage && !approve)
    return <PaymentNotice>Cash policy management or review permission is required.</PaymentNotice>;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Cash difference policies</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={q.refresh}>
            Refresh policies
          </Button>
          {manage && <Button onClick={() => setCreate(true)}>Propose cash policy</Button>}
        </div>
      </div>
      <PaymentNotice>
        Approval records a reviewed proposal. Live cash adjustment application remains blocked. Tax,
        invoice, accounting and courier decisions require genuine evidence; there are no default
        live thresholds.
      </PaymentNotice>
      <PaymentQueryState query={q}>
        {q.data?.items.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {q.data.items.map((p) => (
              <PagePanel key={p.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="break-words font-semibold">{p.definition.revision}</h3>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-sm">{p.definition.scope} · COD only · activation blocked</p>
                <dl className="my-3 grid grid-cols-2 gap-3">
                  {[
                    ['Per adjustment', p.definition.maximumPerAdjustment],
                    ['Per Order gross', p.definition.maximumPerOrder],
                    ['Per staff / UTC day gross', p.definition.maximumPerStaffDay],
                    ['Self-authorization', p.definition.selfApprovalLimit],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd>
                        <PaymentMoney value={value!} />
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="font-mono tabular-nums break-words text-xs">
                  {p.definition.effectiveFrom} – {p.definition.expiresAt}
                </p>
                <p className="text-sm">
                  Order states: {p.definition.allowedOrderStates.join(', ')}
                </p>
                <dl className="mt-3 grid gap-2 break-words text-sm">
                  {[
                    ['Accounting', p.definition.accountingReference],
                    ['Invoice', p.definition.invoiceTreatmentReference],
                    ['Courier permission', p.definition.courierShortCollectionReference],
                    ['Approval evidence', p.approvalReference ?? 'Pending'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-muted-foreground break-all">
                  Proposed by {p.createdBy === c.actorId ? 'you' : p.createdBy} at {p.createdAt}.{' '}
                  {p.approvedBy
                    ? `Reviewed by ${p.approvedBy} at ${p.approvedAt}.`
                    : 'Independent review pending.'}
                </p>
                {approve && !p.policyId && (
                  <Button
                    className="mt-3"
                    variant="outline"
                    disabled={p.createdBy === c.actorId}
                    onClick={() => select(p)}
                  >
                    Review policy proposal
                  </Button>
                )}
              </PagePanel>
            ))}
          </div>
        ) : (
          <EmptyState title="No cash policy proposals" />
        )}
        {q.data && <PaymentPager page={page} pageSize={20} total={q.data.total} onPage={setPage} />}
      </PaymentQueryState>
      {create && manage && (
        <PaymentCommand
          title="Propose cash difference policy"
          path="/admin/payments/cash-policies"
          consequence="Proposal only. Independent policy approval does not activate financial operations."
          build={cashPolicyBody}
          onClose={() => setCreate(false)}
          onSuccess={() => {
            setCreate(false);
            q.refresh();
          }}
        >
          <CashPolicyFields />
        </PaymentCommand>
      )}
      {selected && approve && (
        <PaymentCommand
          title="Approve cash policy proposal"
          path={`/admin/payments/cash-policies/${selected.id}/approve`}
          consequence="Records independent review only; cash adjustment application remains unavailable."
          context={<p>Policy revision: {selected.definition.revision}</p>}
          build={(f) => ({ approvalReference: String(f.get('approvalReference')) })}
          onClose={() => select(undefined)}
          onSuccess={() => {
            select(undefined);
            q.refresh();
          }}
        >
          <PaymentField
            name="approvalReference"
            label="Approval evidence reference"
            maxLength={512}
          />
        </PaymentCommand>
      )}
    </div>
  );
}
