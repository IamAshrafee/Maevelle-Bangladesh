'use client';

import { useState } from 'react';
import { CheckCircle2, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import type { CashPolicyViewDto, CashReadPageDto } from '@maevelle/contracts';
import { useAdminContext } from '../admin-capabilities';
import { EmptyState } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { formatFinanceDate } from '@/lib/finance/types';

export function CashPolicyPanel() {
  const c = useAdminContext();
  const manage = usePaymentPermission('payments.cash_policies.manage');
  const approve = usePaymentPermission('payments.cash_policies.approve');

  const [page, setPage] = useState(1);
  const [create, setCreate] = useState(false);
  const [selected, select] = useState<CashPolicyViewDto>();

  const q = usePaymentQuery<CashReadPageDto<CashPolicyViewDto>>(
    manage || approve ? `/admin/payments/cash-policies?page=${page}&pageSize=20` : null,
  );

  if (!manage && !approve)
    return <PaymentNotice>Cash policy management or review permission is required.</PaymentNotice>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Cash Difference Rules</h3>
          <p className="text-xs text-muted-foreground">
            Manage who can approve small differences between order payable balances and cash collected by couriers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={q.refresh}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          {manage && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreate(true)}>
              <Plus className="size-3.5" />
              Propose cash policy
            </Button>
          )}
        </div>
      </div>

      <PaymentNotice tone="warning">
        These rules record how staff should handle small COD shortfalls. Cash adjustments for live
        orders remain guarded until fully verified and authorized.
      </PaymentNotice>

      <PaymentQueryState query={q}>
        {q.data?.items.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {q.data.items.map((p) => (
              <Card key={p.id} className="border-border bg-card shadow-2xs">
                <CardContent className="grid gap-3.5 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-mono text-sm font-bold text-foreground">
                        {p.definition.revision}
                      </h4>
                      <Badge variant="outline" className="text-[11px] mt-1 font-normal">
                        {p.definition.scope === 'BUSINESS' ? 'Business policy' : 'Test policy'} · COD only
                      </Badge>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>

                  {/* 4-Item Metric Grid */}
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/30 p-3 text-xs">
                    <div>
                      <span className="block text-[11px] text-muted-foreground">Per Adjustment</span>
                      <PaymentMoney value={p.definition.maximumPerAdjustment} size="sm" />
                    </div>
                    <div>
                      <span className="block text-[11px] text-muted-foreground">Per Order Gross</span>
                      <PaymentMoney value={p.definition.maximumPerOrder} size="sm" />
                    </div>
                    <div>
                      <span className="block text-[11px] text-muted-foreground">Per Staff/Day Gross</span>
                      <PaymentMoney value={p.definition.maximumPerStaffDay} size="sm" />
                    </div>
                    <div>
                      <span className="block text-[11px] text-muted-foreground">Self-Approval Limit</span>
                      <PaymentMoney value={p.definition.selfApprovalLimit} size="sm" />
                    </div>
                  </div>

                  <div className="grid gap-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Effective window:</span>
                      <span className="font-mono tabular-nums text-foreground">
                        {formatFinanceDate(p.definition.effectiveFrom)} – {formatFinanceDate(p.definition.expiresAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Order states:</span>
                      <span className="font-medium text-foreground">
                        {p.definition.allowedOrderStates.join(', ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Accounting Ref:</span>
                      <span className="font-mono truncate max-w-[200px] text-foreground">
                        {p.definition.accountingReference}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                    Proposed by {p.createdBy === c.actorId ? 'You' : p.createdBy}.{' '}
                    {p.approvedBy ? `Reviewed by ${p.approvedBy}.` : 'Independent review pending.'}
                  </p>

                  {approve && !p.policyId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-9 text-xs font-semibold gap-1.5"
                      disabled={p.createdBy === c.actorId}
                      onClick={() => select(p)}
                    >
                      <CheckCircle2 className="size-3.5" />
                      Review policy proposal
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No cash difference rules configured"
            description="Cash difference rules establish allowable shortfall limits when couriers collect cash on delivery. Propose a policy above to set tolerance thresholds."
          />
        )}
        {q.data && <PaymentPager page={page} pageSize={20} total={q.data.total} onPage={setPage} />}
      </PaymentQueryState>

      {/* Propose Cash Policy Modal */}
      {create && manage && (
        <PaymentCommand
          title="Propose cash difference policy"
          path="/admin/payments/cash-policies"
          consequence="Proposal only. Independent policy approval records governance rules."
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

      {/* Approve Policy Proposal Modal */}
      {selected && approve && (
        <PaymentCommand
          title="Approve cash policy proposal"
          path={`/admin/payments/cash-policies/${selected.id}/approve`}
          consequence="Records independent review evidence only."
          context={
            <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
              <div>
                Policy Revision: <strong>{selected.definition.revision}</strong>
              </div>
              <div>
                Scope: <strong>{selected.definition.scope}</strong>
              </div>
            </div>
          }
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
            placeholder="e.g. Approved by Finance Director Ref #FD-2026-04"
          />
        </PaymentCommand>
      )}
    </div>
  );
}
