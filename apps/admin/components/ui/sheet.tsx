'use client';

import * as React from 'react';
import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { cn } from 'cn';

import {
  ADMIN_MOTION,
  AnimatePresence,
  MotionBackdrop,
  motion,
  useOverlayRootMotion,
  type OverlayMotionContextValue,
} from '@/components/motion/motion-primitives';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';

const SheetOverlayContext = React.createContext<OverlayMotionContextValue | null>(null);

function Sheet({
  open,
  defaultOpen,
  onOpenChange,
  actionsRef,
  ...props
}: SheetPrimitive.Root.Props) {
  const motionState = useOverlayRootMotion({
    open,
    defaultOpen,
    onOpenChange,
    actionsRef,
  });

  return (
    <SheetOverlayContext.Provider value={motionState.overlayContextValue}>
      <SheetPrimitive.Root
        data-slot="sheet"
        open={motionState.open}
        onOpenChange={motionState.onOpenChange}
        actionsRef={motionState.actionsRef}
        {...props}
      />
    </SheetOverlayContext.Provider>
  );
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      hidden={false}
      render={<MotionBackdrop transition={ADMIN_MOTION.fast} />}
      className={cn(
        'fixed inset-0 z-50 bg-black/20 dark:bg-black/50 supports-backdrop-filter:backdrop-blur-xs',
        className,
      )}
      {...props}
    />
  );
}

function getSheetMotionOffsets(
  side: 'top' | 'right' | 'bottom' | 'left',
  responsive: boolean,
  isMobile: boolean,
) {
  const resolvedSide = side === 'right' && responsive && isMobile ? 'bottom' : side;
  switch (resolvedSide) {
    case 'right':
      return { x: 40, y: 0, isBottom: false };
    case 'left':
      return { x: -40, y: 0, isBottom: false };
    case 'top':
      return { x: 0, y: -32, isBottom: false };
    case 'bottom':
    default:
      return { x: 0, y: '100%', isBottom: true };
  }
}

function SheetContent({
  className,
  children,
  side = 'right',
  responsive = true,
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  responsive?: boolean;
  showCloseButton?: boolean;
}) {
  const overlay = React.useContext(SheetOverlayContext);
  const isMobile = useIsMobile();
  const isOpen = overlay?.open ?? true;
  const keepPortalMounted = overlay ? overlay.present : false;
  const offset = getSheetMotionOffsets(side, responsive, isMobile);

  const responsiveRightDrawer =
    side === 'right' && responsive
      ? 'max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:right-auto max-sm:h-auto max-sm:max-h-[92dvh] max-sm:w-full max-sm:rounded-t-2xl max-sm:border-t max-sm:border-l-0 sm:inset-y-0 sm:right-0 sm:h-full sm:w-full sm:max-w-lg sm:border-l'
      : undefined;

  return (
    <SheetPortal keepMounted={keepPortalMounted}>
      <AnimatePresence onExitComplete={overlay?.onExitComplete}>
        {isOpen ? <SheetOverlay key="sheet-overlay" /> : null}
        {isOpen ? (
          <SheetPrimitive.Popup
            key="sheet-popup"
            data-slot="sheet-content"
            data-side={side}
            hidden={false}
            render={
              <motion.div
                initial={{ opacity: 1, x: offset.x, y: offset.y }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{
                  opacity: offset.isBottom ? 1 : 0,
                  x: offset.x,
                  y: offset.y,
                  transition: offset.isBottom ? ADMIN_MOTION.bottomSheetExit : ADMIN_MOTION.drawer,
                }}
                transition={offset.isBottom ? ADMIN_MOTION.bottomSheet : ADMIN_MOTION.drawer}
              />
            }
            className={cn(
              'fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:max-h-[90dvh] data-[side=bottom]:rounded-t-2xl data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:sm:max-w-sm data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b',
              side === 'right' &&
                !responsive &&
                'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
              responsiveRightDrawer,
              className,
            )}
            {...props}
          >
            {children}
            {showCloseButton && (
              <SheetPrimitive.Close
                data-slot="sheet-close"
                render={
                  <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />
                }
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </SheetPrimitive.Close>
            )}
          </SheetPrimitive.Popup>
        ) : null}
      </AnimatePresence>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-0.5 p-4', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        'mt-auto flex flex-col gap-2 border-t border-border/60 bg-muted/40 p-4 sm:flex-row sm:justify-end sm:pb-4',
        className,
        'pb-[max(1rem,env(safe-area-inset-bottom,0px))]',
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-heading text-base font-medium text-foreground', className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
