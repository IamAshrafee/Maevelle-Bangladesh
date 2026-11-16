import { AdminPage } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminRootLoading() {
  return (
    <AdminPage variant="wide" aria-busy="true" aria-label="Loading workspace">
      <div className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="space-y-4 pt-2">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </AdminPage>
  );
}
