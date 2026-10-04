import { Suspense } from 'react';
import { CreateManualOrderDialog } from '@/components/orders/create-manual-order-dialog';
import { Breadcrumb } from '@/components/ui/breadcrumb';

export const metadata = {
  title: 'Create Manual Order | Maevelle',
};

export default function CreateManualOrderPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
      <Breadcrumb
        items={[
          { label: 'Orders', href: '/orders' },
          { label: 'New Manual Order', current: true },
        ]}
        className="text-xs"
      />
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading order workspace...</div>}>
          <CreateManualOrderDialog />
        </Suspense>
      </div>
    </main>
  );
}
