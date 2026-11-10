import type { Metadata } from 'next';

import './globals.css';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { cn } from '@/lib/utils';
import { AdminShell } from '@/components/admin-shell';
import { TooltipProvider } from '@/components/ui/tooltip';
import { requireAdminAccess } from '@/lib/auth/server-access';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await requireAdminAccess();
  return (
    <html
      lang="en"
      className={cn('font-sans antialiased', inter.variable, jetbrainsMono.variable)}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <TooltipProvider>
          <AdminShell {...(context ? { initialContext: context } : {})}>{children}</AdminShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
