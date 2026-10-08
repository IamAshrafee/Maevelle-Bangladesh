'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { cx } from '@/components/ui/classnames';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, SparklesIcon } from '@/components/ui/icons';

export type AnnouncementBarProps = {
  announcement?: string | null | undefined;
  className?: string | undefined;
  dismissible?: boolean | undefined;
};

const DEFAULT_MESSAGES = [
  'Complimentary White Glove Delivery across Dhaka on orders over ৳3,000',
  'Dhaka 24-Hour Express Dispatch • Guaranteed fast courier',
  'Cash on Delivery & Instant bKash / Nagad Accepted with zero surcharges',
];

export function AnnouncementBar({
  announcement,
  className,
  dismissible = true,
}: AnnouncementBarProps) {
  const pathname = usePathname();
  const [isDismissing, setIsDismissing] = useState(false);

  const isCheckout = pathname?.startsWith('/checkout');
  const [isDismissed, setIsDismissed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const messages = announcement ? [announcement, ...DEFAULT_MESSAGES] : DEFAULT_MESSAGES;

  // Auto-rotate messages every 4.8 seconds when not paused
  useEffect(() => {
    if (messages.length <= 1 || isPaused || isDismissed) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % messages.length);
    }, 4800);

    return () => clearInterval(timer);
  }, [messages.length, isPaused, isDismissed]);

  const handleDismiss = () => {
    setIsDismissing(true);
    setTimeout(() => {
      setIsDismissed(true);
    }, 240);
  };

  if (isDismissed) return null;

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % messages.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + messages.length) % messages.length);
  };

  return (
    <aside
      aria-label="Store announcement"
      className={cx(
        'relative z-50 flex w-full items-center justify-center bg-primary px-3 sm:px-6 text-center font-label-sm text-[11px] sm:text-xs font-medium tracking-wide text-white select-none overflow-hidden transition-[max-height,opacity,padding] duration-250 ease-out',
        isDismissing
          ? 'max-h-0 opacity-0 py-0'
          : 'max-h-12 opacity-100 min-h-[34px] sm:min-h-[36px] py-1.5',
        isCheckout && 'hidden lg:flex',
        className,
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchEnd={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
    >
      <div className="flex items-center justify-center gap-2 overflow-hidden max-w-2xl px-7 sm:px-10">
        <SparklesIcon className="shrink-0 text-white/90" size={13} />
        <span
          className="truncate inline-block animate-in fade-in slide-in-from-bottom-0.5 duration-300 motion-reduce:animate-none"
          key={currentIndex}
        >
          {messages[currentIndex]}
        </span>
      </div>

      {/* Rotating Arrow Controls (when more than 1 message) */}
      {messages.length > 1 && (
        <div className="hidden md:flex items-center gap-0.5 ml-2 text-white/70">
          <button
            aria-label="Previous announcement"
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-white/15 hover:text-white active:scale-90 transition-[background-color,transform] duration-150 cursor-pointer"
            onClick={handlePrev}
            type="button"
          >
            <ArrowUpIcon className="-rotate-90" size={11} />
          </button>
          <span className="text-[10px] font-mono opacity-70 tabular-nums">
            {currentIndex + 1}/{messages.length}
          </span>
          <button
            aria-label="Next announcement"
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-white/15 hover:text-white active:scale-90 transition-[background-color,transform] duration-150 cursor-pointer"
            onClick={handleNext}
            type="button"
          >
            <ArrowDownIcon className="-rotate-90" size={11} />
          </button>
        </div>
      )}

      {/* Dismiss Button with Silky Smooth Collapse */}
      {dismissible && (
        <button
          aria-label="Dismiss announcement"
          className="absolute right-2 sm:right-3 flex h-6 w-6 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white active:scale-90 transition-[background-color,transform] duration-150 cursor-pointer"
          onClick={handleDismiss}
          type="button"
        >
          <CloseIcon size={13} />
        </button>
      )}
    </aside>
  );
}
