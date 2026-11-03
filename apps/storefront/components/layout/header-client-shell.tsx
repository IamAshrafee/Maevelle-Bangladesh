'use client';

import type { StorefrontCategoryDto } from '@maevelle/contracts';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
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
  return (
    <>
      <div className="lg:hidden">
        <AnnouncementBar announcement={announcement} />
        <MobileNavbar storeName={storeName} />
      </div>
      <DesktopNavbar announcement={announcement} categories={categories} storeName={storeName} />
    </>
  );
}
