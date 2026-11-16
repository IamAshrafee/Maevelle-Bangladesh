import { CreateCustomerForm } from '@/components/customers/create-customer-form';
import { PageHeader, PagePanel } from '@/components/ui/page-shell';
import { FormWorkspace } from '@/components/workspaces/form-workspace';

export const metadata = {
  title: 'Create Customer | Maevelle',
};

export default function CreateCustomerPage() {
  return (
    <FormWorkspace
      widthVariant="narrow"
      header={
        <PageHeader
          breadcrumbs={[
            { label: 'Customers', href: '/customers' },
            { label: 'New Customer', current: true },
          ]}
          eyebrow="CRM"
          title="Create Customer"
          description="Register a new customer record and assign initial contact details."
        />
      }
    >
      <PagePanel className="p-6">
        <CreateCustomerForm />
      </PagePanel>
    </FormWorkspace>
  );
}
