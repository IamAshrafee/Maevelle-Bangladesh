import type { ReactNode } from 'react';

import { InventoryWorkspaceNav } from '@/components/inventory/inventory-workspace-nav';

export default function InventoryLayout({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <InventoryWorkspaceNav />
      {children}
    </>
  );
}
