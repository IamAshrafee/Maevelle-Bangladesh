import type { ReactNode } from 'react';
import { ModuleLayout } from '@/components/ui/module-nav';

export default function FinanceLayout({ children }: { readonly children: ReactNode }) {
  return (
    <ModuleLayout moduleId="finance" widthVariant="wide" ariaLabel="Finance & ledger navigation">
      {children}
    </ModuleLayout>
  );
}
