import { BottomNav } from '@/components/layout/bottom-nav';
import { DesktopFooter } from '@/components/layout/desktop-footer';
import { MobileFooter } from '@/components/layout/mobile-footer';

export type StorefrontFooterProps = {
  storeName?: string | undefined;
};

export function StorefrontFooter({ storeName = 'Maevelle' }: StorefrontFooterProps) {
  return (
    <>
      <MobileFooter storeName={storeName} />
      <DesktopFooter storeName={storeName} />
      <BottomNav />
    </>
  );
}

