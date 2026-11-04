'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CheckoutSourceDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { checkoutPreviewEnabled } from '../availability';
import { reviewIssue } from '../foundation-errors';

export function CheckoutEntry({
  source,
  handles = {},
  label,
  disabled = false,
  onPendingChange,
  onContinue,
}: {
  source: CheckoutSourceDto | null;
  handles?: Readonly<Record<string, string>>;
  label: 'Buy now' | 'Checkout';
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onContinue?: () => void;
}) {
  const router = useRouter(),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function begin() {
    if (lock.current || !source || disabled || !checkoutPreviewEnabled) return;
    lock.current = true;
    setBusy(true);
    onPendingChange?.(true);
    setMessage('');
    try {
      const { startReview } = await import('../foundation-runtime');
      await startReview(source, handles);
      onContinue?.();
      router.push('/checkout');
    } catch (error) {
      setMessage(reviewIssue(error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      onPendingChange?.(false);
    }
  }
  return (
    <div className="min-w-0 space-y-2">
      <Button
        variant="outline"
        fullWidth
        disabled={!checkoutPreviewEnabled || disabled || !source}
        loading={busy}
        onClick={() => void begin()}
      >
        {checkoutPreviewEnabled ? `${label} · Review preview` : label}
      </Button>
      <p role="status" aria-live="polite" className="text-sm text-on-surface-variant">
        {message ||
          (checkoutPreviewEnabled
            ? 'Development review only. Ordering is unavailable.'
            : 'Online checkout is currently unavailable.')}
      </p>
      {message && checkoutPreviewEnabled && (
        <Button variant="ghost" onClick={() => router.push('/checkout')}>
          Recover review
        </Button>
      )}
    </div>
  );
}
