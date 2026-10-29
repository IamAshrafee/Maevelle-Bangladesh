'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type RefreshPhase = 'idle' | 'refreshing' | 'success' | 'error';

export interface RefreshButtonProps
  extends Omit<React.ComponentProps<typeof Button>, 'children' | 'render'> {
  /**
   * Refresh callback. Can be synchronous or asynchronous.
   * If an async function / Promise is returned, the button automatically
   * manages its own spinning animation, smart click queueing, and outcome feedback (success/error).
   * If omitted and `onClick` is also omitted, defaults to Next.js `router.refresh()`.
   */
  onRefresh?: (() => void | Promise<unknown>) | undefined;

  /**
   * Optional callback invoked when `onRefresh` or `onClick` throws an error.
   */
  onRefreshError?: ((error: unknown) => void) | undefined;

  /**
   * Explicit external loading indicator (e.g. `state === 'loading'` or parent query loading).
   * When true, the button visually reflects the refreshing state.
   */
  loading?: boolean | undefined;

  /**
   * Tooltip displayed on hover and focus.
   * - `string` or `ReactNode`: custom tooltip content.
   * - `true` (or omitted): defaults to `'Refresh'`.
   * - `false`: disables tooltip popup (native title attribute still available).
   */
  tooltip?: React.ReactNode | boolean | undefined;

  /**
   * Side to show the tooltip on.
   * @default 'top'
   */
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right' | undefined;

  /**
   * Accessible aria-label when idle.
   * Defaults to tooltip string if available, otherwise `'Refresh'`.
   */
  label?: string | undefined;

  /**
   * Accessible label and tooltip text when in refreshing / loading state.
   * @default 'Refreshing…'
   */
  loadingLabel?: string | undefined;

  /**
   * Accessible label and tooltip text when in slow refreshing state (>2.5s).
   * @default 'Still checking…'
   */
  slowLoadingLabel?: string | undefined;

  /**
   * Accessible label and tooltip text when refresh completes successfully.
   * @default 'Updated successfully'
   */
  successLabel?: string | undefined;

  /**
   * Accessible label and tooltip text when refresh fails.
   * @default 'Refresh failed'
   */
  errorLabel?: string | undefined;

  /**
   * Accessible label and tooltip text when a rapid click queued another refresh.
   * @default 'Will refresh again after this'
   */
  queuedLabel?: string | undefined;

  /**
   * Minimum duration in milliseconds to spin the icon when an async refresh is triggered.
   * Prevents micro-flicker on ultra-fast (sub-100ms) or cached revalidations.
   * @default 400
   */
  minSpinDuration?: number | undefined;

  /**
   * Duration in milliseconds to display the green checkmark before resetting to idle.
   * Clicking the button during this duration immediately interrupts and starts a new refresh.
   * @default 800
   */
  successDuration?: number | undefined;

  /**
   * Duration in milliseconds to display the red error state before resetting to idle.
   * Clicking the button during this duration immediately retries.
   * @default 1200
   */
  errorDuration?: number | undefined;

  /**
   * Whether rapid clicks while refreshing should queue at most one follow-up refresh.
   * @default true
   */
  queueRapidClicks?: boolean | undefined;

  /**
   * Additional className applied specifically to the SVG icon.
   */
  iconClassName?: string | undefined;
}

// Morphable SVG paths (both have identical command structures: 1 Move + 2 Cubic Beziers)
const REFRESH_PATH = 'M20 11 C19 7 16 4.4 12 4.4 C8.1 4.4 5.5 6.8 4.8 9';
const CHECK_PATH = 'M4.8 12.3 C6.5 14 8.3 15.7 10 17.2 C13.1 13.5 16.6 8.7 20.1 5.3';

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms));
  });

