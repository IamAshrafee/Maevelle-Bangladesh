'use client';

import { useState } from 'react';
import { CheckCircle2, Copy, Plus, RefreshCw, ShieldAlert, X } from 'lucide-react';
import type {
  ReceivingDestinationDto,
  ReceivingDestinationInputDto,
  PaymentPageDto,
  FinancialAccountDto,
} from '@maevelle/contracts';
import { useAdminContext } from '../admin-capabilities';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import {
  CopyButton,
  PaymentField,
  PaymentNotice,
  PaymentPager,
  PaymentQueryState,
  paymentLabel,
} from './payment-ui';
import { PaymentCommand } from './payment-command';
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
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/status-badge';

const walletTemplates = {
  BKASH: {
    name: 'bKash',
    accountType: 'PERSONAL_RETAIL_ACCOUNT',
    action: 'MERCHANT_PAYMENT',
    instructions:
      'Open bKash and choose Payment (Merchant Payment in the *247# menu). Enter the receiving number shown here. Check the recipient and pay the exact order amount. Keep the transaction ID from bKash and enter it here. Maevelle will confirm your payment after checking the receipt.',
  },
  NAGAD: {
    name: 'Nagad',
    accountType: 'MERCHANT',
    action: 'UNVERIFIED',
    instructions:
      'Use Nagad’s approved merchant payment option. Check the recipient and pay the exact order amount shown here. Keep the transaction ID from Nagad and enter it here. Maevelle will confirm your payment after checking the receipt.',
  },
} as const;

