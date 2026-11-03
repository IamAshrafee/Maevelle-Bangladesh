'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { StorefrontCategoryDto } from '@maevelle/contracts';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import { DesktopNavbar } from '@/components/layout/desktop-navbar';
import { MobileNavbar } from '@/components/layout/mobile-navbar';

const CartDrawer = dynamic(() =>
  import('@/components/commerce/cart-drawer').then((module) => module.CartDrawer),
);

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
  const [bagOpen, setBagOpen] = useState(false);
  const openBag = () => setBagOpen(true);
  return (
    <>
      <div className="lg:hidden">
        <AnnouncementBar announcement={announcement} />
        <MobileNavbar storeName={storeName} onOpenCart={openBag} />
      </div>
      <DesktopNavbar
        announcement={announcement}
        categories={categories}
        storeName={storeName}
        onOpenCart={openBag}
      />
      {bagOpen && <CartDrawer isOpen onClose={() => setBagOpen(false)} />}
    </>
  );
}
