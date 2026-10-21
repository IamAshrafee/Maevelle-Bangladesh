import type { Metadata } from 'next';
import { SizingWorkspaceNav } from '@/components/sizing/sizing-workspace-nav';

export const metadata: Metadata = {
  title: 'Sizing & Fit Operations',
  description: 'Manage measurement guides, canonical sizing standards, and product variant options.',
};

export default function SizingLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SizingWorkspaceNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
