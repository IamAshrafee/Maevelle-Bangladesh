import { AssetDetail } from '@/components/assets/asset-detail';

export default async function AssetDetailPage({
  params,
}: {
  readonly params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return <AssetDetail assetId={assetId} />;
}
