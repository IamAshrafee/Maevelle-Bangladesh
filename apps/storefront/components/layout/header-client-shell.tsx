'use client';

import { useState } from 'react';

import type { StorefrontCategoryDto } from '@maevelle/contracts';
import { CartDrawer } from '@/components/commerce/cart-drawer';
import { DesktopNavbar } from '@/components/layout/desktop-navbar';
import { MobileNavbar } from '@/components/layout/mobile-navbar';

export type HeaderClientShellProps = {
  categories?: readonly StorefrontCategoryDto[] | undefined;
  storeName?: string | undefined;
};

export function HeaderClientShell({
  categories,
  storeName = 'Maevelle',
}: HeaderClientShellProps) {
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <>
      <MobileNavbar
        onOpenCart={() => setIsCartOpen(true)}
        storeName={storeName}
      />
      <DesktopNavbar
        categories={categories}
        onOpenCart={() => setIsCartOpen(true)}
        storeName={storeName}
      />
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
      />
    </>
  );
}
