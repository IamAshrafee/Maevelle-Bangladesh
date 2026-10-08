import type { Metadata } from 'next';

import { CheckoutPageShell } from '@/features/checkout';

export const metadata: Metadata = {
  title: 'Express Checkout',
  description:
    'Secure 256-bit encrypted checkout with doorstep inspection, instant bKash payment, and fast nationwide delivery across Bangladesh.',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutPageShell />;
}
