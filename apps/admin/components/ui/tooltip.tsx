'use client';

import * as React from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cn } from '@/lib/utils';
import {
  ADMIN_MOTION,
  AnimatePresence,
  getSideMotionOffset,
  motion,
  useOverlayRootMotion,
  type OverlayMotionContextValue,
} from '@/components/motion/motion-primitives';

const TooltipOverlayContext = React.createContext<OverlayMotionContextValue | null>(null);

function TooltipProvider({ delay = 0, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}

function Tooltip({
  open,
  defaultOpen,
  onOpenChange,
  actionsRef,
  ...props
}: TooltipPrimitive.Root.Props) {
  const motionState = useOverlayRootMotion({
    open,
    defaultOpen,
    onOpenChange,
    actionsRef,
  });

  return (
    <TooltipOverlayContext.Provider value={motionState.overlayContextValue}>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        open={motionState.open}
        onOpenChange={motionState.onOpenChange}
        actionsRef={motionState.actionsRef}
        {...props}
      />
    </TooltipOverlayContext.Provider>
  );
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = 'top',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  const overlay = React.useContext(TooltipOverlayContext);
  const isOpen = overlay?.open ?? true;
  const keepPortalMounted = overlay ? overlay.present : false;
  const offset = getSideMotionOffset(side, 4);

  return (
    <TooltipPrimitive.Portal keepMounted={keepPortalMounted}>
      <AnimatePresence onExitComplete={overlay?.onExitComplete}>
        {isOpen ? (
          <TooltipPrimitive.Positioner
            key="tooltip-positioner"
            align={align}
            alignOffset={alignOffset}
            side={side}
            sideOffset={sideOffset}
            hidden={false}
            className="isolate z-50"
          >
            <TooltipPrimitive.Popup
              data-slot="tooltip-content"
              hidden={false}
              render={
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, x: offset.x, y: offset.y }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, x: offset.x, y: offset.y }}
                  transition={ADMIN_MOTION.micro}
                />
              }
              className={cn(
                'z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm',
                className,
              )}
              {...props}
            >
              {children}
              <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        ) : null}
      </AnimatePresence>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
