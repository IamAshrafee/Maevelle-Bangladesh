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
  'Complimentary Express Delivery across Bangladesh on orders over ৳3,000',
  'Fast Delivery · Dhaka Next-Day & Nationwide within 2–3 Days',
  'Cash on Delivery & Instant bKash / Nagad with zero extra fees',
];

export function AnnouncementBar({
  announcement,
  className,
  dismissible = true,
}: AnnouncementBarProps) {
  const pathname = usePathname();

  const isCheckout = pathname?.startsWith('/checkout');
  const [isDismissed, setIsDismissed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [manualPause, setManualPause] = useState(false);

  const messages = announcement ? [announcement, ...DEFAULT_MESSAGES] : DEFAULT_MESSAGES;

  // Auto-rotate messages every 4.8 seconds when not paused
  useEffect(() => {
    if (messages.length <= 1 || isPaused || manualPause || isDismissed) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % messages.length);
    }, 4800);

    return () => clearInterval(timer);
  }, [messages.length, isPaused, manualPause, isDismissed]);

  const handleDismiss = () => setIsDismissed(true);

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
        'relative z-50 flex min-w-0 w-full flex-wrap items-center justify-center gap-1 bg-primary px-3 py-1 text-center text-label-sm font-medium text-on-primary',
        isCheckout && 'hidden lg:flex',
        className,
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsPaused(false);
      }}
      onTouchEnd={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
    >
      <div className="flex min-w-0 flex-1 basis-48 items-center justify-center gap-2">
        <SparklesIcon className="shrink-0 text-white/90" size={13} />
        <span className="min-w-0 break-words" key={currentIndex}>
          {messages[currentIndex]}
        </span>
      </div>

      {/* Rotating Arrow Controls (when more than 1 message) */}
      {messages.length > 1 && (
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center text-on-primary">
          <button
            aria-label="Previous announcement"
            className="flex min-h-12 min-w-12 items-center justify-center rounded hover:bg-white/15 hover:text-white active:scale-90 transition-[background-color,transform] duration-150 cursor-pointer"
            onClick={handlePrev}
            type="button"
          >
            <ArrowUpIcon className="-rotate-90" size={11} />
          </button>
          <button
            type="button"
            className="min-h-12 px-2 underline"
            aria-pressed={manualPause}
            onClick={() => setManualPause((value) => !value)}
          >
            {manualPause ? 'Resume announcements' : 'Pause announcements'}
          </button>
          <span className="text-[10px] font-mono opacity-70 tabular-nums">
            {currentIndex + 1}/{messages.length}
          </span>
          <button
            aria-label="Next announcement"
            className="flex min-h-12 min-w-12 items-center justify-center rounded hover:bg-white/15 hover:text-white active:scale-90 transition-[background-color,transform] duration-150 cursor-pointer"
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
          className="flex min-h-12 min-w-12 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white active:scale-90 transition-[background-color,transform] duration-150 cursor-pointer"
          onClick={handleDismiss}
          type="button"
        >
          <CloseIcon size={13} />
        </button>
      )}
    </aside>
  );
}
