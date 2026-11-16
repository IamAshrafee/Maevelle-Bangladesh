'use client';

import * as React from 'react';
import { PreviewCard as PreviewCardPrimitive } from '@base-ui/react/preview-card';
import { cn } from 'cn';

import {
  ADMIN_MOTION,
  AnimatePresence,
  getSideMotionOffset,
  motion,
  useOverlayRootMotion,
  type OverlayMotionContextValue,
} from '@/components/motion/motion-primitives';

const HoverCardOverlayContext = React.createContext<OverlayMotionContextValue | null>(null);

function HoverCard({
  open,
  defaultOpen,
  onOpenChange,
  actionsRef,
  ...props
}: PreviewCardPrimitive.Root.Props) {
  const motionState = useOverlayRootMotion({
    open,
    defaultOpen,
    onOpenChange,
    actionsRef,
  });

  return (
    <HoverCardOverlayContext.Provider value={motionState.overlayContextValue}>
      <PreviewCardPrimitive.Root
        data-slot="hover-card"
        open={motionState.open}
        onOpenChange={motionState.onOpenChange}
        actionsRef={motionState.actionsRef}
        {...props}
      />
    </HoverCardOverlayContext.Provider>
  );
}

function HoverCardTrigger({ ...props }: PreviewCardPrimitive.Trigger.Props) {
  return <PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

function HoverCardContent({
  className,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 4,
  ...props
}: PreviewCardPrimitive.Popup.Props &
  Pick<PreviewCardPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  const overlay = React.useContext(HoverCardOverlayContext);
  const isOpen = overlay?.open ?? true;
  const keepPortalMounted = overlay ? overlay.present : false;
  const offset = getSideMotionOffset(side, 6);

  return (
    <PreviewCardPrimitive.Portal data-slot="hover-card-portal" keepMounted={keepPortalMounted}>
      <AnimatePresence onExitComplete={overlay?.onExitComplete}>
        {isOpen ? (
          <PreviewCardPrimitive.Positioner
            key="hover-card-positioner"
            align={align}
            alignOffset={alignOffset}
            side={side}
            sideOffset={sideOffset}
            hidden={false}
            className="isolate z-50"
          >
            <PreviewCardPrimitive.Popup
              data-slot="hover-card-content"
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
                'z-50 w-64 origin-(--transform-origin) rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden',
                className,
              )}
              {...props}
            />
          </PreviewCardPrimitive.Positioner>
        ) : null}
      </AnimatePresence>
    </PreviewCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
