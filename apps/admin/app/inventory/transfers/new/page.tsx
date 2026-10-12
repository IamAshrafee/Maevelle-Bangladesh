import { TransferForm } from './_components/transfer-form';

export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{
    variantId?: string;
    sourceLocationId?: string;
    destinationLocationId?: string;
    quantity?: string;
  }>;
}) {
  const { variantId, sourceLocationId, destinationLocationId, quantity } = await searchParams;
  return (
    <TransferForm
      initialVariantId={variantId}
      initialSourceLocationId={sourceLocationId}
      initialDestinationLocationId={destinationLocationId}
      initialQuantity={quantity}
    />
  );
}
