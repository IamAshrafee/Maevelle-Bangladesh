'use client';

import * as React from 'react';
import {
  AnimatePresence as FramerAnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  type Transition,
} from 'motion/react';

export const ADMIN_EASE = [0.16, 1, 0.3, 1] as const;

export const ADMIN_MOTION = {
  micro: { duration: 0.12, ease: ADMIN_EASE },
  fast: { duration: 0.16, ease: ADMIN_EASE },
  panel: { duration: 0.22, ease: ADMIN_EASE },
  drawer: { duration: 0.26, ease: ADMIN_EASE },
  bottomSheet: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
  bottomSheetExit: { duration: 0.28, ease: [0.4, 0, 1, 1] },
  spring: { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.8 },
} satisfies Record<string, Transition>;

export interface OverlayActions {
  unmount: () => void;
  close: () => void;
}

export interface OverlayMotionContextValue {
  readonly open: boolean;
  readonly present: boolean;
  readonly onExitComplete: () => void;
  readonly requestUnmount: () => void;
}

export function AdminMotionProvider({ children }: { readonly children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={ADMIN_MOTION.fast}>
      {children}
    </MotionConfig>
  );
}

export function AdminLayoutGroup({
  id,
  children,
}: {
  readonly id?: string;
  readonly children: React.ReactNode;
}) {
  return <LayoutGroup {...(id ? { id } : {})}>{children}</LayoutGroup>;
}

/**
 * Mirrors Base UI open state so controlled and uncontrolled overlay primitives
 * can coordinate Motion enter/exit transitions without extra boilerplate.
 */
export function useControllableOpen<EventDetails>({
  open,
  defaultOpen = false,
  onOpenChange,
}: {
  open?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  onOpenChange?: ((open: boolean, eventDetails: EventDetails) => void) | undefined;
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : internalOpen;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean, eventDetails: EventDetails) => {
      onOpenChange?.(nextOpen, eventDetails);
      const isCanceled =
        typeof eventDetails === 'object' &&
        eventDetails !== null &&
        'isCanceled' in eventDetails &&
        Boolean((eventDetails as { isCanceled?: boolean }).isCanceled);
      if (!isCanceled && !nextOpen && typeof eventDetails === 'object' && eventDetails !== null) {
        const maybePrevent = (eventDetails as { preventUnmountOnClose?: () => void })
          .preventUnmountOnClose;
        maybePrevent?.();
      }
      if (!isControlled && !isCanceled) {
        setInternalOpen(nextOpen);
      }
    },
    [isControlled, onOpenChange],
  );

  return [resolvedOpen, handleOpenChange] as const;
}

/**
 * Keeps a Portal / Overlay tree alive across Motion exit transitions without keeping
 * closed overlays mounted in the DOM at rest.
 */
export function useAnimatedPresenceState(open: boolean) {
  const [present, setPresent] = React.useState(open);
  const openRef = React.useRef(open);
  openRef.current = open;

  React.useEffect(() => {
    if (open) {
      setPresent(true);
    }
  }, [open]);

  const onExitComplete = React.useCallback(() => {
    if (!openRef.current) {
      setPresent(false);
    }
  }, []);

  return {
    present: open || present,
    onExitComplete,
  };
}

/**
 * Shared coordinator for Base UI popup/dialog roots wrapped with AnimatePresence.
 */
export function useOverlayRootMotion<EventDetails, Actions extends { unmount: () => void }>({
  open,
  defaultOpen = false,
  onOpenChange,
  actionsRef: externalActionsRef,
}: {
  open?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  onOpenChange?: ((open: boolean, eventDetails: EventDetails) => void) | undefined;
  actionsRef?: React.RefObject<Actions | null> | undefined;
}) {
  const [resolvedOpen, handleOpenChange] = useControllableOpen({
    open,
    defaultOpen,
    onOpenChange,
  });
  const { present, onExitComplete } = useAnimatedPresenceState(resolvedOpen);
  const internalActionsRef = React.useRef<Actions | null>(null);
  const resolvedActionsRef = externalActionsRef ?? internalActionsRef;

  const requestUnmount = React.useCallback(() => {
    resolvedActionsRef.current?.unmount();
    onExitComplete();
  }, [resolvedActionsRef, onExitComplete]);

  const overlayContextValue = React.useMemo<OverlayMotionContextValue>(
    () => ({
      open: resolvedOpen,
      present,
      onExitComplete: requestUnmount,
      requestUnmount,
    }),
    [resolvedOpen, present, requestUnmount],
  );

  return {
    open: resolvedOpen,
    onOpenChange: handleOpenChange,
    actionsRef: resolvedActionsRef,
    overlayContextValue,
  };
}

export type FloatingSide = 'top' | 'bottom' | 'left' | 'right' | 'inline-start' | 'inline-end';

export function getSideMotionOffset(
  side: FloatingSide = 'bottom',
  distance = 6,
): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: 0, y: distance };
    case 'bottom':
      return { x: 0, y: -distance };
    case 'left':
    case 'inline-start':
      return { x: distance, y: 0 };
    case 'right':
    case 'inline-end':
      return { x: -distance, y: 0 };
    default:
      return { x: 0, y: -distance };
  }
}

export const MotionBackdrop = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof motion.div>
>(function MotionBackdrop({ className, transition = ADMIN_MOTION.fast, ...props }, ref) {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition}
      className={className}
      {...props}
    />
  );
});

export function AnimatePresence({
  onExitComplete,
  ...props
}: Omit<React.ComponentProps<typeof FramerAnimatePresence>, 'onExitComplete'> & {
  readonly onExitComplete?: (() => void) | undefined;
}) {
  return <FramerAnimatePresence {...props} {...(onExitComplete ? { onExitComplete } : {})} />;
}

export { motion };
