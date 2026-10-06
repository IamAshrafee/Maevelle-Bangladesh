import { cx } from '@/components/ui/classnames';
import { BanknoteIcon, BoltIcon, ShieldCheckIcon, TruckIcon } from '@/components/ui/icons';

export type TrustBadgesProps = {
  className?: string;
};

export function TrustBadges({ className }: TrustBadgesProps) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-border/40 bg-surface-container-low/60 p-4',
        className,
      )}
    >
      {/* Title */}
      <div className="mb-3 flex items-center gap-2 text-on-surface">
        <TruckIcon className="text-primary" size={20} />
        <h3 className="font-headline-sm text-body-md font-semibold text-on-surface">
          Maevelle White Glove Dispatch
        </h3>
      </div>

      {/* Grid of 3 Cards */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {/* Card 1 */}
        <div className="flex items-center gap-3 rounded-xl bg-surface-container-lowest p-3 shadow-xs sm:flex-col sm:text-center">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
            <BoltIcon size={16} />
          </div>
          <div>
            <span className="block font-headline-sm text-[13px] font-bold text-on-surface">
              Dhaka Express
            </span>
            <span className="block text-body-sm text-[11px] text-on-surface-variant">
              24–48 Hours
            </span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="flex items-center gap-3 rounded-xl bg-surface-container-lowest p-3 shadow-xs sm:flex-col sm:text-center">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
            <BanknoteIcon size={16} />
          </div>
          <div>
            <span className="block font-headline-sm text-[13px] font-bold text-on-surface">
              Cash On Delivery
            </span>
            <span className="block text-body-sm text-[11px] text-on-surface-variant">
              Nationwide
            </span>
          </div>
        </div>

        {/* Card 3 */}
        <div className="flex items-center gap-3 rounded-xl bg-surface-container-lowest p-3 shadow-xs sm:flex-col sm:text-center">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
            <ShieldCheckIcon size={16} />
          </div>
          <div>
            <span className="block font-headline-sm text-[13px] font-bold text-on-surface">
              Hand Inspected
            </span>
            <span className="block text-body-sm text-[11px] text-on-surface-variant">
              Quality Seal
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
