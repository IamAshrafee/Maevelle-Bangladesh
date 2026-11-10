'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { PaymentReadinessDto } from '@maevelle/contracts';
import { AdminPage, PageHeader, PagePanel } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { useAdminContext } from './admin-capabilities';
import { ClaimReviewQueue } from './payments/claim-review';
import { DestinationPanel } from './payments/destination-panel';
import { PolicyPanel } from './payments/policy-panel';
import { CashPolicyPanel } from './payments/cash-policy-panel';
import { ReceiptExceptions } from './payments/receipt-workspace';
import { PaymentRecords, CodOperations } from './payments/record-panels';
import { PaymentNotice, PaymentQueryState } from './payments/payment-ui';
import { usePaymentQuery, usePaymentPermission } from './payments/use-payment-query';
const tabs = [
  ['verification', 'Review claims'],
  ['payments', 'Received payments'],
  ['refunds', 'Refunds'],
  ['exceptions', 'Exceptions'],
  ['cod', 'COD collections'],
  ['destinations', 'Receiving destinations'],
  ['policies', 'Deadlines'],
  ['cash-policies', 'Cash difference policies'],
  ['readiness', 'Readiness'],
] as const;
type Tab = (typeof tabs)[number][0];
export function PaymentsConsole() {
  const c = useAdminContext();
  const params = useSearchParams(),
    requested = params.get('tab');
  const selected: Tab = tabs.some(([key]) => key === requested)
    ? (requested as Tab)
    : requested === 'methods'
      ? 'readiness'
      : params.get('q')
        ? 'payments'
        : 'verification';
  const [tab, setTab] = useState<Tab>(selected);
  useEffect(() => setTab(selected), [selected]);
  const owner = `${c.organizationId}:${c.actorId}:${c.capabilities.join(',')}:${JSON.stringify(c.scopes)}`;
  return (
    <AdminPage>
      <PageHeader
        title="Payment operations"
        description="Review independently received funds, resolve liabilities and manage approved configuration."
        actions={
          <Button variant="outline" render={<Link href="/finance" />}>
            Finance overview
          </Button>
        }
      />
      <PaymentNotice>
        Public Checkout purchases and payment collection remain unavailable. Internal approval does
        not establish provider activation.
      </PaymentNotice>
      <nav aria-label="Payment workspaces" className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            aria-current={tab === key ? 'page' : undefined}
            variant={tab === key ? 'default' : 'outline'}
            onClick={() => {
              setTab(key);
              const url = new URL(window.location.href);
              url.search = '';
              url.searchParams.set('tab', key);
              window.history.replaceState(null, '', url.pathname + url.search);
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      <section key={`${owner}:${tab}`} aria-label={tabs.find(([key]) => key === tab)?.[1]}>
        {tab === 'verification' ? (
          <ClaimReviewQueue />
        ) : tab === 'destinations' ? (
          <DestinationPanel />
        ) : tab === 'policies' ? (
          <PolicyPanel />
        ) : tab === 'cash-policies' ? (
          <CashPolicyPanel />
        ) : tab === 'exceptions' ? (
          <ReceiptExceptions />
        ) : tab === 'cod' ? (
          <CodOperations />
        ) : tab === 'readiness' ? (
          <ReadinessPanel />
        ) : (
          <PaymentRecords kind={tab} />
        )}
      </section>
    </AdminPage>
  );
}
function ReadinessPanel() {
  const allowed = usePaymentPermission('payments.view'),
    q = usePaymentQuery<readonly PaymentReadinessDto[]>(
      allowed ? '/admin/payments/readiness' : null,
    );
  if (!allowed) return <PaymentNotice>Payment viewing permission is required.</PaymentNotice>;
  const labels: Record<string, string> = {
    CHECKOUT_PLACEMENT_DISABLED: 'Secure Order placement is not available',
    TAX_POLICY_UNRESOLVED: 'Tax and invoicing policy needs approval',
    FINAL_PAYABLE_POLICY_UNRESOLVED: 'Final payable and rounding need approval',
    DELIVERY_COURIER_COMPATIBILITY_UNVERIFIED: 'Real delivery and courier compatibility unverified',
    COD_OPERATING_POLICY_UNAPPROVED: 'COD operating policy not approved',
    LIVE_DESTINATION_ACTIVATION_DISABLED: 'Live receiving destination activation unavailable',
    PAYMENT_REVIEW_DEADLINES_UNAPPROVED: 'Public payment and review deadlines not approved',
    PROVIDER_FEES_LIMITS_UNVERIFIED: 'Provider fees and limits remain unverified',
    NAGAD_ACCOUNT_TYPE_UNVERIFIED: 'Nagad account category and collection workflow unverified',
  };
  return (
    <div className="grid gap-4">
      <Button className="w-fit" variant="outline" onClick={q.refresh}>
        Refresh readiness
      </Button>
      <PaymentQueryState query={q}>
        {q.data?.map((method) => (
          <PagePanel key={method.method}>
            <h2 className="font-semibold">
              {method.method === 'COD'
                ? 'Cash on Delivery'
                : method.method === 'BKASH_MANUAL'
                  ? 'Manual bKash'
                  : 'Manual Nagad'}{' '}
              — public use unavailable
            </h2>
            <p className="my-2 text-sm">
              Backend financial operations are implemented. Internal configuration approval,
              external merchant onboarding, public activation and final Checkout readiness are
              separate.
            </p>
            <p className="text-sm">
              Maevelle-added manual surcharge: zero. External provider fees: unknown. Tax and final
              payable: unresolved.
            </p>
            <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground">
              {method.blockers.map((reason) => (
                <li key={reason}>{labels[reason] ?? 'Additional approval is required'}</li>
              ))}
            </ul>
          </PagePanel>
        ))}
      </PaymentQueryState>
    </div>
  );
}
