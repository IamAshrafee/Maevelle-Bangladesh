import { MinusIcon, PlusIcon, ShoppingBagIcon } from '@/components/ui/icons';
import { formatTaka } from './pdp-money';

export interface PdpStickyBarProps {
  readonly price: string | null;
  readonly currency?: string;
  readonly quantity: number;
  readonly onQuantityChange: (delta: number) => void;
  readonly onAddToCart: () => void;
  readonly onBuyNow?: () => void;
  readonly busy: boolean;
  readonly available: boolean;
  readonly cartMessage?: string;
  readonly unselectedAxesCount: number;
  readonly unselectedAxisName?: string;
}

export function PdpStickyBar({
  price,
  currency = 'BDT',
  quantity,
  onQuantityChange,
  onAddToCart,
  onBuyNow,
  busy,
  available,
  cartMessage,
  unselectedAxesCount,
  unselectedAxisName,
}: PdpStickyBarProps) {
  const liveTotal = price ? Number(price) * quantity : null;
  const canAdd = available && unselectedAxesCount === 0 && !!price && !busy;

  const buttonLabel = busy
    ? 'Adding…'
    : cartMessage?.includes('Added')
      ? 'Added to Bag ✓'
      : unselectedAxesCount > 0
        ? `Select ${unselectedAxisName ?? 'Option'}`
        : !available
          ? 'Out of Stock'
          : 'Add to Bag';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-[#efe8e6] px-3.5 py-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex items-center justify-between gap-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
      {/* Quantity stepper */}
      <div className="flex items-center bg-[#f4ece8] rounded-full px-2 py-1 gap-1.5 shrink-0">
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={() => onQuantityChange(-1)}
          disabled={quantity <= 1}
          className="w-8 h-8 flex items-center justify-center text-on-surface active:scale-90 transition-transform duration-150 border-0 bg-transparent disabled:opacity-40 min-h-0 cursor-pointer"
        >
          <MinusIcon size={16} />
        </button>
        <span className="w-5 text-center text-[13px] font-semibold text-on-surface tabular-nums font-mono">
          {quantity}
        </span>
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={() => onQuantityChange(1)}
          disabled={quantity >= 10}
          className="w-8 h-8 flex items-center justify-center text-on-surface active:scale-90 transition-transform duration-150 border-0 bg-transparent disabled:opacity-40 min-h-0 cursor-pointer"
        >
          <PlusIcon size={16} />
        </button>
      </div>

      {onBuyNow ? (
        /* Dual actions on mobile sticky bar */
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            type="button"
            id="pdp-sticky-add-to-bag"
            disabled={!canAdd}
            onClick={onAddToCart}
            className={[
              'flex-1 h-11 rounded-full flex items-center justify-center px-2.5 shadow-xs',
              'transition-[background-color,transform] duration-150 active:scale-[0.98]',
              canAdd
                ? 'bg-[#9e2a4b] hover:bg-[#8b2340] text-white cursor-pointer'
                : 'bg-[#9e2a4b]/60 text-white/80 cursor-not-allowed',
              'border-0 text-[12.5px] sm:text-[13px] font-semibold truncate',
            ].join(' ')}
          >
            <span>{buttonLabel}</span>
          </button>

          <button
            type="button"
            id="pdp-sticky-buy-now"
            disabled={!canAdd}
            onClick={onBuyNow}
            className={[
              'flex-1 h-11 rounded-full flex items-center justify-center px-2.5 shadow-xs',
              'transition-[background-color,transform] duration-150 active:scale-[0.98]',
              canAdd
                ? 'bg-[#1e1b19] hover:bg-[#332e2c] text-white cursor-pointer'
                : 'bg-[#1e1b19]/60 text-white/80 cursor-not-allowed',
              'border-0 text-[12.5px] sm:text-[13px] font-semibold truncate',
            ].join(' ')}
          >
            <span>Buy Now</span>
          </button>
        </div>
      ) : (
        /* Single full CTA */
        <button
          type="button"
          id="pdp-add-to-bag"
          disabled={!canAdd}
          onClick={onAddToCart}
          className={[
            'flex-1 h-12 rounded-full flex items-center justify-between px-5 shadow-md',
            'transition-[background-color,transform] duration-150 active:scale-[0.98]',
            canAdd
              ? 'bg-primary hover:bg-[#8B2340] text-on-primary cursor-pointer'
              : 'bg-primary/60 text-on-primary/80 cursor-not-allowed',
            'border-0',
          ].join(' ')}
        >
          <div className="flex items-center gap-2">
            <ShoppingBagIcon size={20} />
            <span className="text-[13px] font-semibold">{buttonLabel}</span>
          </div>
          {liveTotal !== null && canAdd && (
            <span className="text-[15px] font-bold tabular-nums font-mono">
              {formatTaka(liveTotal, currency)}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
