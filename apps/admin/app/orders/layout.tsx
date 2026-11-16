import type { ReactNode } from 'react';
import { ModuleLayout } from '@/components/ui/module-nav';

export default function OrdersModuleLayout({ children }: { readonly children: ReactNode }) {
  return (
    <ModuleLayout moduleId="orders" widthVariant="wide" ariaLabel="Orders workspace navigation">
      {children}
    </ModuleLayout>
  );
}
