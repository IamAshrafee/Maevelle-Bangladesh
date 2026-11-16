'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdminPage, PageHeader, PageSection } from '@/components/ui/page-shell';
import { WorkspaceTabs, type WorkspaceTabItem } from '@/components/ui/workspace-tabs';
import { useAdminContext } from './admin-capabilities';
import { PaymentRecords } from './payments/record-panels';
import { ActionQueueHub, type ActionQueueSubtab } from './payments/action-queue-hub';
import { PaymentSettingsHub, type PaymentSettingsSubtab } from './payments/payment-settings-hub';
import { usePaymentPermission } from './payments/use-payment-query';
import { PaymentGuide } from './payments/payment-guide';

const views = {
  payments: {
    label: 'All Payments',
    description:
      'Searchable master ledger of all received customer order payments, applied balances, and Finance postings.',
    icon: 'credit-card' as const,
    steps: [
      'Search by order number, payment number, or transaction reference to inspect status.',
      'Check payment details: verified receipts, remaining order balance, customer returns, and Finance postings.',
      'Initiate customer refunds directly from confirmed payment records for returned merchandise.',
    ],
    tips: [
      'Independent receipt evidence from mobile statements verifies funds with zero-trust.',
      'Use the copy buttons on order and payment numbers to share identifiers with team members.',
    ],
    relatedLinks: [
      { label: 'View Orders', href: '/orders' },
      { label: 'Finance Ledgers', href: '/finance' },
    ],
  },
  queue: {
    label: 'Action Queue',
    description:
      'Daily operator action center: review customer wallet claims, confirm delivered COD, and resolve exceptions.',
    icon: 'clipboard-check' as const,
    steps: [
      'Wallet Claims: Compare customer-submitted bKash/Nagad TxIDs against your incoming statement before verifying.',
      'Delivered COD: Confirm cash received by couriers from customers upon parcel delivery at doorstep.',
      'Receipt Exceptions: Review and reconcile overpayments, late receipts, or reversed entries.',
    ],
    tips: [
      'Maker-checker separation prevents the same operator from creating and approving reversals.',
      'Only mark COD as collected once the delivery agent confirms doorstep cash handover.',
    ],
    relatedLinks: [
      { label: 'Courier COD Settlements in Finance', href: '/finance/cod-settlements' },
    ],
  },
  refunds: {
    label: 'Refunds',
    description:
      'Track money owed back to customers and complete verified disbursement payouts.',
    icon: 'refresh-cw' as const,
    steps: [
      'Start a refund directly from the original payment record in All Payments.',
      'Track refunds transitioning through REQUESTED and PROCESSING status.',
      'Confirm payout completion once independent evidence of the transfer is established.',
    ],
    tips: [
      'Payout completion atomically posts to Finance and settles the customer refund liability.',
      'Total refunds cannot exceed the original net paid amount on an order.',
    ],
    relatedLinks: [
      { label: 'Customer Payments', href: '/payments?tab=payments' },
      { label: 'Treasury Accounts', href: '/finance/accounts' },
    ],
  },
  settings: {
    label: 'Methods & Setup',
    description:
      'Configure storefront checkout payment methods, receiving wallets, payment deadlines, and cash difference rules.',
    icon: 'settings' as const,
    steps: [
      'Checkout Methods: Toggle payment options shown to customers at checkout and configure delivery areas.',
      'Receiving Wallets: Register company bKash/Nagad receiving numbers with dual-custody review.',
      'Payment Deadlines: Set payment expiry and operator review SLA windows.',
      'Cash Difference Rules: Define allowed cash shortfall tolerances for COD deliveries.',
    ],
    tips: [
      'New receiving wallets require approval by a second authorized operator before going live.',
      'Ensure at least one payment method is active in checkout for each supported delivery area.',
    ],
    relatedLinks: [
      { label: 'Store Settings', href: '/settings' },
    ],
  },
} as const;

type View = keyof typeof views;

