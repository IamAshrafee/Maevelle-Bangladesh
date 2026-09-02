import { CreateCustomerForm } from '@/components/customers/create-customer-form';

export const metadata = {
  title: 'Create Customer | Maevelle',
};

export default function CreateCustomerPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">Create Customer</h1>
        <CreateCustomerForm />
      </div>
    </main>
  );
}
