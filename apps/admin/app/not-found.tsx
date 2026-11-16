import Link from 'next/link';
import { ArrowLeft, Compass, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminPage } from '@/components/ui/page-shell';

export default function AdminNotFound() {
  return (
    <AdminPage className="min-h-[65vh] max-w-2xl items-center justify-center text-center">
      <div className="flex flex-col items-center rounded-xl border border-border bg-card p-8 shadow-2xs w-full">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
          <Compass className="size-6" aria-hidden="true" />
        </div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
          404 · Route not found
        </p>
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
          This admin workspace page does not exist
        </h1>
        <p className="mb-6 max-w-md text-sm leading-relaxed text-muted-foreground">
          The link may have moved or you may not have an active bookmark for this section. Return to
          your dashboard or jump straight to active operations.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="default"
            render={<Link href="/" />}
            nativeButton={false}
            className="gap-2"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Dashboard
          </Button>
          <Button
            variant="outline"
            render={<Link href="/orders" />}
            nativeButton={false}
            className="gap-2"
          >
            <ShoppingBag className="size-4" aria-hidden="true" />
            Open Orders
          </Button>
        </div>
      </div>
    </AdminPage>
  );
}
