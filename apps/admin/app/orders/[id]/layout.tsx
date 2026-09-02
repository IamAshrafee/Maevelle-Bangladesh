import type { ReactNode } from 'react';

export default function OrderDetailLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12">
      {children}
    </div>
  );
}
