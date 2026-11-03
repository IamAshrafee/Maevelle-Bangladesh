'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './button';

/** Native modality provides focus containment, Escape and inert background across sizes. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmDisabled = false,
  onConfirm,
  onClose,
  variant = 'danger',
  fallbackFocusId,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm(): Promise<unknown>;
  onClose(): void;
  variant?: ButtonVariant;
  fallbackFocusId?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const titleId = useId(),
    descriptionId = useId();
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement;
    element.showModal();
    cancel.current?.focus();
    return () => {
      element.close();
      queueMicrotask(() => {
        if (document.querySelector('dialog[open]')) return;
        if (
          previous instanceof HTMLElement &&
          previous.isConnected &&
          previous !== document.body &&
          previous !== document.documentElement
        )
          previous.focus();
        else if (fallbackFocusId) document.getElementById(fallbackFocusId)?.focus();
      });
    };
  }, [open, fallbackFocusId]);
  async function confirm() {
    if (busy || confirmDisabled) return;
    setBusy(true);
    try {
      await onConfirm();
    } catch {
      /* Domain feedback retains the failure and recovery instructions. */
    } finally {
      setBusy(false);
      onClose();
    }
  }
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      aria-busy={busy || undefined}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
          ),
        ].filter((element) => element.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (!first) {
          event.preventDefault();
          event.currentTarget.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === event.currentTarget)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-0 m-auto max-h-dvh w-11/12 max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface-container-lowest p-6 text-on-surface shadow-modal backdrop:bg-scrim"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 className="text-heading-sm font-semibold" id={titleId}>
        {title}
      </h2>
      <div className="mt-3 break-words text-body-md text-on-surface-variant" id={descriptionId}>
        {children}
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="outline" ref={cancel} disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={variant}
          loading={busy}
          disabled={confirmDisabled}
          loadingLabel="Please wait"
          onClick={() => void confirm()}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
