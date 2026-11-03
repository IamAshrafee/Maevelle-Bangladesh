'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { currentCommerceConsent, saveCommerceConsent } from '@/lib/analytics/consent';

export function AnalyticsConsent() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(currentCommerceConsent().analytics === 'UNKNOWN');
    const reopen = () => setOpen(true);
    window.addEventListener('maevelle:open-consent', reopen);
    return () => window.removeEventListener('maevelle:open-consent', reopen);
  }, []);
  if (!open) return null;
  return (
    <aside
      aria-label="Analytics preference"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-lg rounded-xl border border-border bg-surface-container-lowest p-4 shadow-lg md:bottom-4"
    >
      <p className="text-sm font-semibold text-on-surface">Help us improve Maevelle</p>
      <p className="mt-1 text-sm text-on-surface-variant">
        May we count interactions with products, your Wishlist, and your shopping bag to improve
        Maevelle? Your choice does not affect shopping.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            saveCommerceConsent('GRANTED');
            setOpen(false);
          }}
        >
          Allow analytics
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            saveCommerceConsent('DENIED');
            setOpen(false);
          }}
        >
          No thanks
        </Button>
      </div>
    </aside>
  );
}
