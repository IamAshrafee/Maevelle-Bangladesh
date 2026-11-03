import { QuantityStepper } from '@/components/commerce/quantity-stepper';
import { Button } from '@/components/ui/button';

export interface PdpStickyBarProps {
  readonly quantity: number;
  readonly onQuantityChange: (quantity: number) => void;
  readonly onAddToCart: () => void;
  readonly busy: boolean;
  readonly available: boolean;
  readonly cartMessage?: string;
  readonly unselectedAxesCount: number;
  readonly unselectedAxisName?: string;
}

export function PdpStickyBar({
  quantity,
  onQuantityChange,
  onAddToCart,
  busy,
  available,
  cartMessage,
  unselectedAxesCount,
  unselectedAxisName,
}: PdpStickyBarProps) {
  const label =
    unselectedAxesCount > 0
      ? `Select ${unselectedAxisName || 'an option'}`
      : !available
        ? 'Selection unavailable'
        : cartMessage?.includes('Added')
          ? 'Added to bag'
          : 'Add to bag';

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center gap-2 border-t border-border-subtle bg-surface-container-lowest p-3 pb-safe shadow-md">
      <QuantityStepper value={quantity} onChange={onQuantityChange} size="touch" disabled={busy} />
      <Button
        className="min-w-0 flex-1"
        id="pdp-add-to-bag"
        loading={busy}
        disabled={!available || unselectedAxesCount > 0}
        onClick={onAddToCart}
      >
        {label}
      </Button>
    </div>
  );
}