/**
 * Reusable, high-performance icon-only Refresh Button for Maevelle Admin.
 *
 * Micro-Interaction Architecture:
 * - Fluid SVG Path Morphing: Refresh arc physically unrolls and flexes into an emerald checkmark.
 * - Smooth Deceleration: Rotation completes its full 360° turn naturally before stopping.
 * - Smart Click Queueing: Rapid/repeated clicks don't spawn duplicate requests; coalesces
 *   into 1 queued refresh with immediate visual tap feedback and queued badge.
 * - Independent Timelines: Instant data processing + minimum visible spin to eliminate flicker.
 * - Interruptible Feedback: Clicks during success/error hold immediately launch a new refresh.
 * - Slow Query Detection: Updates tooltip to "Still checking…" if request exceeds 2.5s.
 * - Strict Design System & Token Compliance: Maevelle semantic tokens, explicit transitions.
 */
export function RefreshButton({
  onRefresh,
  onRefreshError,
  onClick,
  loading: externalLoading,
  tooltip = 'Refresh',
  tooltipSide = 'top',
  label,
  loadingLabel = 'Refreshing…',
  slowLoadingLabel = 'Still checking…',
  successLabel = 'Updated successfully',
  errorLabel = 'Refresh failed',
  queuedLabel = 'Will refresh again after this',
  minSpinDuration = 400,
  successDuration = 800,
  errorDuration = 1200,
  queueRapidClicks = true,
  variant = 'outline',
  size = 'icon',
  className,
  iconClassName,
  disabled: consumerDisabled,
  ...props
}: RefreshButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [phase, setPhase] = React.useState<RefreshPhase>('idle');
  const [isQueued, setIsQueued] = React.useState(false);
  const [isSlow, setIsSlow] = React.useState(false);

  const mountedRef = React.useRef(true);
  const isExecutingRef = React.useRef(false);
  const queuedRef = React.useRef(false);
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const slowTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reducedMotion = useReducedMotion();
  const rotation = useMotionValue(0);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (resetTimerRef.current !== undefined) clearTimeout(resetTimerRef.current);
      if (slowTimerRef.current !== undefined) clearTimeout(slowTimerRef.current);
    };
  }, []);

  // Determine authoritative visual phase
  const isRefreshing = Boolean(externalLoading || isPending || phase === 'refreshing');
  const visualPhase: RefreshPhase = isRefreshing ? 'refreshing' : phase;
  const isSuccess = visualPhase === 'success';
  const isError = visualPhase === 'error';

  // Smooth continuous rotation during refresh, then graceful deceleration on completion
  React.useEffect(() => {
    if (reducedMotion) {
      rotation.set(0);
      return;
    }

    if (visualPhase === 'refreshing') {
      const controls = animate(rotation, rotation.get() + 360, {
        duration: 0.8,
        ease: 'linear',
        repeat: Infinity,
      });
      return () => controls.stop();
    }

    if (visualPhase === 'success' || visualPhase === 'error') {
      const current = rotation.get();
      const target = Math.ceil(current / 360) * 360;
      const controls = animate(rotation, target, {
        duration: 0.28,
        ease: [0.16, 1, 0.3, 1],
      });
      return () => controls.stop();
    }

    rotation.set(0);
  }, [visualPhase, reducedMotion, rotation]);

  // Core execution engine with smart queue drain and independent visual timeline
  const executeRefresh = React.useCallback(
    async (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (isExecutingRef.current) return;
      isExecutingRef.current = true;

      if (resetTimerRef.current !== undefined) clearTimeout(resetTimerRef.current);
      if (slowTimerRef.current !== undefined) clearTimeout(slowTimerRef.current);

      setPhase('refreshing');
      setIsSlow(false);

      // Detect slow long-running requests
      slowTimerRef.current = setTimeout(() => {
        if (mountedRef.current && isExecutingRef.current) {
          setIsSlow(true);
        }
      }, 2500);

      const startedAt = performance.now();
      let failed = false;

      try {
        let runAgain = true;
        while (runAgain) {
          runAgain = false;
          queuedRef.current = false;
          if (mountedRef.current) setIsQueued(false);

          if (onRefresh) {
            await onRefresh();
          } else if (onClick && event) {
            const clickFn = onClick as (e: React.MouseEvent<HTMLButtonElement>) => unknown;
            const res = clickFn(event);
            if (res && typeof (res as Promise<unknown>).then === 'function') {
              await res;
            }
          } else {
            // Default Next.js router refresh inside startTransition
            await new Promise<void>((resolve) => {
              startTransition(() => {
                router.refresh();
                resolve();
              });
            });
          }

          // If user clicked again during the in-flight request, loop immediately
          if (queuedRef.current && queueRapidClicks) {
            runAgain = true;
          }
        }

        // Enforce anti-flicker minimum spin duration so fast requests feel smooth
        const elapsed = performance.now() - startedAt;
        const remaining = Math.max(0, (minSpinDuration ?? 400) - elapsed);
        if (remaining > 0) {
          await wait(remaining);
        }
      } catch (err) {
        failed = true;
        if (onRefreshError) {
          try {
            onRefreshError(err);
          } catch (handlerErr) {
            console.error('Refresh error callback failed:', handlerErr);
          }
        } else {
          console.error('Refresh failed:', err);
        }
      } finally {
        if (slowTimerRef.current !== undefined) clearTimeout(slowTimerRef.current);
        isExecutingRef.current = false;

        if (!mountedRef.current) return;

        if (failed) {
          setPhase('error');
          resetTimerRef.current = setTimeout(() => {
            if (mountedRef.current) setPhase('idle');
          }, Math.max(0, errorDuration ?? 1200));
        } else {
          setPhase('success');
          resetTimerRef.current = setTimeout(() => {
            if (mountedRef.current) setPhase('idle');
          }, Math.max(0, successDuration ?? 800));
        }
      }
    },
    [
      onRefresh,
      onClick,
      queueRapidClicks,
      minSpinDuration,
      router,
      startTransition,
      onRefreshError,
      errorDuration,
      successDuration,
    ],
  );

  // User click dispatcher
  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (consumerDisabled) {
        event.preventDefault();
        return;
      }

      // Case 1: Clicked during active refresh -> Smart Queueing
      if (isExecutingRef.current || isRefreshing) {
        event.preventDefault();
        if (queueRapidClicks) {
          queuedRef.current = true;
          setIsQueued(true);
        }
        return;
      }

      // Case 2: Clicked during success or error -> Interrupt hold & start new refresh immediately
      if (isSuccess || isError) {
        event.preventDefault();
        if (resetTimerRef.current !== undefined) clearTimeout(resetTimerRef.current);
        void executeRefresh(event);
        return;
      }

      // Case 3: Normal idle click
      void executeRefresh(event);
    },
    [consumerDisabled, isExecutingRef, isRefreshing, queueRapidClicks, isSuccess, isError, executeRefresh],
  );

  // Dynamic context-aware tooltip & accessible labels
  const tooltipText = tooltip === true ? 'Refresh' : tooltip;
  const currentLabel = isRefreshing
    ? isQueued
      ? queuedLabel
      : isSlow
        ? slowLoadingLabel
        : loadingLabel
    : isSuccess
      ? successLabel
      : isError
        ? errorLabel
        : label ?? (typeof tooltipText === 'string' ? tooltipText : 'Refresh');

  // Hard disable only if consumer explicitly passed disabled, or if external query is active
  const isButtonDisabled = Boolean(consumerDisabled || externalLoading);

  const buttonElement = (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={isButtonDisabled}
      aria-label={currentLabel}
      aria-busy={isRefreshing}
      onClick={handleClick}
      className={cn(
        'relative isolate shrink-0 overflow-visible select-none',
        'transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out',
        'active:scale-95 motion-reduce:transition-none',

        // Idle state: neutral styling
        visualPhase === 'idle' && 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-border bg-card',

        // Refreshing state: brand primary accent
        isRefreshing && 'border-primary/40 bg-primary/10 text-primary',

        // Success state: semantic emerald/success
        isSuccess && 'border-success/40 bg-success/10 text-success',

        // Error state: semantic red/destructive
        isError && 'border-destructive/40 bg-destructive/10 text-destructive',

        className,
      )}
      {...props}
    >
      {/* Expanding Success Halo */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] border border-success/60"
        initial={false}
        animate={
          isSuccess && !reducedMotion
            ? {
                opacity: [0, 0.75, 0],
                scale: [0.95, 1.15, 1.3],
              }
            : { opacity: 0, scale: 0.95 }
        }
        transition={{
          duration: reducedMotion ? 0 : 0.6,
          ease: 'easeOut',
        }}
      />

      {/* Queued follow-up ping indicator */}
      {isQueued && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-1 -right-1 flex size-2.5 items-center justify-center"
        >
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/70 opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
        </span>
      )}

      {/* Fully custom morphing SVG */}
      <motion.svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={cn('relative z-10 size-4 shrink-0', iconClassName)}
        style={{ rotate: rotation }}
        initial={false}
      >
        {/* Main refresh arc morphs into the checkmark */}
        <motion.path
          d={isSuccess ? CHECK_PATH : REFRESH_PATH}
          initial={false}
          animate={{
            d: isSuccess ? CHECK_PATH : REFRESH_PATH,
            opacity: isError ? 0 : 1,
          }}
          transition={{
            duration: reducedMotion ? 0 : 0.35,
            ease: [0.22, 1, 0.36, 1],
          }}
        />

        {/* Secondary refresh arc */}
        <motion.path
          d="M4 13 C5 17 8 19.6 12 19.6 C15.9 19.6 18.6 17.2 19.2 15"
          initial={false}
          animate={{
            opacity: isSuccess || isError ? 0 : 1,
          }}
          transition={{ duration: reducedMotion ? 0 : 0.2 }}
        />

        {/* Refresh arrowheads */}
        <motion.path
          d="M16.5 10.8 H20 V7.3"
          initial={false}
          animate={{
            opacity: isSuccess || isError ? 0 : 1,
          }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        />

        <motion.path
          d="M7.5 13.2 H4 V16.7"
          initial={false}
          animate={{
            opacity: isSuccess || isError ? 0 : 1,
          }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        />

        {/* Error X: two drawn diagonal strokes */}
        <motion.path
          d="M6 6 L18 18"
          initial={false}
          animate={{
            opacity: isError ? 1 : 0,
            pathLength: isError ? 1 : 0,
          }}
          transition={{
            duration: reducedMotion ? 0 : 0.25,
          }}
        />

        <motion.path
          d="M18 6 L6 18"
          initial={false}
          animate={{
            opacity: isError ? 1 : 0,
            pathLength: isError ? 1 : 0,
          }}
          transition={{
            duration: reducedMotion ? 0 : 0.25,
            delay: isError && !reducedMotion ? 0.06 : 0,
          }}
        />
      </motion.svg>
    </Button>
  );

  // Screen reader polite live announcement
  const liveAnnouncement = (
    <span role="status" aria-live="polite" className="sr-only">
      {isSuccess ? successLabel : isError ? errorLabel : ''}
    </span>
  );

  // If tooltip is disabled, return button with native title fallback
  if (tooltip === false) {
    return (
      <>
        {React.cloneElement(buttonElement, {
          title: currentLabel,
        })}
        {liveAnnouncement}
      </>
    );
  }

  // Render button inside Base UI Tooltip with interactive wrapper
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="inline-flex shrink-0"
              title={typeof tooltipText === 'string' ? tooltipText : undefined}
            >
              {buttonElement}
            </span>
          }
        />
        <TooltipContent side={tooltipSide} align="center">
          {currentLabel}
        </TooltipContent>
      </Tooltip>
      {liveAnnouncement}
    </>
  );
}
