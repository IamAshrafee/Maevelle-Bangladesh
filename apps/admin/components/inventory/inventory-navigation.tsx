import Link from 'next/link';

export function InventoryNavigation() {
  return (
    <nav className="flex flex-wrap gap-2">
      <Link className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent" href="/">
        Catalog
      </Link>
      <Link
        className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent"
        href="/inventory/stock"
      >
        Stock
      </Link>
      <Link
        className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent"
        href="/inventory/warehouses"
      >
        Locations
      </Link>
      <Link
        className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent"
        href="/inventory/transfers"
      >
        Transfers
      </Link>
      <Link
        className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent"
        href="/inventory/stocktakes"
      >
        Stocktakes
      </Link>
      <Link
        className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent"
        href="/inventory/history"
      >
        History
      </Link>
      <Link
        className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent"
        href="/inventory/adjustments"
      >
        Adjustments
      </Link>
      <Link
        className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent"
        href="/inventory/reservations"
      >
        Reservations
      </Link>
    </nav>
  );
}
