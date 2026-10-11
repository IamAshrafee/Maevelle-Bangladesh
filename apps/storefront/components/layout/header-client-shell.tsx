'use client';

import { useState } from 'react';

import type { StorefrontCategoryDto } from '@maevelle/contracts';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import { CartDrawer } from '@/components/commerce/cart-drawer';
import { DesktopNavbar } from '@/components/layout/desktop-navbar';
import { MobileNavbar } from '@/components/layout/mobile-navbar';

export type HeaderClientShellProps = {
  announcement?: string | null | undefined;
  categories?: readonly StorefrontCategoryDto[] | undefined;
  storeName?: string | undefined;
};

export function HeaderClientShell({
  announcement,
  categories,
  storeName = 'Maevelle',
}: HeaderClientShellProps) {
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <>
      <div className="lg:hidden">
        <AnnouncementBar announcement={announcement} />
        <MobileNavbar
          onOpenCart={() => setIsCartOpen(true)}
          storeName={storeName}
        />
      </div>
      <DesktopNavbar
        announcement={announcement}
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
