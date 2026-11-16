import type { ReactNode } from 'react';
import { ModuleLayout } from '@/components/ui/module-nav';

export default function InboundShipmentsLayout({ children }: { readonly children: ReactNode }) {
  return (
    <ModuleLayout moduleId="supply" widthVariant="wide" ariaLabel="Supply workspace navigation">
      {children}
    </ModuleLayout>
  );
}
