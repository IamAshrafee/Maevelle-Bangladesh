import type { ReactNode } from 'react';
import { ModuleLayout } from '@/components/ui/module-nav';

export default function CustomersModuleLayout({ children }: { readonly children: ReactNode }) {
  return (
    <ModuleLayout moduleId="customers" widthVariant="wide" ariaLabel="Customer CRM navigation">
      {children}
    </ModuleLayout>
  );
}
