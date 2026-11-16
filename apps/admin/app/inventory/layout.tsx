import type { ReactNode } from 'react';
import { ModuleLayout } from '@/components/ui/module-nav';

export default function InventoryLayout({ children }: { readonly children: ReactNode }) {
  return (
    <ModuleLayout
      moduleId="inventory"
      widthVariant="wide"
      ariaLabel="Inventory workspace navigation"
    >
      {children}
    </ModuleLayout>
  );
}
