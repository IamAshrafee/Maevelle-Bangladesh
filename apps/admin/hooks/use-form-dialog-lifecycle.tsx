'use client';

import * as React from 'react';
import type { DialogRoot } from '@base-ui/react/dialog';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface UseFormDialogLifecycleOptions {
  /** Optional open state for external sync */
  readonly open?: boolean | undefined;
  /** Whether the form has unsaved modifications */
  readonly isDirty?: boolean | undefined;
  /** Whether a network mutation is currently in-flight */
  readonly isSubmitting?: boolean | undefined;
  /** Authoritative callback invoked when the dialog is actually dismissed */
  readonly onClose?: (() => void) | undefined;
  /** Direct callback for onOpenChange patterns */
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  /** Title for the unsaved changes warning dialog */
  readonly confirmTitle?: string | undefined;
  /** Alias for confirmTitle */
  readonly title?: string | undefined;
  /** Descriptive message explaining the discard consequence */
  readonly confirmDescription?: string | undefined;
  /** Alias for confirmDescription */
  readonly description?: string | undefined;
}

export interface UseFormDialogLifecycleReturn {
  /**
   * Drop-in handler for Base UI's `Dialog.Root` / `Sheet.Root` `onOpenChange`.
   * Intercepts backdrop clicks, Escape keys, and gesture dismissals via `details.cancel()`.
   */
  readonly handleOpenChange: (nextOpen: boolean, details?: DialogRoot.ChangeEventDetails) => void;
  /** Whether the discard confirmation alert dialog is currently open */
  readonly isDiscardPromptOpen: boolean;
  /** Explicitly confirms discard, unmounting the dialog and clearing dirty state */
  readonly handleConfirmDiscard: () => void;
  /** Cancels the discard prompt, keeping the user in the form without losing data */
  readonly handleCancelDiscard: () => void;
  /** Pre-composed accessible Alert Dialog to render alongside your form */
  readonly discardConfirmDialog: React.ReactNode;
}

/**
 * Production lifecycle hook for Base UI form dialogs and sheets in Maevelle Admin.
 *
 * Guarantees:
 * 1. Blocks dismissal while an API submission is in-flight (`isSubmitting === true`).
 * 2. Intercepts backdrop clicks, Escape key presses, and swipe dismissals when form fields
 *    are modified (`isDirty === true`) using Base UI's native `details.cancel()`.
 * 3. Restores user focus and clean modal state upon confirmed discard.
 */
export function useFormDialogLifecycle({
  isDirty = false,
  isSubmitting = false,
  onClose,
  onOpenChange,
  confirmTitle,
  title,
  confirmDescription,
  description,
}: UseFormDialogLifecycleOptions): UseFormDialogLifecycleReturn {
  const [isDiscardPromptOpen, setIsDiscardPromptOpen] = React.useState(false);

  const resolvedTitle = confirmTitle ?? title ?? 'Discard unsaved changes?';
  const resolvedDescription =
    confirmDescription ??
    description ??
    'You have unsaved changes in this form. If you close it now, your entered information will be discarded.';

  const triggerClose = React.useCallback(() => {
    onClose?.();
    onOpenChange?.(false);
  }, [onClose, onOpenChange]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean, details?: DialogRoot.ChangeEventDetails) => {
      // Allow opening without intervention
      if (nextOpen) {
        onOpenChange?.(true);
        return;
      }

      // 1. Lock dismissal while mutation is in-flight
      if (isSubmitting) {
        details?.cancel?.();
        return;
      }

      // 2. Intercept close event if form has uncommitted changes
      if (isDirty) {
        details?.cancel?.();
        setIsDiscardPromptOpen(true);
        return;
      }

      // 3. Clean close
      triggerClose();
    },
    [isDirty, isSubmitting, onOpenChange, triggerClose],
  );

  const handleConfirmDiscard = React.useCallback(() => {
    setIsDiscardPromptOpen(false);
    triggerClose();
  }, [triggerClose]);

  const handleCancelDiscard = React.useCallback(() => {
    setIsDiscardPromptOpen(false);
  }, []);

  const discardConfirmDialog = (
    <AlertDialog
      open={isDiscardPromptOpen}
      onOpenChange={(open) => {
        if (!open) handleCancelDiscard();
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{resolvedTitle}</AlertDialogTitle>
          <AlertDialogDescription>{resolvedDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancelDiscard}>Keep editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleConfirmDiscard}>
            Discard &amp; close
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    handleOpenChange,
    isDiscardPromptOpen,
    handleConfirmDiscard,
    handleCancelDiscard,
    discardConfirmDialog,
  };
}
