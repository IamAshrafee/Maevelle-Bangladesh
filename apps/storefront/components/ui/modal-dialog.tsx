'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './button';

/** Native modality and focus restoration for multi-control workflows at every width. */
export function ModalDialog({
  open,
  title,
  description,
  children,
  onClose,
  fallbackFocusSelector,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  onClose(): void;
  fallbackFocusSelector?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(),
    descriptionId = useId();
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      queueMicrotask(() => {
        if (
          !document.querySelector('dialog[open]') &&
          previous instanceof HTMLElement &&
          previous.isConnected
        )
          previous.focus({ preventScroll: true });
        else if (!document.querySelector('dialog[open]') && fallbackFocusSelector)
          [...document.querySelectorAll<HTMLElement>(fallbackFocusSelector)]
            .find((e) => e.getClientRects().length)
            ?.focus({ preventScroll: true });
      });
    };
  }, [open, fallbackFocusSelector]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="fixed inset-0 m-auto max-h-dvh w-full max-w-lg overflow-y-auto wrap-anywhere rounded-2xl border border-border bg-surface-container-lowest p-4 text-on-surface shadow-modal backdrop:bg-scrim sm:w-11/12 sm:p-6"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
          ),
        ].filter((control) => control.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h2
          id={titleId}
          className="min-w-[min(100%,12rem)] flex-1 break-words text-heading-sm font-semibold"
        >
          {title}
        </h2>
        <Button
          className="min-w-0 max-w-full"
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          Close
        </Button>
      </header>
      {description ? (
        <div id={descriptionId} className="mt-3 text-body-sm text-on-surface-variant">
          {description}
        </div>
      ) : null}
      <div className="mt-4">{children}</div>
    </dialog>
  );
}
