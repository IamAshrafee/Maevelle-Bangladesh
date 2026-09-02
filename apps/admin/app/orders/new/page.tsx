import { CreateManualOrderDialog } from '@/components/orders/create-manual-order-dialog';

export const metadata = {
  title: 'Create Manual Order | Maevelle',
};

export default function CreateManualOrderPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <CreateManualOrderDialog />
      </div>
    </main>
  );
}
