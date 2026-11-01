import type { Metadata } from 'next';
import { ShopperAccount } from '@/features/account/shopper-account';

export const metadata: Metadata = {
  title: 'Your account',
  description: 'Manage your Maevelle sign-in and account access.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function AccountPage() {
  return <ShopperAccount />;
}
