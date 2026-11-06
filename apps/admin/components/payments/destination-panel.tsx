'use client';
import { useState } from 'react';
import type {
  ReceivingDestinationDto,
  ReceivingDestinationInputDto,
  PaymentPageDto,
  FinancialAccountDto,
} from '@maevelle/contracts';
import { useAdminContext } from '../admin-capabilities';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import {
  PaymentField,
  PaymentNotice,
  PaymentPager,
  PaymentQueryState,
  paymentLabel,
} from './payment-ui';
import { PaymentCommand } from './payment-command';
import { PagePanel, EmptyState } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
export function DestinationPanel() {
  const context = useAdminContext(),
    view = usePaymentPermission('payments.destinations.view'),
    edit = usePaymentPermission('payments.destinations.edit'),
    approve = usePaymentPermission('payments.destinations.approve'),
    viewAccounts = usePaymentPermission('finance.accounts.view');
  const [page, setPage] = useState(1),
    [create, setCreate] = useState(false),
    [selected, select] = useState<ReceivingDestinationDto>(),
    [action, setAction] = useState<'APPROVE' | 'SUSPEND' | 'RETIRE'>();
  const q = usePaymentQuery<PaymentPageDto<ReceivingDestinationDto>>(
    view ? `/admin/payments/destinations?page=${page}` : null,
  );
  const accounts = usePaymentQuery<readonly FinancialAccountDto[]>(
    create && viewAccounts ? '/admin/finance/accounts' : null,
  );
  if (!view)
    return <PaymentNotice>Receiving-destination viewing permission is required.</PaymentNotice>;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Receiving destinations</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={q.refresh}>
            Refresh
          </Button>
          {edit ? <Button onClick={() => setCreate(true)}>Create draft destination</Button> : null}
        </div>
      </div>
      <PaymentNotice>
        Configuration approval is an internal review. It does not activate public collection.
        Changing a number or instructions requires a new draft. Nagad approval remains blocked
        pending provider confirmation.
      </PaymentNotice>
      <PaymentQueryState query={q}>
        {q.data?.items.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {q.data.items.map((d) => (
              <PagePanel key={d.id}>
                <div className="flex justify-between gap-3">
                  <h3 className="font-semibold">
                    {d.provider === 'BKASH' ? 'bKash' : 'Nagad'} · {paymentLabel(d.accountType)}
                  </h3>
                  <StatusBadge status={d.state} />
                </div>
                <p className="text-sm text-muted-foreground">
                  Receiving number ending{' '}
                  <span className="font-mono tabular-nums">{d.receivingNumber.slice(-4)}</span> ·
                  Revision {d.revision}
                </p>
                <Button className="mt-3" variant="outline" onClick={() => select(d)}>
                  Review private details
                </Button>
              </PagePanel>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No receiving destinations"
            description="Create a draft only when the actual merchant account details are available."
          />
        )}
        {q.data ? (
          <PaymentPager page={page} total={q.data.pagination.totalItems} onPage={setPage} />
        ) : null}
      </PaymentQueryState>
      {selected ? (
        <PagePanel>
          <div className="flex justify-between gap-2">
            <h3 className="font-semibold">
              Private receiving details · revision {selected.revision}
            </h3>
            <Button variant="ghost" onClick={() => select(undefined)}>
              Close details
            </Button>
          </div>
          <p className="mt-3 font-mono tabular-nums">{selected.receivingNumber}</p>
          <p>{selected.recipientName}</p>
          <p className="text-sm">
            {paymentLabel(selected.transferAction)} · {selected.instructions}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Created by {selected.createdBy === context.actorId ? 'you' : 'another operator'}.{' '}
            {selected.approvedBy ? 'Independently reviewed.' : 'Not independently approved.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {approve && selected.state === 'DRAFT' ? (
              <Button
                disabled={
                  selected.createdBy === context.actorId ||
                  selected.provider === 'NAGAD' ||
                  selected.transferAction === 'UNVERIFIED'
                }
                onClick={() => setAction('APPROVE')}
              >
                Approve reviewed configuration
              </Button>
            ) : null}
            {edit && selected.state !== 'RETIRED' ? (
              <>
                <Button variant="outline" onClick={() => setAction('SUSPEND')}>
                  Suspend new use
                </Button>
                <Button variant="destructive" onClick={() => setAction('RETIRE')}>
                  Retire destination
                </Button>
              </>
            ) : null}
          </div>
          {selected.createdBy === context.actorId && selected.state === 'DRAFT' ? (
            <p className="mt-2 text-sm text-muted-foreground">
              A different authorized operator must approve your draft.
            </p>
          ) : null}
        </PagePanel>
      ) : null}
      {create ? (
        <PaymentCommand
          title="Create receiving destination draft"
          path="/admin/payments/destinations"
          consequence="This creates a private draft. It does not approve the provider account or enable payments."
          onClose={() => setCreate(false)}
          onSuccess={() => {
            setCreate(false);
            q.refresh();
          }}
          build={(f) => Object.fromEntries(f.entries()) as unknown as ReceivingDestinationInputDto}
        >
          <PaymentField label="Provider" name="provider">
            <option value="BKASH">bKash</option>
            <option value="NAGAD">Nagad (provider workflow unverified)</option>
          </PaymentField>
          <PaymentField label="Account category" name="accountType">
            <option value="PERSONAL_RETAIL_ACCOUNT">Personal Retail Account (PRA)</option>
            <option value="MERCHANT">Merchant account</option>
          </PaymentField>
          <PaymentField
            label="Authorized receiving number"
            name="receivingNumber"
            pattern="01[3-9][0-9]{8}"
          />
          <PaymentField label="Approved recipient name" name="recipientName" maxLength={160} />
          <PaymentField label="Permitted receiving action" name="transferAction">
            <option value="UNVERIFIED">Not yet independently verified</option>
            <option value="MERCHANT_PAYMENT">Merchant payment</option>
            <option value="PAYMENT_QR">Payment QR</option>
          </PaymentField>
          <PaymentField label="Customer payment instructions" name="instructions" type="textarea" />
          <PaymentField label="Associated BDT Finance wallet" name="financialAccountId">
            <option value="">Select authorized Finance wallet</option>
            {accounts.data
              ?.filter(
                (a) =>
                  a.status === 'ACTIVE' &&
                  a.account_type === 'MOBILE_WALLET' &&
                  a.currency_code === 'BDT',
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </PaymentField>
          {!viewAccounts ? (
            <PaymentNotice>
              Finance account viewing permission is required to choose the receiving ledger. No
              account ID entry workaround is available.
            </PaymentNotice>
          ) : accounts.error ? (
            <PaymentNotice>
              {accounts.error}
              <Button variant="outline" onClick={accounts.refresh}>
                Retry accounts
              </Button>
            </PaymentNotice>
          ) : null}
        </PaymentCommand>
      ) : null}
      {selected && action ? (
        <PaymentCommand
          key={`${selected.id}:${action}`}
          title={`${paymentLabel(action)} destination`}
          path={`/admin/payments/destinations/${selected.id}/transitions`}
          consequence={`${selected.provider} ${selected.receivingNumber}, ${paymentLabel(selected.accountType)}, ${selected.recipientName}, ${paymentLabel(selected.transferAction)}, revision ${selected.revision}. Existing Orders retain their original instructions. This does not activate public payments.`}
          onClose={() => setAction(undefined)}
          onSuccess={() => {
            setAction(undefined);
            select(undefined);
            q.refresh();
          }}
          build={(f) => ({
            expectedRevision: selected.revision,
            action,
            reason: String(f.get('reason')),
            ...(action === 'APPROVE'
              ? { providerEvidenceReference: String(f.get('providerEvidenceReference')) }
              : {}),
          })}
        >
          <PaymentField label="Reason for this change" name="reason" maxLength={512} />
          {action === 'APPROVE' ? (
            <PaymentField
              label="Provider onboarding and permitted collection evidence"
              name="providerEvidenceReference"
              maxLength={512}
            />
          ) : null}
        </PaymentCommand>
      ) : null}
    </div>
  );
}
