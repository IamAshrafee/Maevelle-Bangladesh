import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Maevelle Admin',
    template: '%s | Maevelle Admin',
  },
  description: 'Maevelle internal administration application.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
