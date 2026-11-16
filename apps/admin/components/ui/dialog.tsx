'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import {
  ADMIN_MOTION,
  AnimatePresence,
  MotionBackdrop,
  motion,
  useOverlayRootMotion,
  type OverlayMotionContextValue,
} from '@/components/motion/motion-primitives';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';

const DialogOverlayContext = React.createContext<OverlayMotionContextValue | null>(null);

function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  actionsRef,
  ...props
}: DialogPrimitive.Root.Props) {
  const motionState = useOverlayRootMotion({
    open,
    defaultOpen,
    onOpenChange,
    actionsRef,
  });

  return (
    <DialogOverlayContext.Provider value={motionState.overlayContextValue}>
      <DialogPrimitive.Root
        data-slot="dialog"
        open={motionState.open}
        onOpenChange={motionState.onOpenChange}
        actionsRef={motionState.actionsRef}
        {...props}
      />
    </DialogOverlayContext.Provider>
  );
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      hidden={false}
      render={<MotionBackdrop transition={ADMIN_MOTION.fast} />}
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/20 dark:bg-black/50 supports-backdrop-filter:backdrop-blur-xs touch-none',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  const overlay = React.useContext(DialogOverlayContext);
  const isOpen = overlay?.open ?? true;
  const keepPortalMounted = overlay ? overlay.present : false;

  return (
    <DialogPortal keepMounted={keepPortalMounted}>
      <AnimatePresence onExitComplete={overlay?.onExitComplete}>
        {isOpen ? <DialogOverlay key="dialog-overlay" /> : null}
        {isOpen ? (
          <DialogPrimitive.Popup
            key="dialog-popup"
            data-slot="dialog-content"
            hidden={false}
            render={
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={ADMIN_MOTION.panel}
              />
            }
            className={cn(
              'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 shadow-lg outline-none sm:max-w-sm',
              className,
            )}
            {...props}
          >
            {children}
            {showCloseButton && (
              <DialogPrimitive.Close
                data-slot="dialog-close"
                render={
                  <Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />
                }
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            )}
          </DialogPrimitive.Popup>
        ) : null}
      </AnimatePresence>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end sm:pb-4',
        className,
        'pb-[max(1rem,env(safe-area-inset-bottom,0px))]',
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('font-heading text-base leading-none font-medium', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
