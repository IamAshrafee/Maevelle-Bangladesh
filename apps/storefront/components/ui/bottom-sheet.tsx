'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/components/ui/classnames';
import { IconButton } from '@/components/ui/icon-button';
import { CloseIcon } from '@/components/ui/icons';

export interface BottomSheetProps {
  /** Whether the bottom sheet is open. */
  isOpen: boolean;
  /** Callback fired when the bottom sheet requests to close. */
  onClose: () => void;
  /** Title displayed in the sheet header, or an accessibility label. */
  title?: ReactNode;
  /** Optional subtitle displayed below the title in the header. */
  subtitle?: ReactNode;
  /** Optional custom header element that replaces the default title/subtitle header. */
  header?: ReactNode;
  /** Optional sticky/pinned footer element rendered above the bottom safe area. */
  footer?: ReactNode;
  /** Whether to display the top rounded drag handle bar. Defaults to true. */
  showHandle?: boolean;
  /** Whether to display the close icon button in the header. Defaults to true. */
  showCloseButton?: boolean;
  /** Explicit accessible label for the dialog if title is complex or custom. */
  ariaLabel?: string;
  /** Optional custom class name for the sheet surface container. */
  className?: string;
  /** Optional custom class name for the scrollable content area. */
  contentClassName?: string;
  /** Sheet content. */
  children: ReactNode;
}

/**
 * Mobile Bottom Sheet — Premium Opening & Closing Motion System.
 *
 * Implements GPU-accelerated vertical translateY motion with decoupled backdrop opacity.
 * Decelerates smoothly on entrance (380ms ease-out) and accelerates cleanly on exit (280ms ease-in).
 * Internal elements move as one unified rigid surface without staggered child animations.
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  header,
  footer,
  showHandle = true,
  showCloseButton = true,
  ariaLabel,
  className,
  contentClassName,
  children,
}: BottomSheetProps) {
  // SSR-safe mount state (avoids hydration mismatches)
  const [isMounted, setIsMounted] = useState(false);
  const [dataState, setDataState] = useState<'closed' | 'open'>('closed');
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const surfaceRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const pointerStartYRef = useRef(0);
  const titleId = useId();

  // Coordinate open/close animation lifecycle
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      setIsMounted(true);

      // Force layout calculation at translateY(100%) before switching to open state
      const frame = requestAnimationFrame(() => {
        if (surfaceRef.current) {
          void surfaceRef.current.offsetHeight;
        }
        setDataState('open');
      });

      return () => cancelAnimationFrame(frame);
    }

    setDataState('closed');
    const timer = window.setTimeout(() => {
      setIsMounted(false);
    }, 320); // 280ms duration + 40ms safety buffer

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  // Handle unmounting once CSS transition finishes
  const handleTransitionEnd = (e: React.TransitionEvent<HTMLElement>) => {
    if (
      e.target === surfaceRef.current &&
      (e.propertyName === 'transform' || e.propertyName === 'opacity') &&
      !isOpen
    ) {
      setIsMounted(false);
    }
  };

  // Lock body scroll and restore on unmount/close
  useEffect(() => {
    if (!isMounted) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    // Focus surface container (not child text fields) to avoid triggering mobile virtual keyboard
    if (surfaceRef.current) {
      surfaceRef.current.focus({ preventScroll: true });
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      if (previousActiveElementRef.current && previousActiveElementRef.current.isConnected) {
        previousActiveElementRef.current.focus({ preventScroll: true });
      }
    };
  }, [isMounted]);

  // Global Escape key listener
  useEffect(() => {
    if (!isMounted) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isMounted, onClose]);

  // Tab focus trap within sheet dialog
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'Tab') {
      const root = surfaceRef.current;
      if (!root) return;

      const focusables = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])',
      );

      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!first || !last) {
        e.preventDefault();
        return;
      }

      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === root) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  // Drag down gesture on handle to dismiss (using Pointer Events for mouse, touch, and stylus)
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture fallback
    }
    pointerStartYRef.current = e.clientY;
    setIsDragging(true);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const deltaY = e.clientY - pointerStartYRef.current;
    if (deltaY > 0) {
      setDragY(deltaY);
    } else {
      setDragY(0);
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDragging(false);
    if (dragY > 80) {
      setDragY(0);
      onClose();
    } else {
      setDragY(0);
    }
  };

  if (!isMounted || typeof document === 'undefined') {
    return null;
  }

  const effectiveAriaLabel =
    ariaLabel ?? (typeof title === 'string' ? title : 'Bottom sheet dialog');

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end pointer-events-none">
      {/* Decoupled Scrim Backdrop: fades opacity without movement */}
      <div
        aria-hidden="true"
        className="pointer-events-auto fixed inset-0 bg-scrim bottom-sheet-backdrop"
        data-state={dataState}
        onClick={onClose}
      />

      {/* Sheet Surface: animates translateY as one unified rigid container */}
      <section
        aria-describedby={subtitle ? `${titleId}-subtitle` : undefined}
        aria-label={effectiveAriaLabel}
        aria-labelledby={title && typeof title === 'string' ? titleId : undefined}
        aria-modal="true"
        className={cx(
          'pointer-events-auto relative z-10 mx-auto flex max-h-[92vh] max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface-container-lowest shadow-2xl border-t border-border/40 outline-none bottom-sheet-surface',
          className,
        )}
        data-state={dataState}
        onKeyDown={handleKeyDown}
        onTransitionEnd={handleTransitionEnd}
        ref={surfaceRef}
        role="dialog"
        style={isDragging ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        tabIndex={-1}
      >
        {/* Top Grab Handle Bar with pointer drag support */}
        {showHandle && (
          <div
            className="flex w-full cursor-grab active:cursor-grabbing items-center justify-center pt-3 pb-1 shrink-0 touch-none select-none"
            onPointerCancel={handlePointerUp}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div
              aria-hidden="true"
              className="h-1.5 w-12 rounded-full bg-surface-container-highest"
            />
          </div>
        )}

        {/* Sheet Header */}
        {header ? (
          header
        ) : title ? (
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <h2
                className="font-serif text-2xl font-semibold leading-tight text-primary"
                id={titleId}
              >
                {title}
              </h2>
              {subtitle ? (
                <div
                  className="mt-0.5 font-label-sm text-xs text-on-surface-variant"
                  id={`${titleId}-subtitle`}
                >
                  {subtitle}
                </div>
              ) : null}
            </div>
            {showCloseButton && (
              <IconButton
                aria-label={`Close ${typeof title === 'string' ? title : 'dialog'}`}
                onClick={onClose}
                variant="ghost"
              >
                <CloseIcon size={20} />
              </IconButton>
            )}
          </header>
        ) : null}

        {/* Scrollable Content Body */}
        <div
          className={cx(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-container-lowest',
            !footer && 'pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]',
            contentClassName,
          )}
          ref={contentRef}
        >
          {children}
        </div>

        {/* Pinned Sticky Footer */}
        {footer && (
          <footer className="shrink-0 border-t border-border/40 bg-surface-container-lowest p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-lg">
            {footer}
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
}
