'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';

export type ActionDialogSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeClasses: Record<ActionDialogSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
};

export interface ActionDialogProps {
  /** Controls dialog visibility */
  readonly open: boolean;
  /** Callback when dialog is closed */
  readonly onClose?: () => void;
  /** Callback when open state changes */
  readonly onOpenChange?: (open: boolean) => void;

  /** Header title and optional description */
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  /** Optional icon displayed in header */
  readonly icon?: React.ComponentType<{ className?: string }>;

  /** Modal sizing: sm (384px), md (448px, default), lg (512px), xl (576px) */
  readonly size?: ActionDialogSize;
  /** Additional classes applied to DialogContent */
  readonly className?: string;
  /** Additional classes applied to form/content wrapper */
  readonly formClassName?: string;
  /** Additional classes applied to DialogHeader */
  readonly headerClassName?: string;
  /** Additional classes applied to DialogFooter */
  readonly footerClassName?: string;

  /** Form submit handler. If provided, content is wrapped in <form> */
  readonly onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;

  /** In-dialog error message (rendered as an Alert) */
  readonly error?: string | null;

  /** Submission state & button labels */
  readonly busy?: boolean;
  readonly submitLabel?: string;
  readonly busyLabel?: string;
  readonly submitDisabled?: boolean;
  readonly submitVariant?: 'default' | 'destructive' | 'outline' | 'secondary';

  /** Cancellation configuration */
  readonly cancelLabel?: string;
  readonly showCancelButton?: boolean;

  /** Informational note rendered right above the action footer */
  readonly footerNote?: React.ReactNode;
  /** Extra secondary controls placed on the left side of the footer */
  readonly footerExtra?: React.ReactNode;
  /** Custom footer override replacing default cancel/submit buttons */
  readonly customFooter?: React.ReactNode;

  /** Dialog body content */
  readonly children: React.ReactNode;
}

/**
 * Reusable modal action & form dialog component for Maevelle Admin.
 * Handles standard layout, responsive sizing, in-dialog errors,
 * busy/spinner states, and button positioning consistently.
 */
export function ActionDialog({
  open,
  onClose,
  onOpenChange,
  title,
  description,
  icon: Icon,
  size = 'md',
  className,
  formClassName,
  headerClassName,
  footerClassName,
  onSubmit,
  error,
  busy = false,
  submitLabel = 'Confirm',
  busyLabel,
  submitDisabled = false,
  submitVariant = 'default',
  cancelLabel = 'Cancel',
  showCancelButton = true,
  footerNote,
  footerExtra,
  customFooter,
  children,
}: ActionDialogProps) {
  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      onOpenChange?.(nextOpen);
      if (!nextOpen) {
        onClose?.();
      }
    },
    [onOpenChange, onClose],
  );

  const handleCancel = React.useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      onOpenChange?.(false);
    }
  }, [onClose, onOpenChange]);

  const content = (
    <>
      <DialogHeader className={headerClassName}>
        {Icon ? (
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <Icon className="size-4" />
            </div>
            <div className="grid gap-1">
              <DialogTitle className="text-base font-medium">{title}</DialogTitle>
              {description ? (
                <DialogDescription className="text-xs leading-normal text-muted-foreground">
                  {description}
                </DialogDescription>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <DialogTitle className="text-base font-medium">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="text-xs leading-normal text-muted-foreground">
                {description}
              </DialogDescription>
            ) : null}
          </>
        )}
      </DialogHeader>

      {error ? (
        <Alert variant="destructive" className="py-2 text-xs">
          <AlertCircle className="size-4 shrink-0" />
          <AlertDescription className="text-xs leading-normal">{error}</AlertDescription>
        </Alert>
      ) : null}

      {children}

      {footerNote ? (
        <div className="text-xs text-muted-foreground">{footerNote}</div>
      ) : null}

      {customFooter !== undefined ? (
        customFooter
      ) : (
        <DialogFooter className={footerClassName}>
          {footerExtra ? (
            <div className="flex items-center gap-2 sm:mr-auto">{footerExtra}</div>
          ) : null}
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            {showCancelButton ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={busy}
              >
                {cancelLabel}
              </Button>
            ) : null}
            {onSubmit ? (
              <Button
                type="submit"
                variant={submitVariant}
                disabled={busy || submitDisabled}
              >
                {busy ? <Spinner className="size-4 shrink-0" /> : null}
                {busy ? (busyLabel ?? submitLabel) : submitLabel}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(sizeClasses[size], className)}>
        {onSubmit ? (
          <form onSubmit={onSubmit} className={cn('grid gap-4', formClassName)}>
            {content}
          </form>
        ) : (
          <div className={cn('grid gap-4', formClassName)}>{content}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Alias for ActionDialog for semantic form-oriented popups */
export const FormDialog = ActionDialog;
export type FormDialogProps = ActionDialogProps;
