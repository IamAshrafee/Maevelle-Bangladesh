import { StocktakeDetail } from '@/components/inventory/stocktake-detail';

export default async function StocktakeDetailPage({ params }: { params: Promise<{ stocktakeId: string }> }) {
  const { stocktakeId } = await params;
  return <StocktakeDetail stocktakeId={stocktakeId} />;
}
