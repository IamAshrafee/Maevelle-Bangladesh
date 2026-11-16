import { Suspense } from 'react';
import { ManualOrderForm } from '@/components/orders/manual-order-form';
import { PageHeader, PagePanel, PageSkeleton } from '@/components/ui/page-shell';
import { FormWorkspace } from '@/components/workspaces/form-workspace';

export const metadata = {
  title: 'Create Manual Order | Maevelle',
};

export default function CreateManualOrderPage() {
  return (
    <FormWorkspace
      widthVariant="narrow"
      header={
        <PageHeader
          breadcrumbs={[
            { label: 'Orders', href: '/orders' },
            { label: 'New Manual Order', current: true },
          ]}
          eyebrow="Orders Workspace"
          title="Create Manual Order"
          description="Capture a phone or social order using the same inventory, payment, and order rules as checkout."
        />
      }
    >
      <PagePanel className="p-6">
        <Suspense fallback={<PageSkeleton variant="form" widthVariant="narrow" />}>
          <ManualOrderForm />
        </Suspense>
      </PagePanel>
    </FormWorkspace>
  );
}
