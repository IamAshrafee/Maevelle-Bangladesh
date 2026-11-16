import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckoutControlPanel } from '@/components/settings/checkout-control-panel';
import { SettingsNav } from '@/components/settings/settings-nav';
import { Button } from '@/components/ui/button';
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
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" render={<Link href="/orders/delivery-pricing" />}>
              Delivery rates
            </Button>
            <Button variant="outline" render={<Link href="/payments?tab=methods" />}>
              Payment setup
            </Button>
          </div>
        }
      />
      <CheckoutControlPanel />
    </AdminPage>
  );
}
