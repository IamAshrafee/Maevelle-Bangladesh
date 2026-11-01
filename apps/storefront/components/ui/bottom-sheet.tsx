'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/components/ui/classnames';
import { IconButton } from '@/components/ui/icon-button';
import { CloseIcon } from '@/components/ui/icons';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

export function BottomSheet({ isOpen, onClose, title, subtitle, children }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) dialog.showModal();
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    if (!dialog.open) return;
    const timer = window.setTimeout(() => dialog.close(), 260);
    return () => window.clearTimeout(timer);
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [isOpen]);
  return <dialog
    aria-label={title}
    className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-on-surface backdrop:bg-transparent lg:hidden"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    ref={dialogRef}
  >
    <div aria-hidden="true" className={cx('absolute inset-0 bg-scrim transition-opacity duration-300 motion-reduce:transition-none', visible ? 'opacity-100' : 'opacity-0')} />
    <section className={cx(
      'absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface-container-lowest shadow-2xl',
      'transition-transform duration-300 ease-maevelle motion-reduce:transition-none',
      visible ? 'translate-y-0' : 'translate-y-full',
    )}>
      <div aria-hidden="true" className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-surface-container-highest" />
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-6">
        <div className="min-w-0"><h2 className="font-serif text-2xl font-semibold leading-tight text-primary">{title}</h2>{subtitle ? <div className="mt-0.5 font-label-sm text-xs text-on-surface-variant">{subtitle}</div> : null}</div>
        <IconButton aria-label={`Close ${title}`} onClick={onClose} variant="ghost"><CloseIcon size={20} /></IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface pb-safe">{children}</div>
    </section>
  </dialog>;
}
