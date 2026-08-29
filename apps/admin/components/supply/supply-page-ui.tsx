'use client';

import {
  Building2,
  CalendarClock,
  Check,
  CircleAlert,
  ClipboardCheck,
  Edit3,
  PackageCheck,
  PackageOpen,
  Truck,
} from 'lucide-react';

import type { SupplyOverviewDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Stats, StatsCard, StatsTitle, StatsValue, StatsDescription } from '@/components/ui/stats';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SupplyScreen } from '@/lib/supply/types';

export const PAGE_SIZE = 10;
export const screenCopy = {
  suppliers: [
    'Suppliers',
    'Keep sourcing contacts, terms, currency, and lead time in one dependable place.',
    'Add supplier',
  ],
  purchases: [
    'Purchases',
    'Prepare supplier orders, add product lines, and place them when the details are ready.',
    'Create purchase',
  ],
  shipments: [
    'Inbound shipments',
    'Group placed purchase lines into the real shipments that carry them to a warehouse.',
    'Plan shipment',
  ],
  receiving: [
    'Receiving',
    'Count what actually arrived and post each condition to inventory exactly once.',
    'Receive goods',
  ],
} as const;
export function StatCards({
  overview,
  screen,
}: {
  overview: SupplyOverviewDto | undefined;
  screen: SupplyScreen;
}) {
  const cards: readonly [string, number, string, typeof Building2][] =
    screen === 'suppliers'
      ? [
          [
            'Active suppliers',
            overview?.activeSuppliers ?? 0,
            'Ready for new purchases',
            Building2,
          ],
          ['Draft purchases', overview?.draftPurchases ?? 0, 'Still being prepared', Edit3],
          ['Open purchases', overview?.openPurchases ?? 0, 'Placed with suppliers', ClipboardCheck],
          [
            'Needs receiving',
            overview?.awaitingReceiptShipments ?? 0,
            'Arrived but not fully counted',
            PackageCheck,
          ],
        ]
      : screen === 'purchases'
        ? [
            ['Draft', overview?.draftPurchases ?? 0, 'Can still be edited', Edit3],
            ['Placed', overview?.openPurchases ?? 0, 'Supplier orders in progress', Check],
            [
              'Planned shipments',
              overview?.plannedShipments ?? 0,
              'Waiting to depart',
              PackageOpen,
            ],
            ['In transit', overview?.inTransitShipments ?? 0, 'Currently moving', Truck],
          ]
        : screen === 'shipments'
          ? [
              [
                'Planned',
                overview?.plannedShipments ?? 0,
                'Ready to record departure',
                PackageOpen,
              ],
              ['In transit', overview?.inTransitShipments ?? 0, 'On the way', Truck],
              ['Overdue', overview?.overdueShipments ?? 0, 'Past expected arrival', CalendarClock],
              [
                'Awaiting count',
                overview?.awaitingReceiptShipments ?? 0,
                'Arrived at a warehouse',
                PackageCheck,
              ],
            ]
          : [
              [
                'Ready to receive',
                overview?.awaitingReceiptShipments ?? 0,
                'Arrived and still open',
                PackageCheck,
              ],
              ['Posted today', overview?.receiptsToday ?? 0, 'Inventory receipts today', Check],
              ['In transit', overview?.inTransitShipments ?? 0, 'Expected later', Truck],
              ['Overdue', overview?.overdueShipments ?? 0, 'Needs an update', CircleAlert],
            ];
  return (
    <Stats aria-label="Supply snapshot">
      {cards.map(([label, value, detail, Icon]) => (
        <StatsCard key={label} className="flex items-start justify-between gap-3">
          <div>
            <StatsTitle>{label}</StatsTitle>
            <StatsValue>{value}</StatsValue>
            <StatsDescription>{detail}</StatsDescription>
          </div>
          <span className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
            <Icon className="size-4" />
          </span>
        </StatsCard>
      ))}
    </Stats>
  );
}

export function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
      <span>
        Page {page} of {pages} · {total} records
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          title="Previous page"
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          title="Next page"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function HowToDialog({
  screen,
  open,
  onOpenChange,
}: {
  screen: SupplyScreen;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const guide = {
    suppliers: [
      'Add the supplier’s main details and buying terms.',
      'Use Inactive to stop new use without losing history.',
      'Start a purchase from the supplier row to save time.',
    ],
    purchases: [
      'Create a draft and choose the supplier.',
      'Add every SKU, quantity, and supplier unit cost.',
      'Place it after checking the total; placed lines can enter shipments.',
    ],
    shipments: [
      'Choose a receiving warehouse.',
      'Add open lines from one or several suppliers.',
      'Record departure, then arrival. Arrival never increases stock.',
    ],
    receiving: [
      'Open an arrived shipment.',
      'Record each quantity by its real condition.',
      'Post once after checking; this creates permanent inventory evidence.',
    ],
  }[screen];
  const example = {
    suppliers:
      'A Guangzhou factory normally uses CNY and takes 18 days. Save those facts once so every buyer sees them.',
    purchases:
      'Order 20 red dresses and 15 black dresses. Keep it draft while checking costs; place it when the supplier order is real.',
    shipments:
      'One sea shipment can carry dresses from Supplier A and bags from Supplier B. Add both lines to one real shipment.',
    receiving:
      '20 units arrive: 18 sellable and 2 damaged. Add both condition rows, then post one receipt.',
  }[screen];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>How {screenCopy[screen][0].toLowerCase()} works</DialogTitle>
          <DialogDescription>Simple steps and a real example.</DialogDescription>
        </DialogHeader>
        <ol className="grid gap-3">
          {guide.map((step, index) => (
            <li className="flex gap-3" key={step}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="rounded-lg bg-muted p-4">
          <strong className="text-sm">Real example</strong>
          <p className="mt-1 text-sm text-muted-foreground">{example}</p>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
