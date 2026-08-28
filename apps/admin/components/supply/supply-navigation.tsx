import Link from 'next/link';
import { Box, Building2, CircleDollarSign, ClipboardCheck, PackageCheck, Ship } from 'lucide-react';

const supplyPages = [
  ['/suppliers', 'Suppliers', Building2],
  ['/purchases', 'Purchases', ClipboardCheck],
  ['/inbound-shipments', 'Shipments', Ship],
  ['/receiving', 'Receiving', PackageCheck],
  ['/landed-cost', 'Landed cost', CircleDollarSign],
  ['/costing', 'Costing', Box],
] as const;

export function SupplyNavigation({ activePath }: { activePath: string }) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1"
      aria-label="Supply pages"
    >
      {supplyPages.map(([href, label, Icon]) => (
        <Link
          key={href}
          href={href}
          title={`Open ${label}`}
          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium no-underline ${href === activePath ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
