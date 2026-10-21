import type { Metadata } from 'next';

import { ReplenishmentWorkspace } from '@/components/inventory/replenishment-workspace';

export const metadata: Metadata = {
  title: 'Inventory Replenishment · Maevelle Admin',
  description: 'Review projected inventory risk and manage replenishment policies.',
};

export default function ReplenishmentPage() {
  return <ReplenishmentWorkspace />;
}
