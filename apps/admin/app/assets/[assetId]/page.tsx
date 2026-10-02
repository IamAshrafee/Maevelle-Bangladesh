import { Suspense } from 'react';
import { AssetDetail } from '@/components/assets/asset-detail';
import { Skeleton } from '@/components/ui/skeleton';

export default async function AssetDetailPage({
  params,
}: {
  readonly params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return (
    <Suspense
      fallback={
        <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </main>
      }
    >
      <AssetDetail assetId={assetId} />
    </Suspense>
  );
}
