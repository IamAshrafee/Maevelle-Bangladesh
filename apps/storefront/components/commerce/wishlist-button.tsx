'use client';

import { cx } from '@/components/ui/classnames';
import { HeartIcon } from '@/components/ui/icons';

export type WishlistButtonProps = {
  active?: boolean;
  className?: string;
  disabled?: boolean;
  onToggle?: (nextActive: boolean) => void;
  productTitle?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'floating' | 'surface' | 'ghost';
};

export function WishlistButton({
  active = false,
  className,
  disabled = false,
  onToggle,
  productTitle = 'item',
  size = 'md',
  variant = 'surface',
}: WishlistButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled && onToggle) {
      onToggle(!active);
    }
  };

  const sizeClasses = {
    xs: 'size-8',
    sm: 'size-9',
    md: 'size-10',
    lg: 'size-12',
  }[size];

  const variantClasses = {
    floating: active
      ? 'bg-surface-container-lowest/90 backdrop-blur-md text-primary shadow-sm hover:bg-surface-container-lowest'
      : 'bg-surface-container-lowest/80 backdrop-blur-md text-on-surface hover:text-primary shadow-sm hover:bg-surface-container-lowest',
    surface: active
      ? 'bg-primary text-white shadow-xs'
      : 'bg-surface-container-low text-on-surface hover:text-primary hover:bg-surface-container',
    ghost: active
      ? 'bg-primary/10 text-primary'
      : 'bg-transparent text-on-surface hover:text-primary',
  }[variant];

  return (
    <button
      aria-label={
        active ? `Remove ${productTitle} from wishlist` : `Add ${productTitle} to wishlist`
      }
      aria-pressed={active}
      className={cx(
        'inline-flex shrink-0 aspect-square touch-manipulation items-center justify-center rounded-full',
        'transition-[background-color,color,transform] duration-150 ease-maevelle active:scale-90',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:opacity-50',
        sizeClasses,
        variantClasses,
        className,
      )}
      disabled={disabled}
      onClick={handleClick}
      type="button"
    >
      <HeartIcon
        className={cx(active && 'scale-110')}
        filled={active}
        size={size === 'xs' ? 16 : size === 'sm' ? 18 : size === 'lg' ? 22 : 20}
      />
    </button>
  );
}
