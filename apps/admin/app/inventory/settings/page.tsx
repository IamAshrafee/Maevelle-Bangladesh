import type { Metadata } from 'next';
import { InventorySettingsConsole } from '@/components/inventory/inventory-settings-console';

export const metadata: Metadata = {
  title: 'Inventory Settings · Maevelle Admin',
  description: 'Manage inventory low stock alert thresholds and reorder triggers.',
};

export default function InventorySettingsPage() {
  return <InventorySettingsConsole />;
}
