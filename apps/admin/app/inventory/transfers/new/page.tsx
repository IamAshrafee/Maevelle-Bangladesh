import { TransferForm } from './_components/transfer-form';

export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ variantId?: string; sourceLocationId?: string }>;
}) {
  const { variantId, sourceLocationId } = await searchParams;
  return <TransferForm initialVariantId={variantId} initialSourceLocationId={sourceLocationId} />;
}
