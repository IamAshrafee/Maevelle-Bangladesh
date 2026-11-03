import { TruckIcon } from '@/components/ui/icons';

export function PdpTrustGrid() {
  return (
    <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-container-low p-3 text-sm text-on-surface-variant lg:mx-0 lg:mt-0">
      <TruckIcon className="shrink-0 text-primary" size={18} />
      <p>Delivery availability and charges have yet to be checked for this selection.</p>
    </div>
  );
}
