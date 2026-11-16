import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ModuleLayout } from '@/components/ui/module-nav';

export const metadata: Metadata = {
  title: 'Sizing & Fit Operations',
  description:
    'Manage measurement guides, canonical sizing standards, and product variant options.',
};

export default function SizingLayout({ children }: { readonly children: ReactNode }) {
  return (
    <ModuleLayout
      moduleId="sizing"
      widthVariant="wide"
      ariaLabel="Sizing & Fit workspace navigation"
    >
      {children}
    </ModuleLayout>
  );
}
