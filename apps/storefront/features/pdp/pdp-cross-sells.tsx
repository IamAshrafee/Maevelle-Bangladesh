import Link from 'next/link';
import { ArrowRightIcon } from '@/components/ui/icons';

interface CrossSellProduct {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly price: string;
  readonly currency: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly badge?: string;
}

export interface PdpCrossSellsProps {
  readonly products: readonly CrossSellProduct[];
}

export function PdpCrossSells({ products }: PdpCrossSellsProps) {
  if (products.length === 0) return null;

  return (
    <section className="pt-5 flex flex-col gap-3">
      <div className="px-4 flex items-center justify-between">
        <h2 className="text-[18px] font-semibold text-[#1e1b19]">Pairs Elegantly With</h2>
        <span className="text-[11px] font-semibold text-[#8a7174]">Curated Ensemble</span>
      </div>
      <div className="flex items-stretch gap-3 px-4 overflow-x-auto no-scrollbar pb-2">
        {products.map((p) => (
          <div
            key={p.id}
            className="shrink-0 w-44 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col"
          >
            <Link href={`/products/${p.handle}`} className="block">
              <div className="w-full aspect-square bg-[#eee7e3] relative overflow-hidden">
                <img
                  src={p.imageUrl}
                  alt={p.imageAlt}
                  className="w-full h-full object-cover"
                />
                {p.badge && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/90 text-[11px] font-semibold text-[#9e2a4b]">
                    {p.badge}
                  </span>
                )}
              </div>
            </Link>
            <div className="p-3 flex flex-col gap-1 flex-1">
              <h3 className="text-[13px] font-semibold text-[#1e1b19] truncate">{p.title}</h3>
              <span className="text-[15px] font-bold text-[#1e1b19] tabular-nums">
                {new Intl.NumberFormat('en-BD', {
                  style: 'currency',
                  currency: p.currency,
                  maximumFractionDigits: 0,
                }).format(Number(p.price))}
              </span>
              <Link
                href={`/products/${p.handle}`}
                className="mt-1 w-full py-1.5 rounded-lg bg-[#faf2ee] hover:bg-[#eee7e3] text-[#9e2a4b] text-[11px] font-semibold text-center transition-colors duration-150 flex items-center justify-center gap-1 no-underline"
              >
                <span>View</span>
                <ArrowRightIcon size={12} />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
