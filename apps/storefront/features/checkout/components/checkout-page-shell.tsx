'use client';

import { cx } from '@/components/ui/classnames';
import { CheckoutDesktopView } from './checkout-desktop-view';
import { CheckoutMobileView } from './checkout-mobile-view';
import { useCheckout } from '../use-checkout';

export interface CheckoutPageShellProps {
  readonly className?: string;
  /** Force view mode: 'auto' (responsive), 'mobile', or 'desktop' */
  readonly mode?: 'auto' | 'mobile' | 'desktop';
}

export function CheckoutPageShell({
  className,
  mode = 'auto',
}: CheckoutPageShellProps) {
  const checkout = useCheckout();

  return (
    <div className={cx('relative min-h-screen w-full bg-surface', className)}>
      {/* Explicit mode or responsive breakpoint */}
      {mode === 'mobile' ? (
        <CheckoutMobileView checkout={checkout} />
      ) : mode === 'desktop' ? (
        <CheckoutDesktopView checkout={checkout} />
      ) : (
        <>
          {/* Mobile & Tablet (< lg) */}
          <div className="block lg:hidden">
            <CheckoutMobileView checkout={checkout} />
          </div>

          {/* Desktop & Larger Screens (lg+) */}
          <div className="hidden lg:block">
            <CheckoutDesktopView checkout={checkout} />
          </div>
        </>
      )}
    </div>
  );
}
