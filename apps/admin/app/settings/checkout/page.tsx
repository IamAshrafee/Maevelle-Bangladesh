import type { Metadata } from 'next';
import { CheckoutControlPanel } from '@/components/settings/checkout-control-panel';
import { SettingsNav } from '@/components/settings/settings-nav';
import { AdminPage, PageHeader } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Checkout Settings · Maevelle Admin',
};

export default function CheckoutSettingsPage() {
  return (
    <AdminPage className="max-w-4xl">
      <SettingsNav />
      <PageHeader
        title="Checkout"
        description="Control new storefront orders for this organization."
      />
      <CheckoutControlPanel />
    </AdminPage>
  );
}
