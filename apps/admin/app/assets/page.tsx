import { Suspense } from 'react';
import { AssetConsole } from '@/components/assets/asset-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function AssetsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <AssetConsole />
    </Suspense>
  );
}
