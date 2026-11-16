'use client';

import { useMemo } from 'react';
import { CreditCard, Landmark, Clock, Coins, Info } from 'lucide-react';
import { usePaymentPermission } from './use-payment-query';
import { CheckoutMethodsPanel } from './checkout-methods-panel';
import { DestinationPanel } from './destination-panel';
import { PolicyPanel } from './policy-panel';
import { CashPolicyPanel } from './cash-policy-panel';
import { PaymentNotice } from './payment-ui';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type PaymentSettingsSubtab = 'methods' | 'wallets' | 'deadlines' | 'tolerances';

interface PaymentSettingsHubProps {
  readonly subtab?: PaymentSettingsSubtab;
  readonly onSubtabChange: (subtab: PaymentSettingsSubtab) => void;
}

export function PaymentSettingsHub({
  subtab = 'methods',
  onSubtabChange,
}: PaymentSettingsHubProps) {
  const viewPayments = usePaymentPermission('payments.view');
  const viewWallets = usePaymentPermission('payments.destinations.view');
  const manageCash = usePaymentPermission('payments.cash_policies.manage');
  const approveCash = usePaymentPermission('payments.cash_policies.approve');

  const availableSubtabs = useMemo(() => {
    const list: {
      id: PaymentSettingsSubtab;
      label: string;
      icon: typeof CreditCard;
      desc: string;
      help: string;
    }[] = [];

    if (viewPayments || viewWallets) {
      list.push({
        id: 'methods',
        label: 'Checkout Methods',
        icon: CreditCard,
        desc: 'Customer-facing payment options shown during online checkout',
        help: 'Enable or disable payment options like COD or manual bKash/Nagad and configure delivery area availability.',
      });
    }

    if (viewWallets) {
      list.push({
        id: 'wallets',
        label: 'Receiving Wallets',
        icon: Landmark,
        desc: 'Company phone numbers and merchant accounts receiving customer transfers',
        help: 'Manage the official numbers shown to customers when paying via bKash or Nagad. Requires dual-custody maker-checker approval.',
      });
      list.push({
        id: 'deadlines',
        label: 'Payment Deadlines',
        icon: Clock,
        desc: 'Customer time-to-pay limits and staff review SLA windows',
        help: 'Set how long customers have to complete manual payment before the order cancels, and your internal staff review target.',
      });
    }

    if (manageCash || approveCash) {
      list.push({
        id: 'tolerances',
        label: 'Cash Difference Rules',
        icon: Coins,
        desc: 'Allowed shortfall tolerances and supervisor limits for COD collections',
        help: 'Define how small courier collection discrepancies are handled and which roles can authorize cash adjustments.',
      });
    }

    return list;
  }, [viewPayments, viewWallets, manageCash, approveCash]);

  const activeSubtab = availableSubtabs.some((s) => s.id === subtab)
    ? subtab
    : (availableSubtabs[0]?.id ?? 'methods');

  if (availableSubtabs.length === 0) {
    return (
      <PaymentNotice>
        You do not have permission to view or manage payment methods, receiving accounts, or policies.
      </PaymentNotice>
    );
  }

  const currentInfo = availableSubtabs.find((s) => s.id === activeSubtab);

  return (
    <div className="space-y-6">
      {/* Subtab Navigation */}
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={activeSubtab}
          onValueChange={(val) => onSubtabChange(val as PaymentSettingsSubtab)}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto md:grid-cols-4">
            {availableSubtabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium sm:text-sm"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <p className="hidden text-xs text-muted-foreground lg:block">
          {currentInfo?.desc}
        </p>
      </div>

      {/* Contextual Explanatory Banner */}
      {currentInfo && (
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">{currentInfo.help}</p>
        </div>
      )}

      {/* Subtab Panels */}
      {activeSubtab === 'methods' && (viewPayments || viewWallets) && (
        <CheckoutMethodsPanel
          onOpenWallets={viewWallets ? () => onSubtabChange('wallets') : undefined}
        />
      )}

      {activeSubtab === 'wallets' && viewWallets && <DestinationPanel />}

      {activeSubtab === 'deadlines' && viewWallets && <PolicyPanel />}

      {activeSubtab === 'tolerances' && (manageCash || approveCash) && <CashPolicyPanel />}
    </div>
  );
}
