import type { Metadata } from 'next';

import './globals.css';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';
import { AdminShell } from '@/components/admin-shell';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: {
    default: 'Maevelle Admin',
    template: '%s | Maevelle Admin',
  },
  description: 'Maevelle internal administration application.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn('font-sans', geist.variable)}>
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