export function PaymentsConsole() {
  const context = useAdminContext();
  const router = useRouter();
  const pathname = usePathname() ?? '/payments';
  const params = useSearchParams();

  const viewPayments = usePaymentPermission('payments.view');
  const review = usePaymentPermission('payments.review');
  const verify = usePaymentPermission('payments.verify');
  const viewRefunds = usePaymentPermission('refunds.view');
  const viewWallets = usePaymentPermission('payments.destinations.view');
  const manageCash = usePaymentPermission('payments.cash_policies.manage');
  const approveCash = usePaymentPermission('payments.cash_policies.approve');

  const canAccess: Record<View, boolean> = {
    payments: viewPayments,
    queue: review || verify,
    refunds: viewRefunds,
    settings: viewPayments || viewWallets || manageCash || approveCash,
  };

  const requestedTab = params.get('tab');
  const requestedSubtab = params.get('subtab');

  // Handle legacy tab redirects seamlessly
  let normalizedTab: View = 'payments';
  let defaultSubtab: string | null = null;

  if (requestedTab === 'verification') {
    normalizedTab = 'queue';
    defaultSubtab = 'claims';
  } else if (requestedTab === 'cod') {
    normalizedTab = 'queue';
    defaultSubtab = 'cod';
  } else if (requestedTab === 'exceptions') {
    normalizedTab = 'queue';
    defaultSubtab = 'exceptions';
  } else if (
    requestedTab === 'methods' ||
    requestedTab === 'destinations' ||
    requestedTab === 'readiness'
  ) {
    normalizedTab = 'settings';
    defaultSubtab = requestedTab === 'destinations' ? 'wallets' : 'methods';
  } else if (requestedTab === 'policies') {
    normalizedTab = 'settings';
    defaultSubtab = 'deadlines';
  } else if (requestedTab === 'cash-policies') {
    normalizedTab = 'settings';
    defaultSubtab = 'tolerances';
  } else if (requestedTab && Object.hasOwn(views, requestedTab)) {
    normalizedTab = requestedTab as View;
  }

  const availableViews = (Object.keys(views) as View[]).filter((v) => canAccess[v]);

  const selected: View =
    canAccess[normalizedTab]
      ? normalizedTab
      : (availableViews[0] ?? 'payments');

  const currentSubtab = requestedSubtab ?? defaultSubtab;

  const tabItems: WorkspaceTabItem<View>[] = availableViews.map((key) => ({
    value: key,
    label: views[key].label,
    icon: views[key].icon,
  }));

  const owner = `${context.organizationId}:${context.actorId}:${context.capabilities.join(',')}:${JSON.stringify(context.scopes)}`;

  function selectTab(view: View) {
    const currentQ = params.get('q');
    const nextParams = new URLSearchParams();
    nextParams.set('tab', view);
    if (currentQ && view === 'payments') nextParams.set('q', currentQ);
    router.push(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }

  function handleSubtabChange(newSubtab: string) {
    const nextParams = new URLSearchParams(params.toString());
    nextParams.set('tab', selected);
    nextParams.set('subtab', newSubtab);
    router.push(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }

  return (
    <AdminPage>
      <PageHeader
        title="Customer payments"
        description="Review money paid for orders, verify wallet submissions, resolve exceptions and manage customer refunds."
        actions={
          <PaymentGuide
            title={views[selected].label}
            description={views[selected].description}
            steps={views[selected].steps}
            tips={views[selected].tips}
            relatedLinks={views[selected].relatedLinks}
          />
        }
      />

      {availableViews.length > 0 ? (
        <div className="space-y-6">
          <WorkspaceTabs<View>
            items={tabItems}
            value={selected}
            onValueChange={selectTab}
            maxVisible={6}
            ariaLabel="Customer payments workspaces"
          />

          <PageSection
            key={`${owner}:${selected}`}
            title={views[selected].label}
            description={views[selected].description}
          >
            {selected === 'payments' ? (
              <PaymentRecords key={params.toString()} kind="payments" />
            ) : selected === 'queue' ? (
              <ActionQueueHub
                subtab={(currentSubtab as ActionQueueSubtab) || 'claims'}
                onSubtabChange={handleSubtabChange}
              />
            ) : selected === 'refunds' ? (
              <PaymentRecords key={params.toString()} kind="refunds" />
            ) : selected === 'settings' ? (
              <PaymentSettingsHub
                subtab={(currentSubtab as PaymentSettingsSubtab) || 'methods'}
                onSubtabChange={handleSubtabChange}
              />
            ) : null}
          </PageSection>
        </div>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          You do not have permission to access a payment workspace.
        </p>
      )}
    </AdminPage>
  );
}
