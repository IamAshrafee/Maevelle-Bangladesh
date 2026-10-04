import type { Metadata } from 'next';

import './globals.css';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { cn } from '@/lib/utils';
import { AdminShell } from '@/components/admin-shell';
import { TooltipProvider } from '@/components/ui/tooltip';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Maevelle Admin',
    template: '%s | Maevelle Admin',
  },
  description: 'Maevelle internal administration application.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn('font-sans antialiased', inter.variable, jetbrainsMono.variable)}>
      <body>
        <TooltipProvider>
          <AdminShell>{children}</AdminShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
