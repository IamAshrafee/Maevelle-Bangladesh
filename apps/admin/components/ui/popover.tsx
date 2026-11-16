'use client';

import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from 'cn';

import {
  ADMIN_MOTION,
  AnimatePresence,
  getSideMotionOffset,
  motion,
  useOverlayRootMotion,
  type OverlayMotionContextValue,
} from '@/components/motion/motion-primitives';

const PopoverOverlayContext = React.createContext<OverlayMotionContextValue | null>(null);

function Popover({
  open,
  defaultOpen,
  onOpenChange,
  actionsRef,
  ...props
}: PopoverPrimitive.Root.Props) {
  const motionState = useOverlayRootMotion({
    open,
    defaultOpen,
    onOpenChange,
    actionsRef,
  });

  return (
    <PopoverOverlayContext.Provider value={motionState.overlayContextValue}>
      <PopoverPrimitive.Root
        data-slot="popover"
        open={motionState.open}
        onOpenChange={motionState.onOpenChange}
        actionsRef={motionState.actionsRef}
        {...props}
      />
    </PopoverOverlayContext.Provider>
  );
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = 'center',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  const overlay = React.useContext(PopoverOverlayContext);
  const isOpen = overlay?.open ?? true;
  const keepPortalMounted = overlay ? overlay.present : false;
  const offset = getSideMotionOffset(side, 6);

  return (
    <PopoverPrimitive.Portal keepMounted={keepPortalMounted}>
      <AnimatePresence onExitComplete={overlay?.onExitComplete}>
        {isOpen ? (
          <PopoverPrimitive.Positioner
            key="popover-positioner"
            align={align}
            alignOffset={alignOffset}
            side={side}
            sideOffset={sideOffset}
            hidden={false}
            className="isolate z-[60]"
          >
            <PopoverPrimitive.Popup
              data-slot="popover-content"
              hidden={false}
              render={
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, x: offset.x, y: offset.y }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, x: offset.x, y: offset.y }}
                  transition={ADMIN_MOTION.fast}
                />
              }
              className={cn(
                'z-[60] flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden',
                className,
              )}
              {...props}
            />
          </PopoverPrimitive.Positioner>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Portal>
  );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="popover-header"
      className={cn('flex flex-col gap-0.5 text-sm', className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn('font-medium', className)}
      {...props}
    />
  );
}

function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };
