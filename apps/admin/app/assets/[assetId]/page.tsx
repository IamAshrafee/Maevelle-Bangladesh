import { Suspense } from 'react';
import { AssetDetail } from '@/components/assets/asset-detail';
import { PageSkeleton } from '@/components/ui/page-shell';

export default async function AssetDetailPage({
  params,
}: {
  readonly params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return (
    <Suspense fallback={<PageSkeleton variant="detail" widthVariant="standard" />}>
      <AssetDetail assetId={assetId} />
    </Suspense>
  );
}
