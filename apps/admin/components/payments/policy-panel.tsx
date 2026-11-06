'use client';
import { useState } from 'react';
import type { PaymentPageDto, PaymentPolicyDto } from '@maevelle/contracts';
import { useAdminContext } from '../admin-capabilities';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import { PaymentCommand } from './payment-command';
import { PaymentField, PaymentNotice, PaymentPager, PaymentQueryState } from './payment-ui';
import { PagePanel, EmptyState } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
export function PolicyPanel() {
  const c = useAdminContext(),
    view = usePaymentPermission('payments.destinations.view'),
    edit = usePaymentPermission('payments.destinations.edit'),
    approve = usePaymentPermission('payments.destinations.approve');
  const [page, setPage] = useState(1),
    [create, setCreate] = useState(false),
    [selected, select] = useState<PaymentPolicyDto>();
  const q = usePaymentQuery<PaymentPageDto<PaymentPolicyDto>>(
    view ? `/admin/payments/operating-policies?page=${page}` : null,
  );
  if (!view) return <PaymentNotice>Configuration viewing permission is required.</PaymentNotice>;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-lg font-semibold">Payment and review deadlines</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={q.refresh}>
            Refresh
          </Button>
          {edit ? <Button onClick={() => setCreate(true)}>Propose deadlines</Button> : null}
        </div>
      </div>
      <PaymentNotice>
        No production default is assumed. A separate authorized operator must approve the proposed
        payment window and staffing/review policy. Repeated claims cannot extend the approved review
        deadline indefinitely.
      </PaymentNotice>
      <PaymentQueryState query={q}>
        {q.data?.items.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {q.data.items.map((p) => (
              <PagePanel key={p.id}>
                <StatusBadge status={p.policyId ? 'APPROVED' : 'PENDING'} />
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt>Payment submission</dt>
                    <dd className="font-mono tabular-nums">{p.submissionMinutes} minutes</dd>
                  </div>
                  <div>
                    <dt>Additional review window</dt>
                    <dd className="font-mono tabular-nums">{p.reviewMinutes} minutes</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  Proposed by {p.createdBy === c.actorId ? 'you' : 'another operator'} on{' '}
                  <time className="font-mono tabular-nums">
                    {new Date(p.createdAt).toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' })}
                  </time>
                  .{' '}
                  {p.policyId
                    ? 'Approved immutable policy; public activation remains blocked.'
                    : 'Awaiting independent approval.'}
                </p>
                {approve && !p.policyId ? (
                  <Button
                    className="mt-3"
                    disabled={p.createdBy === c.actorId}
                    onClick={() => select(p)}
                  >
                    Review and approve proposal
                  </Button>
                ) : null}
              </PagePanel>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No deadline proposals"
            description="Agree on business hours and review staffing before proposing deadlines."
          />
        )}
        {q.data ? (
          <PaymentPager page={page} total={q.data.pagination.totalItems} onPage={setPage} />
        ) : null}
      </PaymentQueryState>
      {create ? (
        <PaymentCommand
          title="Propose payment deadlines"
          path="/admin/payments/operating-policy-proposals"
          consequence="This proposes deadlines only. Independent approval and public activation are separate."
          onClose={() => setCreate(false)}
          onSuccess={() => {
            setCreate(false);
            q.refresh();
          }}
          build={(f) => ({
            submissionMinutes: Number(f.get('submissionMinutes')),
            reviewMinutes: Number(f.get('reviewMinutes')),
          })}
        >
          <PaymentField
            label="Payment submission window (minutes)"
            name="submissionMinutes"
            type="number"
            min={15}
            max={10080}
          />
          <PaymentField
            label="Additional management review window (minutes)"
            name="reviewMinutes"
            type="number"
            min={1}
            max={10080}
          />
        </PaymentCommand>
      ) : null}
      {selected ? (
        <PaymentCommand
          title="Approve independently reviewed deadlines"
          path="/admin/payments/operating-policies"
          consequence={`Submission: ${selected.submissionMinutes} minutes. Additional review: ${selected.reviewMinutes} minutes. This does not activate Checkout.`}
          onClose={() => select(undefined)}
          onSuccess={() => {
            select(undefined);
            q.refresh();
          }}
          build={(f) => ({
            proposalId: selected.id,
            approvalReference: String(f.get('approvalReference')),
          })}
        >
          <PaymentField
            label="Operating approval reference"
            name="approvalReference"
            maxLength={512}
          />
        </PaymentCommand>
      ) : null}
    </div>
  );
}
