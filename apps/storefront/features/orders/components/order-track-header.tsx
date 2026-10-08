'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, SupportAgentIcon, PersonIcon } from '@/components/ui/icons';

export interface OrderTrackHeaderProps {
  readonly onOpenSupport?: () => void;
}

export function OrderTrackHeader({ onOpenSupport }: OrderTrackHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <header className="sticky top-0 w-full z-40 bg-surface/90 backdrop-blur-xl border-b border-border-subtle/80 shadow-[0_1px_8px_rgba(0,0,0,0.03)] transition-colors lg:hidden">
      <div className="h-16 max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-3">
        {/* Back Button & Brand Monogram */}
        <div className="flex items-center gap-1.5">
          <button
            aria-label="Go back"
            className="min-w-[42px] min-h-[42px] flex items-center justify-center -ml-2 rounded-full text-on-surface hover:text-primary active:scale-95 transition-transform cursor-pointer"
            onClick={handleBack}
            type="button"
          >
            <ArrowLeftIcon size={20} />
          </button>
          <Link
            aria-label="Maevelle Home"
            className="hidden xs:flex items-center gap-1.5 text-primary hover:opacity-85 transition-opacity"
            href="/"
          >
            <span className="font-serif text-lg font-bold tracking-tight">MAEVELLE</span>
            <span className="font-sans text-[9px] uppercase tracking-widest text-on-surface-variant font-medium pt-0.5">
              Atelier
            </span>
          </Link>
        </div>

        {/* Title */}
        <div className="flex-1 text-center truncate px-2">
          <h1 className="font-sans text-base sm:text-lg font-semibold text-on-surface tracking-tight truncate">
            Track Your Order
          </h1>
        </div>

        {/* Actions: Support & Client Avatar */}
        <div className="flex items-center justify-end gap-1.5">
          <a
            aria-label="Concierge and Support"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary active:scale-95 transition-transform"
            href="https://wa.me/8801894623835"
            onClick={onOpenSupport}
            rel="noopener noreferrer"
            target="_blank"
          >
            <SupportAgentIcon size={20} />
          </a>
          <Link
            aria-label="Return to Store"
            className="size-8 rounded-full bg-primary flex items-center justify-center shrink-0 text-on-primary hover:bg-primary-hover active:scale-95 transition-transform"
            href="/"
          >
            <PersonIcon size={16} />
          </Link>
        </div>
      </div>
    </header>
  );
}
