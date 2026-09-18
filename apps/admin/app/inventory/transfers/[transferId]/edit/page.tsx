import { TransferForm } from '../../new/_components/transfer-form';

export default async function EditTransferPage({
  params,
}: {
  params: Promise<{ transferId: string }>;
}) {
  const { transferId } = await params;
  return <TransferForm transferId={transferId} />;
}
