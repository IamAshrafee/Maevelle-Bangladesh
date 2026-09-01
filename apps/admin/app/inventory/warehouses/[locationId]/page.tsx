import { LocationDetail } from '@/components/inventory/location-detail';

export default async function LocationDetailPage({ params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  return <LocationDetail locationId={locationId} />;
}
