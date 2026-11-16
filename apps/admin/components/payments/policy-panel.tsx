'use client';

import { useState } from 'react';
import { CheckCircle2, Clock, Plus, RefreshCw } from 'lucide-react';
import type { PaymentPageDto, PaymentPolicyDto } from '@maevelle/contracts';
import { useAdminContext } from '../admin-capabilities';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import { PaymentCommand } from './payment-command';
import { PaymentField, PaymentNotice, PaymentPager, PaymentQueryState } from './payment-ui';
import { EmptyState } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { formatFinanceDate } from '@/lib/finance/types';

export function PolicyPanel() {
  const c = useAdminContext();
  const view = usePaymentPermission('payments.destinations.view');
  const edit = usePaymentPermission('payments.destinations.edit');
  const approve = usePaymentPermission('payments.destinations.approve');

  const [page, setPage] = useState(1);
  const [create, setCreate] = useState(false);
  const [selected, select] = useState<PaymentPolicyDto>();

  const q = usePaymentQuery<PaymentPageDto<PaymentPolicyDto>>(
    view ? `/admin/payments/operating-policies?page=${page}` : null,
  );

  if (!view) return <PaymentNotice>Configuration viewing permission is required.</PaymentNotice>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Wallet Deadlines & Review Windows</h3>
          <p className="text-xs text-muted-foreground">
            Configure how long shoppers have to pay, and the extra window staff have to check manual claims.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={q.refresh}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          {edit && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreate(true)}>
              <Plus className="size-3.5" />
              Propose deadlines
            </Button>
          )}
        </div>
      </div>

      <PaymentNotice tone="info">
        The payment window starts when the order is placed. The review window gives staff extra time
        to check submitted claims against receiving statements. Another authorized operator must approve both windows.
      </PaymentNotice>

      <PaymentQueryState query={q}>
        {q.data?.items.length ? (
          <>
            {/* Mobile Card View (< 768px) */}
            <div className="grid gap-3 md:hidden">
              {q.data.items.map((p) => (
                <Card key={p.id} className="overflow-hidden border-border bg-card shadow-2xs">
                  <CardContent className="grid gap-3 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        <span>Proposed {formatFinanceDate(p.createdAt)}</span>
                      </div>
                      <StatusBadge status={p.policyId ? 'APPROVED' : 'PENDING'} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/30 p-2.5 text-center">
                      <div>
                        <span className="block text-[11px] text-muted-foreground">Customer to Pay</span>
                        <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                          {p.submissionMinutes} mins
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-muted-foreground">Staff Review Window</span>
                        <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                          {p.reviewMinutes} mins
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Proposed by {p.createdBy === c.actorId ? 'You' : 'Another operator'}.{' '}
                      {p.policyId ? 'Approved for use in Checkout.' : 'Awaiting independent approval.'}
                    </p>

                    {approve && !p.policyId && (
                      <Button
                        size="sm"
                        className="w-full h-9 text-xs font-semibold gap-1.5"
                        disabled={p.createdBy === c.actorId}
                        onClick={() => select(p)}
                      >
                        <CheckCircle2 className="size-3.5" />
                        Review and approve proposal
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Desktop Table (>= 768px) */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table stickyHeader density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Submission window</TableHead>
                      <TableHead>Review window</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Proposed by</TableHead>
                      <TableHead>Proposed at</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q.data.items.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs font-semibold text-foreground tabular-nums">
                          {p.submissionMinutes} minutes ({Math.round(p.submissionMinutes / 60)}h)
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-foreground tabular-nums">
                          {p.reviewMinutes} minutes ({Math.round(p.reviewMinutes / 60)}h)
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.policyId ? 'APPROVED' : 'PENDING'} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.createdBy === c.actorId ? 'You' : 'Another operator'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono tabular-nums">
                          {formatFinanceDate(p.createdAt, true)}
                        </TableCell>
                        <TableCell className="text-right">
                          {approve && !p.policyId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs font-semibold"
                              disabled={p.createdBy === c.actorId}
                              onClick={() => select(p)}
                            >
                              Approve
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : (
          <EmptyState
            title="No custom payment deadlines configured"
            description="Default system rules give customers 24 hours to pay and staff 2 hours to review. Propose custom deadlines above if your store requires different windows."
          />
        )}
        {q.data ? (
          <PaymentPager page={page} total={q.data.pagination.totalItems} onPage={setPage} />
        ) : null}
      </PaymentQueryState>

      {/* Propose Deadlines Modal */}
      {create && (
        <PaymentCommand
          title="Propose payment deadlines"
          path="/admin/payments/operating-policy-proposals"
          consequence="An authorized reviewer must approve these deadlines before Storefront Checkout can use them."
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
            defaultValue={1440}
            hint="How long the customer has to pay and submit their transaction reference (e.g. 1440 = 24 hours)."
          />
          <PaymentField
            label="Additional management review window (minutes)"
            name="reviewMinutes"
            type="number"
            min={1}
            max={10080}
            defaultValue={60}
            hint="Extra time for staff to review the customer's claim before it is marked overdue."
          />
        </PaymentCommand>
      )}

      {/* Approve Deadlines Modal */}
      {selected && (
        <PaymentCommand
          title="Approve independently reviewed deadlines"
          path="/admin/payments/operating-policies"
          consequence={`Submission: ${selected.submissionMinutes} minutes. Additional review: ${selected.reviewMinutes} minutes. This approves the policy for Checkout configuration.`}
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
            placeholder="e.g. Approved per Ops Meeting decision Ref #102"
          />
        </PaymentCommand>
      )}
    </div>
  );
}