export function DestinationPanel() {
  const context = useAdminContext();
  const view = usePaymentPermission('payments.destinations.view');
  const edit = usePaymentPermission('payments.destinations.edit');
  const approve = usePaymentPermission('payments.destinations.approve');
  const viewAccounts = usePaymentPermission('finance.accounts.view');

  const [page, setPage] = useState(1);
  const [create, setCreate] = useState<keyof typeof walletTemplates | null>(null);
  const [selected, select] = useState<ReceivingDestinationDto>();
  const [action, setAction] = useState<'APPROVE' | 'SUSPEND' | 'RETIRE'>();

  const q = usePaymentQuery<PaymentPageDto<ReceivingDestinationDto>>(
    view ? `/admin/payments/destinations?page=${page}` : null,
  );
  const accounts = usePaymentQuery<readonly FinancialAccountDto[]>(
    create && viewAccounts ? '/admin/finance/accounts' : null,
  );

  const template = create ? walletTemplates[create] : null;

  if (!view)
    return <PaymentNotice>Receiving-destination viewing permission is required.</PaymentNotice>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            id="receiving-accounts-heading"
            tabIndex={-1}
            className="scroll-mt-24 text-base font-semibold text-foreground"
          >
            Wallet Receiving Accounts
          </h3>
          <p className="text-xs text-muted-foreground">
            Official accounts configured to receive customer mobile-wallet transfers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={q.refresh}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          {edit && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCreate('BKASH')}>
                <Plus className="size-3.5" />
                Set up bKash
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCreate('NAGAD')}>
                <Plus className="size-3.5" />
                Set up Nagad
              </Button>
            </>
          )}
        </div>
      </div>

      <PaymentNotice tone="info">
        Checkout uses the receiving account selected in its payment configuration. Create a new
        draft to change the number or instructions. Nagad requires provider onboarding confirmation.
      </PaymentNotice>

      <PaymentQueryState query={q}>
        {q.data?.items.length ? (
          <>
            {/* Mobile Card List (< 768px) */}
            <div className="grid gap-3 md:hidden">
              {q.data.items.map((d) => (
                <Card key={d.id} className="overflow-hidden border-border bg-card shadow-2xs">
                  <CardContent className="grid gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {d.provider === 'BKASH' ? 'bKash' : 'Nagad'}
                          </span>
                          <Badge variant="outline" className="text-[11px]">
                            {paymentLabel(d.accountType)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>Number ending in:</span>
                          <strong className="font-mono text-foreground font-semibold">
                            {d.receivingNumber.slice(-4)}
                          </strong>
                          <span>· Rev {d.revision}</span>
                        </div>
                      </div>
                      <StatusBadge status={d.state} />
                    </div>

                    <div className="text-xs text-muted-foreground">
                      <span className="text-foreground font-medium">{d.recipientName}</span> ·{' '}
                      {paymentLabel(d.transferAction)}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-9 text-xs font-semibold"
                      onClick={() => select(d)}
                    >
                      Review Private Details
                    </Button>
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
                      <TableHead className="w-[120px]">Provider</TableHead>
                      <TableHead>Account type</TableHead>
                      <TableHead>Receiving number</TableHead>
                      <TableHead>Recipient name</TableHead>
                      <TableHead>Permitted action</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Revision</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q.data.items.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-semibold text-xs">
                            {d.provider === 'BKASH' ? 'bKash' : 'Nagad'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {paymentLabel(d.accountType)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 font-mono text-xs font-semibold">
                            <span>••••••{d.receivingNumber.slice(-4)}</span>
                            <CopyButton value={d.receivingNumber} label="Full Number" />
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground">
                          {d.recipientName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {paymentLabel(d.transferAction)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={d.state} />
                        </TableCell>
                        <TableCell className="text-xs font-mono tabular-nums text-muted-foreground">
                          v{d.revision}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs font-semibold text-primary hover:underline"
                            onClick={() => select(d)}
                          >
                            Review
                          </Button>
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
            title="No receiving wallets registered"
            description="Add company bKash or Nagad phone numbers where customers send manual payments. Once added, another authorized operator must approve the receiving account before it appears on the storefront."
          />
        )}
        {q.data ? (
          <PaymentPager page={page} total={q.data.pagination.totalItems} onPage={setPage} />
        ) : null}
      </PaymentQueryState>

      {/* Review Dialog for Selected Destination */}
      {selected && (
        <Dialog open onOpenChange={(open) => !open && select(undefined)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-base font-semibold">
                  {selected.provider === 'BKASH' ? 'bKash' : 'Nagad'} Receiving Details
                </DialogTitle>
                <StatusBadge status={selected.state} />
              </div>
              <p className="text-xs text-muted-foreground">
                Revision {selected.revision} · {paymentLabel(selected.accountType)}
              </p>
            </DialogHeader>

            <div className="grid gap-3 text-sm">
              <div className="rounded-lg border bg-muted/30 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Full Receiving Number</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-bold text-foreground">
                      {selected.receivingNumber}
                    </span>
                    <CopyButton value={selected.receivingNumber} label="Receiving Number" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Recipient Name:</span>
                  <span className="font-semibold text-foreground">{selected.recipientName}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Transfer Action:</span>
                  <span className="font-medium text-foreground">
                    {paymentLabel(selected.transferAction)}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs font-medium text-muted-foreground">
                  Customer-Facing Instructions
                </span>
                <p className="mt-1 rounded-md border bg-muted/20 p-2.5 text-xs text-foreground leading-relaxed">
                  {selected.instructions}
                </p>
              </div>

              <div className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground space-y-1">
                <div>
                  Created by:{' '}
                  <strong>{selected.createdBy === context.actorId ? 'You' : 'Another operator'}</strong>
                </div>
                <div>
                  Status:{' '}
                  {selected.approvedBy ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      Independently approved
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      Pending independent review
                    </span>
                  )}
                </div>
              </div>

              {selected.createdBy === context.actorId && selected.state === 'DRAFT' && (
                <PaymentNotice tone="warning">
                  Maker-checker policy: A different authorized operator must review and approve your draft.
                </PaymentNotice>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
                {approve && selected.state === 'DRAFT' && (
                  <Button
                    size="sm"
                    disabled={
                      selected.createdBy === context.actorId ||
                      selected.provider === 'NAGAD' ||
                      selected.transferAction === 'UNVERIFIED'
                    }
                    onClick={() => setAction('APPROVE')}
                  >
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    Approve Reviewed Account
                  </Button>
                )}
                {edit && selected.state !== 'RETIRED' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setAction('SUSPEND')}>
                      Suspend Use
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setAction('RETIRE')}>
                      Retire Account
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => select(undefined)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Creation Modal */}
      {create && template && (
        <PaymentCommand
          key={create}
          title={`Set up manual ${template.name}`}
          path="/admin/payments/destinations"
          consequence="This creates a private draft. It does not approve the provider account or enable storefront payments."
          onClose={() => setCreate(null)}
          onSuccess={() => {
            setCreate(null);
            q.refresh();
          }}
          build={(f) => Object.fromEntries(f.entries()) as unknown as ReceivingDestinationInputDto}
        >
          <input type="hidden" name="provider" value={create} />
          <PaymentField
            label="Account category"
            name="accountType"
            defaultValue={template.accountType}
          >
            <option value="PERSONAL_RETAIL_ACCOUNT">Personal Retail Account (PRA)</option>
            <option value="MERCHANT">Merchant account</option>
          </PaymentField>
          <PaymentField
            label="Authorized receiving number"
            name="receivingNumber"
            pattern="01[3-9][0-9]{8}"
            placeholder="01XXXXXXXXX"
          />
          <PaymentField
            label="Approved recipient name"
            name="recipientName"
            maxLength={160}
            defaultValue="Maevelle"
          />
          <PaymentField
            label="Permitted receiving action"
            name="transferAction"
            defaultValue={template.action}
          >
            <option value="UNVERIFIED">Not yet independently verified</option>
            <option value="MERCHANT_PAYMENT">Merchant payment</option>
            <option value="PAYMENT_QR">Payment QR</option>
          </PaymentField>
          <PaymentField
            label="Customer payment instructions"
            name="instructions"
            type="textarea"
            defaultValue={template.instructions}
          />
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
          {!viewAccounts && (
            <PaymentNotice tone="warning">
              Finance account viewing permission is required to choose the receiving ledger.
            </PaymentNotice>
          )}
        </PaymentCommand>
      )}

      {/* Transition Action Modal (Approve, Suspend, Retire) */}
      {selected && action && (
        <PaymentCommand
          key={`${selected.id}:${action}`}
          title={`${paymentLabel(action)} destination`}
          path={`/admin/payments/destinations/${selected.id}/transitions`}
          consequence={`${selected.provider} ${selected.receivingNumber}, revision ${selected.revision}. Existing Orders retain their original instructions. This does not activate storefront checkout.`}
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
          {action === 'APPROVE' && (
            <PaymentField
              label="Provider onboarding and permitted collection evidence"
              name="providerEvidenceReference"
              maxLength={512}
            />
          )}
        </PaymentCommand>
      )}
    </div>
  );
}
